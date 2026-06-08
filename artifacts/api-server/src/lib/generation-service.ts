import { db, projectsTable, projectFilesTable, eq } from "@workspace/db";
import {
  streamAI,
  DEFAULT_MODELS,
  type Provider,
} from "./ai-client";
import {
  runAccuracyValidation,
  collectRepairTargets,
  runRepairPass,
  runLivePreviewGeneration,
  mergeFiles,
  detectAmbiguityAndAskQuestions,
  buildEnrichedPrompt,
} from "./ai-pipeline";
import { normalizeIosProject } from "./xcode-scaffold";
import { evaluateQuality, type QualityReport } from "./quality-scorer";
import { recordGenerationRun, recordProjectRevision } from "./generation-history";
import { incrementUsage } from "../middleware/quota";
import { IOS_QUALITY_STANDARDS } from "./ios-quality-standards";
import { PATTERN_MENU, getSelectedPatterns } from "./component-library";
import { getStylePreset } from "./style-presets";
import { logger } from "./logger";
import type { ArchitecturePlan, SpmDependency, AccuracyReport } from "./types";
import type { SendEvent, ReqLogger, PlanningParams, CodeGenerationParams } from "./generation-types";
import type { Response } from "express";

/**
 * GenerationService encapsulates the AI-driven planning and code generation
 * orchestration logic. Route handlers delegate to this class, providing only
 * the SSE sendEvent callback and minimal request context.
 */
export class GenerationService {
  // ── Clarification check ─────────────────────────────────────────────────

  async detectClarifications(
    prompt: string,
    frameworkName: string,
    provider: Provider,
  ): Promise<{ needsClarification: boolean; questions: Array<{ id: string; question: string; suggestion?: string }> }> {
    try {
      return await detectAmbiguityAndAskQuestions(prompt, frameworkName, provider);
    } catch {
      return { needsClarification: false, questions: [] };
    }
  }

  // ── Build enriched prompt from clarification answers ────────────────────

  buildEnrichedPrompt(
    originalPrompt: string,
    answers: Array<{ id: string; question: string; answer: string }>,
  ): string {
    return buildEnrichedPrompt(originalPrompt, answers);
  }

  // ── Planning phase ──────────────────────────────────────────────────────

  async runPlanningPhase(
    res: Response,
    sendEvent: SendEvent,
    reqLog: ReqLogger,
    params: PlanningParams,
  ): Promise<void> {
    const {
      projectId,
      promptForPlanning,
      projectName,
      frameworkName,
      additionalContext,
      provider,
      stylePresetId,
    } = params;

    const contextBlock = additionalContext
      ? `\nAdditional context from the user: ${additionalContext}`
      : "";

    const styleBlock = (() => {
      if (!stylePresetId) return "";
      const preset = getStylePreset(stylePresetId);
      if (!preset) return "";
      return `\n\n═══ STYLE PRESET: ${preset.name.toUpperCase()} ═══
The user has selected the "${preset.name}" visual style. Apply these design guidelines throughout:
- Color Palette: ${preset.colorPalette}
- Typography: ${preset.typographyStyle}
- Animations: ${preset.animationStyle}
- Component Style: ${preset.componentStyle}
Ensure the Theme.swift / DesignSystem reflects this preset's visual identity.\n`;
    })();

    sendEvent({ type: "planning", message: "Designing architecture..." });

    const planningSystemPrompt = this.buildPlanningSystemPrompt(frameworkName, styleBlock);

    const planningUserMessage = `Plan the architecture for this iOS ${frameworkName} app:

App name: ${projectName}
Description: ${promptForPlanning}${contextBlock}

Produce the JSON architecture plan now.`;

    const models = DEFAULT_MODELS[provider];
    const planStream = streamAI({
      provider,
      model: models.planner,
      system: planningSystemPrompt,
      userMessage: planningUserMessage,
      maxTokens: 4096,
    });

    let planRaw = "";
    for await (const chunk of planStream) {
      if (chunk.content) {
        planRaw += chunk.content;
        sendEvent({ type: "planning_chunk", chunk: chunk.content });
      }
    }

    let architecturePlan: ArchitecturePlan;
    try {
      const jsonMatch = planRaw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in planning response");
      const candidate = JSON.parse(jsonMatch[0]) as ArchitecturePlan;
      if (!Array.isArray(candidate.screens) || !Array.isArray(candidate.models)) {
        throw new Error("Plan JSON missing required screens/models arrays");
      }
      architecturePlan = {
        screens: candidate.screens,
        models: candidate.models,
        navigation: typeof candidate.navigation === "string" ? candidate.navigation : "",
        spmDependencies: Array.isArray(candidate.spmDependencies) ? candidate.spmDependencies : [],
        fileList: Array.isArray(candidate.fileList) ? candidate.fileList : [],
        componentPatterns: Array.isArray(candidate.componentPatterns) ? candidate.componentPatterns : [],
      };
    } catch (planParseErr) {
      reqLog.error({ planParseErr }, "Failed to parse architecture plan — aborting generation");
      await db
        .update(projectsTable)
        .set({ status: "error" })
        .where(eq(projectsTable.id, projectId));
      sendEvent({ type: "error", message: "Architecture planning failed — could not parse plan. Please try again." });
      res.end();
      return;
    }

    const planJson = JSON.stringify(architecturePlan);
    await db
      .update(projectsTable)
      .set({ architecturePlan: planJson, status: "awaiting_approval" })
      .where(eq(projectsTable.id, projectId));

    recordProjectRevision({
      projectId,
      userId: undefined,
      revisionType: "plan",
      payload: architecturePlan,
      message: "Architecture plan generated",
    }).catch((err) => { logger.error({ err }, "Failed to record generation history"); });

    sendEvent({ type: "plan", plan: architecturePlan });
    sendEvent({ type: "awaiting_approval", plan: architecturePlan });
    res.end();
  }

  // ── Code generation (approve-plan) ──────────────────────────────────────

  async runCodeGeneration(
    res: Response,
    sendEvent: SendEvent,
    reqLog: ReqLogger,
    params: CodeGenerationParams,
  ): Promise<void> {
    const { projectId, approvedPlan, additionalContext, provider, userId } = params;

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));

    if (!project) {
      sendEvent({ type: "error", message: "Project not found" });
      res.end();
      return;
    }

    const frameworkName = project.framework === "swiftui" ? "SwiftUI" : "UIKit";
    const contextBlock = additionalContext
      ? `\nAdditional context from the user: ${additionalContext}`
      : "";

    sendEvent({ type: "building", message: "Synthesizing source code..." });

    const rawTarget = project.name.replace(/[^a-zA-Z0-9]/g, "");
    const appTargetName = rawTarget.length === 0
      ? "App"
      : /^[0-9]/.test(rawTarget)
        ? `App${rawTarget}`
        : rawTarget;

    const validDeps = this.sanitizeDependencies(approvedPlan.spmDependencies ?? []);

    const systemPrompt = this.buildCodeGenSystemPrompt(
      frameworkName,
      appTargetName,
      approvedPlan,
      validDeps,
    );

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${project.enrichedPrompt ?? project.prompt}${contextBlock}

App name: ${project.name}
Target name: ${appTargetName}

Generate Swift sources only. Place every file under ${appTargetName}/. Always include ${appTargetName}App.swift as the @main entry point.`;

    const models = DEFAULT_MODELS[provider];
    const stream = streamAI({
      provider,
      model: models.engineer,
      system: systemPrompt,
      userMessage,
      maxTokens: 65536,
      responseFormat: "json",
      timeoutMs: 300_000,
    });

    let fullResponse = "";
    let chunkCount = 0;
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content;
        chunkCount++;
        if (chunkCount % 20 === 0) {
          sendEvent({ type: "progress", message: "Generating code..." });
        }
      }
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    sendEvent({ type: "parsing", message: "Parsing generated files..." });

    let parsed: { files: Array<{ filename: string; filepath: string; content: string; language: string }>; description?: string };
    try {
      parsed = this.parseCodeGenResponse(fullResponse, finishReason);
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : "unknown parse error";
      const truncated = finishReason === "length";
      reqLog.error(
        { parseErr: message, finishReason, responseLength: fullResponse.length, head: fullResponse.slice(0, 400) },
        "Failed to parse AI response",
      );
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, projectId));
      sendEvent({
        type: "error",
        message: truncated
          ? "Code generation hit the model's output limit before finishing. Try a smaller plan or split features across screens."
          : `Failed to parse generated code: ${message}`,
      });
      res.end();
      return;
    }

    const normalizedFiles = normalizeIosProject(
      parsed.files,
      appTargetName,
      project.name,
      validDeps,
    );
    reqLog.info?.({ fileCount: normalizedFiles.length, target: appTargetName }, "iOS project normalized");

    const hasSwiftSource = normalizedFiles.some(
      f => f.filename.endsWith(".swift") && f.filename !== "Package.swift",
    );
    if (!hasSwiftSource) {
      reqLog.error("No Swift source files in normalized output — aborting");
      await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, projectId));
      sendEvent({ type: "error", message: "Code generation produced no Swift source files. Please try again." });
      res.end();
      return;
    }

    await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));

    const filesToInsert = normalizedFiles.map((f) => ({
      projectId,
      filename: f.filename,
      filepath: f.filepath,
      content: f.content,
      language: f.language || "swift",
    }));

    if (filesToInsert.length > 0) {
      await db.insert(projectFilesTable).values(filesToInsert);
    }

    await db
      .update(projectsTable)
      .set({ fileCount: filesToInsert.length })
      .where(eq(projectsTable.id, projectId));

    // ── Validation pass ─────────────────────────────────────────────────────
    sendEvent({ type: "validating", message: "Checking output against the plan..." });
    const promptForValidation = project.enrichedPrompt ?? project.prompt;
    let finalFileCount = filesToInsert.length;
    let report = await runAccuracyValidation(
      reqLog,
      promptForValidation,
      approvedPlan,
      filesToInsert.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
      provider,
    );
    sendEvent({ type: "accuracy_report", report });

    const repairHistory: Array<{ at: string; targets: string[]; before: AccuracyReport; after: AccuracyReport }> = [];

    // ── Single repair pass if issues found ──────────────────────────────────
    const repairTargets = collectRepairTargets(report);
    if (repairTargets.length > 0) {
      const repairResult = await this.runRepairPhase(
        reqLog,
        sendEvent,
        projectId,
        appTargetName,
        frameworkName,
        promptForValidation,
        approvedPlan,
        filesToInsert,
        repairTargets,
        report,
        project.name,
        validDeps,
        provider,
      );
      if (repairResult) {
        report = repairResult.report;
        finalFileCount = repairResult.finalFileCount;
        repairHistory.push(...repairResult.history);
      }
    }

    // ── Live preview generation ─────────────────────────────────────────────
    sendEvent({ type: "preview_generating", message: "Rendering live preview..." });
    let livePreviewHtml: string | null = null;
    try {
      const finalFiles = await db
        .select()
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      livePreviewHtml = await runLivePreviewGeneration(
        reqLog,
        project.name,
        promptForValidation,
        approvedPlan,
        finalFiles.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
        provider,
      );
    } catch (previewErr) {
      reqLog.error({ previewErr }, "Live preview generation threw");
    }

    // ── Quality scoring (6-dimension evaluation) ──────────────────────────────
    sendEvent({ type: "quality_scoring", message: "Evaluating visual quality..." });
    let qualityReport: QualityReport | null = null;
    try {
      const finalFilesForQuality = await db
        .select()
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      qualityReport = await evaluateQuality(
        reqLog,
        approvedPlan,
        finalFilesForQuality.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
        livePreviewHtml,
        provider,
      );
      if (qualityReport) {
        sendEvent({ type: "quality_report", report: qualityReport });
      }
    } catch (qualityErr) {
      reqLog.error({ qualityErr }, "Quality scoring failed (non-fatal)");
    }

    // ── Increment usage for authenticated users ─────────────────────────────
    if (userId) {
      try {
        await incrementUsage(userId);
      } catch { /* non-fatal */ }
    }

    await db
      .update(projectsTable)
      .set({
        status: "complete",
        description: parsed.description ?? null,
        accuracyReport: JSON.stringify(report),
        repairHistory: JSON.stringify(repairHistory),
        livePreviewHtml,
        qualityReport: qualityReport ? JSON.stringify(qualityReport) : null,
      })
      .where(eq(projectsTable.id, projectId));

    sendEvent({ type: "preview_ready", available: !!livePreviewHtml });
    sendEvent({
      type: "complete",
      done: true,
      fileCount: finalFileCount,
      description: parsed.description,
      accuracyReport: report,
      repairHistory,
      previewAvailable: !!livePreviewHtml,
      qualityReport,
    });

    // Record successful build revision and generation run
    recordProjectRevision({
      projectId,
      userId,
      revisionType: "build",
      payload: { fileCount: finalFileCount, description: parsed.description, accuracyScore: report?.overallScore },
      message: "Code generation completed",
    }).catch((err) => { logger.error({ err }, "Failed to record generation history"); });
    recordGenerationRun({
      projectId,
      userId,
      status: "completed",
      provider,
    }).catch((err) => { logger.error({ err }, "Failed to record generation history"); });

    res.end();
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async runRepairPhase(
    reqLog: ReqLogger,
    sendEvent: SendEvent,
    projectId: number,
    appTargetName: string,
    frameworkName: string,
    promptForValidation: string,
    approvedPlan: ArchitecturePlan,
    filesToInsert: Array<{ projectId: number; filename: string; filepath: string; content: string; language: string }>,
    repairTargets: string[],
    currentReport: AccuracyReport,
    projectName: string,
    validDeps: SpmDependency[],
    provider: Provider,
  ): Promise<{ report: AccuracyReport; finalFileCount: number; history: Array<{ at: string; targets: string[]; before: AccuracyReport; after: AccuracyReport }> } | null> {
    sendEvent({ type: "repairing", message: "Regenerating off-spec or missing files...", targets: repairTargets });
    const history: Array<{ at: string; targets: string[]; before: AccuracyReport; after: AccuracyReport }> = [];

    try {
      const repaired = await runRepairPass(
        reqLog,
        appTargetName,
        frameworkName,
        promptForValidation,
        approvedPlan,
        filesToInsert.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content, language: f.language })),
        repairTargets,
        provider,
      );
      if (repaired.length > 0) {
        const proposed = mergeFiles(filesToInsert, repaired);
        const renormalized = normalizeIosProject(
          proposed.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content, language: f.language })),
          appTargetName,
          projectName,
          validDeps,
        );
        const before = currentReport;
        const proposedReport = await runAccuracyValidation(
          reqLog,
          promptForValidation,
          approvedPlan,
          renormalized.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content })),
          provider,
        );

        const SCORE_TOLERANCE = 2;
        const accepted = proposedReport.overallScore >= before.overallScore - SCORE_TOLERANCE;

        if (accepted) {
          await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
          const newRows = renormalized.map(f => ({
            projectId,
            filename: f.filename,
            filepath: f.filepath,
            content: f.content,
            language: f.language || "swift",
          }));
          if (newRows.length > 0) {
            await db.insert(projectFilesTable).values(newRows);
          }
          await db
            .update(projectsTable)
            .set({ fileCount: newRows.length })
            .where(eq(projectsTable.id, projectId));

          history.push({
            at: new Date().toISOString(),
            targets: repairTargets,
            before,
            after: proposedReport,
          });
          sendEvent({ type: "repair_complete", report: proposedReport, history });
          return { report: proposedReport, finalFileCount: newRows.length, history };
        } else {
          reqLog.info?.(
            { beforeScore: before.overallScore, afterScore: proposedReport.overallScore, targets: repairTargets },
            "Repair pass rejected — score regression beyond tolerance; keeping original files",
          );
          sendEvent({
            type: "repair_rejected",
            message: `Repair rolled back (score would drop ${before.overallScore} → ${proposedReport.overallScore}); keeping original files.`,
            beforeScore: before.overallScore,
            afterScore: proposedReport.overallScore,
          });
          history.push({
            at: new Date().toISOString(),
            targets: repairTargets,
            before,
            after: before,
          });
          sendEvent({ type: "repair_complete", report: before, history });
          return { report: before, finalFileCount: filesToInsert.length, history };
        }
      }
    } catch (repairErr) {
      reqLog.error({ repairErr }, "Repair pass failed; continuing with original output");
    }
    return null;
  }

  private sanitizeDependencies(deps: SpmDependency[]): SpmDependency[] {
    return deps
      .filter(
        (d) => d && typeof d.url === "string" && typeof d.packageName === "string" &&
             Array.isArray(d.productNames) && typeof d.version === "string",
      )
      .map((d) => ({
        url: d.url.replace(/[`"\\]/g, ""),
        packageName: d.packageName.replace(/[^a-zA-Z0-9_-]/g, ""),
        productNames: d.productNames
          .filter((p): p is string => typeof p === "string")
          .map(p => p.replace(/[^a-zA-Z0-9_-]/g, "")),
        version: d.version.replace(/[^0-9.]/g, "") || "1.0.0",
      }))
      .filter(d => d.url.length > 0 && d.packageName.length > 0 && d.productNames.length > 0);
  }

  private parseCodeGenResponse(
    fullResponse: string,
    finishReason: string | null,
  ): { files: Array<{ filename: string; filepath: string; content: string; language: string }>; description?: string } {
    let jsonText = fullResponse.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) jsonText = fenced[1].trim();
    try {
      return JSON.parse(jsonText);
    } catch {
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace <= firstBrace) {
        throw new Error(
          finishReason === "length"
            ? "Model output was truncated before JSON closed (token cap reached)."
            : "No JSON object found in model output.",
        );
      }
      return JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
    }
  }

  private buildCodeGenSystemPrompt(
    frameworkName: string,
    appTargetName: string,
    approvedPlan: ArchitecturePlan,
    validDeps: SpmDependency[],
  ): string {
    const spmDepsBlock = validDeps.length
      ? `SPM dependencies:\n${validDeps.map(d => `  - ${d.packageName} (${d.url}) products: ${d.productNames.join(", ")} version: ${d.version}`).join("\n")}`
      : "No external SPM dependencies needed — use only Apple frameworks.";

    const planContextBlock = `
Architecture Plan (follow this exactly):
- Screens: ${approvedPlan.screens.map((s: { name: string; purpose: string }) => `${s.name} (${s.purpose})`).join(", ")}
- Data Models: ${approvedPlan.models.map((m: { name: string }) => m.name).join(", ")}
- Navigation: ${approvedPlan.navigation}
- Planned files: ${approvedPlan.fileList.map((f: { filename: string }) => f.filename).join(", ")}
${spmDepsBlock}
`;

    return `You are a principal iOS engineer at a top-tier studio (Linear, Things, Stripe, Apple Design Award caliber). You write code that looks hand-crafted, feels native, and ships to the App Store. Generate a complete, studio-grade iOS app using ${frameworkName} from the plan below.
${planContextBlock}
Output ONLY a JSON object with this exact structure:
{
  "files": [
    {
      "filename": "${appTargetName}App.swift",
      "filepath": "${appTargetName}/${appTargetName}App.swift",
      "content": "import SwiftUI\\n@main\\nstruct ${appTargetName}App: App { ... }",
      "language": "swift"
    }
  ],
  "description": "Brief description of the generated app"
}

PROJECT STRUCTURE — this is a real iOS App target (XcodeGen-generated .xcodeproj), NOT a Swift Package executable:
- All Swift sources go under ${appTargetName}/ (NO "Sources/" prefix).
- Do NOT generate Package.swift, Info.plist, project.yml, README.md, or any Assets.xcassets/Contents.json files — the build pipeline owns those.

MANDATORY content:
1. Exactly one @main App entry-point file: filename "${appTargetName}App.swift" at filepath "${appTargetName}/${appTargetName}App.swift". For SwiftUI use \`@main struct ${appTargetName}App: App { var body: some Scene { WindowGroup { RootView() } } }\` where RootView (or whatever primary screen the plan names) is the planned entry screen. For UIKit use \`@main class AppDelegate: UIResponder, UIApplicationDelegate\` plus a SceneDelegate. If the persistence layer uses SwiftData (@Model), add the required \`.modelContainer(for: [Type1.self, Type2.self])\` modifier to the WindowGroup.
2. A primary screen file (e.g. ContentView.swift) plus every screen listed in the plan.
3. Every data model file listed in the plan.
4. Every supporting file from the plan: Theme/DesignSystem, Haptics, ViewModels, Components, Store/service, Settings, Onboarding (when planned).

DESIGN SYSTEM (non-negotiable) — implement a Theme.swift file that defines:
- A cohesive color palette appropriate to the app's mood. Provide BOTH light and dark variants via \`Color(uiColor: UIColor { trait in trait.userInterfaceStyle == .dark ? darkHex : lightHex })\` or asset-catalog-style dynamic colors. Tokens at minimum: background, surface, surfaceElevated, textPrimary, textSecondary, textTertiary, accent, accentMuted, border, success, warning, danger.
- A typography scale: largeTitle, title, headline, body, callout, footnote — each with weight + tracking. Wrap them as \`Font\` extensions (e.g. \`Font.appTitle\`).
- Spacing tokens (xs:4, s:8, m:12, l:16, xl:24, xxl:32) and corner radii (sm:8, md:12, lg:16, xl:24, full:999).
- Shadow elevations (e1, e2, e3) as ViewModifiers.
- Motion curves: \`Animation.smooth\` / \`Animation.snappy\` constants for the app.
Every screen and component MUST consume Theme tokens. Hardcoded colors, fixed font sizes, raw paddings (other than 0/spacing tokens) are DISQUALIFYING.

UX QUALITY (non-negotiable):
- Every list / data-driven screen has explicit loading, empty, and error states — using bespoke EmptyStateView / LoadingView / ErrorView components from the plan, with a SF Symbol, headline, body, and (when relevant) a primary action button.
- Realistic seeded data: 5-10 varied items per list with believable names, dates, descriptions, emoji/symbols, and reasonable variation. NEVER "Item 1, Item 2".
- Persistence: when state matters across launches, persist via @AppStorage / UserDefaults JSON / SwiftData (@Model). Pick the lightest fit.
- Haptics: tap a Haptics.impact(.soft) on primary buttons, .success / .error on completions/errors. Use sparingly and meaningfully.
- Animations: use \`withAnimation(.smooth)\` on state changes; matchedGeometryEffect for hero transitions; \`.symbolEffect(.bounce)\` / \`.contentTransition(.numericText())\` (iOS 17+) where it fits. Subtle, not gimmicky.
- Accessibility: every Image/Icon-only button has \`.accessibilityLabel\`; decorative images use \`.accessibilityHidden(true)\`; text scales with Dynamic Type (no \`.fixedSize()\` on body copy); tap targets are at least 44pt.
- Settings screen uses Form with sections, includes Version (\`Bundle.main.infoDictionary\`), and a "Made with promptiOS" footer is fine.

FUNCTIONAL COMPLETENESS (DISQUALIFYING if violated — this is the most important section):
- Every function, method, and computed property MUST have a real, working implementation. Zero empty bodies. Zero "// TODO:" or "// FIXME:" comments. Zero \`fatalError()\` or \`preconditionFailure()\` stubs. If a method is called, it must do something real.
- GAME APPS — implement a complete, playable game with full rules:
  • Legal move generation: EVERY piece type must enforce its own movement rules. A chess bishop can only move diagonally; a rook only in straight lines; a knight in L-shapes. No move should be accepted unless it passes the engine's validation.
  • Special moves: for chess, implement castling (kingside + queenside), en passant, and pawn promotion. These are not optional — a chess app without them is broken.
  • Win/loss/draw detection: detect check, checkmate, stalemate, and 50-move rule (or threefold repetition) in the engine. Update game phase accordingly and show the result to the user.
  • Turn alternation: the game MUST enforce whose turn it is. Human plays white (or chosen color), computer plays the other color. After the human's move is applied, the engine automatically computes and applies the AI's response before returning control to the UI.
  • AI opponent — the computer MUST make real moves. Implement at minimum:
    - Generate all legal moves for the AI's side using the same engine that validates human moves.
    - Pick and apply a move (random legal move is acceptable as a baseline; simple piece-value minimax at depth 2 is better).
    - NEVER leave the AI's turn unimplemented ("// TODO: AI move") — this makes the game unplayable.
  • Board state: track piece positions, current turn, move history, captured pieces, en passant target, castling rights.
- PRODUCTIVITY APPS: every Create/Read/Update/Delete operation must persist to the storage layer immediately. No in-memory-only state for data the user expects to survive app restarts.
- FORMS: every submit button must read the form fields, validate them (non-empty, format), write to the store, and give feedback (success toast or inline error). No no-op handlers.
- TIMERS / COUNTDOWNS: use \`Timer.publish\` or \`Task { try await Task.sleep(...) }\` for real elapsed-time tracking — not a static label.
- SEARCH / FILTER: the filter must actually filter the data array using the search term — not display all items regardless of input.

CODE QUALITY (non-negotiable for SwiftUI):
- Use the @Observable macro (Observation framework, iOS 17+) for ViewModels — NOT @ObservableObject + @Published. Views own them with \`@State private var viewModel = HomeViewModel()\` and pass children \`@Bindable var viewModel\` when they need to mutate.
- Prefer \`NavigationStack\` (not the deprecated \`NavigationView\`).
- Pure value types for models; \`Identifiable\` + \`Hashable\` where lists need them.
- Concurrency: \`async/await\`, \`Task { ... }\`, \`@MainActor\` on UI types when needed. No completion handlers.
- File header is a one-line comment: \`// AppName/FileName.swift — purpose\`. No license blocks.
- Keep view bodies readable: extract subviews when nesting exceeds ~3 levels, and prefer many small views over giant ones.

GENERAL RULES:
- Generate 12-18 Swift files. Fewer than 10 is disqualifying. Each file should be 30-150 lines, dense and well-factored. Engine files (game logic, AI) may be longer if needed to be complete — never truncate working logic to hit a line limit.
- For UIKit: programmatic Auto Layout, no Storyboards. Same design-system + state + accessibility expectations apply (UIColor extensions, UIFont extensions, etc.).
- If the app uses Camera, Microphone, Location, Contacts, Photos, HealthKit, or any privacy-sensitive API, add a comment at the top of the relevant Swift file: \`// REQUIRES Info.plist key: NSCameraUsageDescription = "<reason>"\` (the user reads README.md for what to add).
- All filepaths must use the ${appTargetName}/ prefix (e.g. "${appTargetName}/ContentView.swift", "${appTargetName}/Components/PrimaryButton.swift").
- The code MUST compile cleanly against iOS 17+ with Xcode 15+ — no experimental APIs, no deprecated symbols.
${IOS_QUALITY_STANDARDS}
SELF-AUDIT before returning the JSON (SwiftUI projects only — skip for UIKit): scan every generated SwiftUI VIEW file for actual code usage (not occurrences inside string literals or comments) of these deprecated patterns and rewrite with modern equivalents before emitting JSON: \`ObservableObject\` / \`@Published\` / \`@StateObject\`, \`NavigationView\`, \`.navigationBarLeading\` / \`.navigationBarTrailing\`, \`.foregroundColor(\`, \`.cornerRadius(\`, \`.accentColor(\`, \`DispatchQueue.main.async\` / \`DispatchQueue.main.asyncAfter\`, \`UIScreen.main\`, \`String(format:\`, \`replacingOccurrences\`, \`PreviewProvider\`, \`.tabItem {\`, \`.font(.system(size:\`. \`UIImpactFeedbackGenerator\` / \`UINotificationFeedbackGenerator\` are allowed ONLY inside the Haptics helper file. \`Color(uiColor: UIColor { ... })\` is allowed ONLY inside the Theme/DesignSystem file.

${approvedPlan.componentPatterns?.length ? getSelectedPatterns(approvedPlan.componentPatterns) : ""}`;
  }

  private buildPlanningSystemPrompt(frameworkName: string, styleBlock: string): string {
    return `You are a senior iOS product designer and architect at a top-tier studio (think Linear, Things, Stripe, Apple Design Award winners). You design apps that look hand-crafted, feel native, and ship to the App Store. Critically, you also think like an engineer: every feature you plan must be fully implementable — not just a screen that looks good, but logic that actually works.

Given an app description, produce a concise architecture plan as a JSON object.

Output ONLY a valid JSON object with this exact structure:
{
  "screens": [
    { "name": "ScreenName", "purpose": "One-line description including the visual treatment, key states (loading/empty/error), and primary interactions" }
  ],
  "models": [
    { "name": "ModelName", "fields": ["fieldName: Type", "fieldName: Type"] }
  ],
  "navigation": "Short description of the navigation flow between screens — including the primary container (NavigationStack vs. TabView), the visual mood/design language (e.g. 'warm minimal, generous whitespace, Inter-style sans, accent #6366F1, rounded 16'), and any onboarding/settings flow.",
  "spmDependencies": [],
  "fileList": [
    { "filename": "FileName.swift", "purpose": "One-line description of the file's role and notable details" }
  ],
  "componentPatterns": ["pattern_id_1", "pattern_id_2"]
}

═══ PREMIUM COMPONENT LIBRARY ═══
Select 4-7 component patterns from the library below to include in the project.
These are production-ready SwiftUI components injected into the Engineer prompt.
Choose patterns that match the app's visual style and interaction needs.

Available patterns:
${PATTERN_MENU}

═══ DOMAIN-SPECIFIC ENGINE FILES (mandatory for complex domains) ═══

GAMES — first decide which subtype, then plan the corresponding files:

  (a) TWO-PLAYER vs CPU games (chess, checkers, tic-tac-toe, reversi, Connect Four, Go, dots-and-boxes, simple card games where the user plays AGAINST the device):
  - MUST include a "GameEngine.swift" (or domain-specific name like "ChessEngine.swift") that owns ALL game rules: legal move generation, move validation, win/loss/draw detection, board state, and turn management. This is the most important file — plan it explicitly with a clear purpose note.
  - MUST include an "AIPlayer.swift" (or "ComputerPlayer.swift") that makes real moves for the opponent. Random-legal-move is acceptable; minimax is better. The opponent MUST actually respond on every turn.
  - MUST include a "GameViewModel.swift" that wires the engine to the UI: handles user input, calls engine for legal-move checking, triggers AI moves after the human plays, and drives state updates.
  - Plan models that represent the complete game state (board, piece positions, current turn, captured pieces, move history, game phase: playing/check/checkmate/stalemate/draw).

  (b) SINGLE-PLAYER arcade / puzzle / endless games (bubble shooter, sudoku, tetris, breakout, snake, 2048, minesweeper, match-3, runner, idle, solitaire-against-deck): NO AIPlayer.swift — there is no opponent. Instead require:
  - A "GameEngine.swift" (or domain-specific) that owns the COMPLETE simulation: board/grid state, piece spawning, legal-action validation, scoring, level progression, and lose/win conditions (e.g. ceiling reached, board cleared, no moves left, time up).
  - A "GameViewModel.swift" that drives the loop: handles user input (tap/drag/swipe), advances simulation tick, updates score, detects game-over, and triggers the results screen.
  - For real-time games, also a "GameLoopService.swift" using \`Timer.publish\` or \`Task { try await Task.sleep(...) }\` to drive frame updates — never a static placeholder.
  - Plan models for the complete simulation state (board cells, falling/active piece, score, level, lives, game phase: playing/paused/gameOver).
  - DO NOT plan an AIPlayer file — flag it as a mistake if you catch yourself adding one.

PRODUCTIVITY / DATA APPS (todo, notes, journal, habit, finance, calendar):
- MUST include a real persistence layer file (SwiftData @Model or UserDefaults JSON store). Plan it explicitly.
- MUST include a service/repository file for CRUD operations. Views must never write to storage directly.

REAL-TIME / SENSOR APPS (fitness, location, timer, audio):
- MUST include a service file that owns the sensor/timer loop using Combine or async streams.

═══ STANDARD STUDIO-GRADE FILES (always required) ═══
- A design-system file (e.g. "Theme.swift" or "DesignSystem.swift") that defines the app's color palette, typography scale, spacing tokens, corner radii, shadow elevations, and motion curves. Every other view will read from it — no hardcoded colors or font sizes anywhere.
- A "Haptics.swift" helper that wraps UIImpactFeedbackGenerator / UINotificationFeedbackGenerator for standardized tactile feedback on key interactions.
- One "ViewModel" file per stateful screen (e.g. "HomeViewModel.swift") using the @Observable macro (iOS 17+). Pure SwiftUI views consume them via @State / @Bindable.
- A "Components/" folder of 2-4 reusable view files (e.g. "PrimaryButton.swift", "Card.swift", "EmptyStateView.swift", "LoadingView.swift", "ErrorView.swift") that the screens compose. Empty / loading / error states are first-class — every list-style screen must have all three.
- A persistence/service layer when the app has state worth keeping across launches: a "Store.swift" or service file using @AppStorage, UserDefaults, or SwiftData. Choose the lightest option that fits.
- A "SettingsView.swift" screen with About, Version (read from Bundle), and any user-facing toggles (e.g. dark-mode override, units, notifications).
- An onboarding/welcome screen ("OnboardingView.swift") whenever the app benefits from a first-launch introduction (most apps with state do).

Other rules:
- screens.purpose and fileList.purpose should be specific and visually-grounded ("Hero card with current city, glassy translucent header, hourly scroll strip below" — not "shows weather"). For engine files, be explicit: "ChessEngine.swift — complete move generation for all piece types, check/checkmate/stalemate detection, en passant, castling, promotion".
- Aim for 12-18 Swift files total. Fewer than 10 is almost never enough for studio-grade.
- spmDependencies must be an array of objects. Each object must include ALL of these fields:
    "url": the full GitHub URL of the Swift package (e.g. "https://github.com/Alamofire/Alamofire")
    "packageName": the Swift package identity (e.g. "Alamofire")
    "productNames": array of exact product names to link (e.g. ["Alamofire"])
    "version": the minimum version to require (e.g. "5.0.0")
  Leave spmDependencies as an empty array [] if the standard Apple frameworks suffice — which is almost always the case.
- fileList must include all Swift source files only (do NOT list Package.swift, Info.plist, project.yml, README, or Assets.xcassets — those are auto-generated by the build pipeline).
- Always include a single @main entry-point Swift file in fileList. For SwiftUI: a file ending in "App.swift" containing \`@main struct ...App: App\`. For UIKit: an "AppDelegate.swift" file (UIApplicationDelegate) plus a "SceneDelegate.swift" file.
- Do not add markdown or any text outside the JSON object.
${IOS_QUALITY_STANDARDS}
When writing each fileList[].purpose, name the SPECIFIC modern APIs the file will use (e.g. "Uses @Observable + @MainActor; NavigationStack with navigationDestination(for:); ContentUnavailableView for empty state") so the synthesizer cannot fall back to deprecated patterns.${styleBlock}`;
  }
}

/** Singleton instance for route handlers. */
export const generationService = new GenerationService();
