import { BaseGenerator, type GeneratorContext, type GeneratorResult } from "./base-generator";
import {
  streamAI,
  DEFAULT_MODELS,
} from "../ai-client";
import { normalizeIosProject } from "../xcode-scaffold";
import { IOS_QUALITY_STANDARDS } from "../ios-quality-standards";
import { getSelectedPatterns } from "../component-library";
import { extractJsonWithMeta, tryExtractJson } from "../json-extract";
import type { ArchitecturePlan, SpmDependency } from "../types";

type CodeGenPayload = {
  files: Array<{ filename: string; filepath: string; content: string; language: string }>;
  description?: string;
};

/**
 * iOS generator supporting both SwiftUI and UIKit targets.
 * Extracts iOS-specific prompt construction, AI streaming, and response parsing
 * from the former monolithic GenerationService.
 */
export class IosGenerator extends BaseGenerator {
  readonly target: string;

  constructor(target: "ios_swiftui" | "ios_uikit") {
    super();
    this.target = target;
  }

  validate(plan: ArchitecturePlan): string[] {
    const errors: string[] = [];
    if (!Array.isArray(plan.screens) || plan.screens.length === 0) {
      errors.push("Plan must include at least one screen.");
    }
    if (!Array.isArray(plan.models) || plan.models.length === 0) {
      errors.push("Plan must include at least one data model.");
    }
    if (!Array.isArray(plan.fileList) || plan.fileList.length === 0) {
      errors.push("Plan must include a fileList.");
    }
    return errors;
  }

  async generate(context: GeneratorContext): Promise<GeneratorResult> {
    const { projectName, approvedPlan, additionalContext, provider, sendEvent } = context;

    const frameworkName = this.target === "ios_swiftui" ? "SwiftUI" : "UIKit";

    sendEvent({ type: "building", message: "Synthesizing source code..." });

    const rawTarget = projectName.replace(/[^a-zA-Z0-9]/g, "");
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

    const prompt = context.prompt;
    const contextBlock = additionalContext
      ? `\nAdditional context from the user: ${additionalContext}`
      : "";

    const userMessage = `Create a complete iOS ${frameworkName} app for: ${prompt}${contextBlock}

App name: ${projectName}
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
    let totalContentLength = 0;

    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content;
        totalContentLength += chunk.content.length;
        chunkCount++;
        if (chunkCount % 20 === 0) {
          sendEvent({ type: "progress", message: "Generating code..." });
        }
      }
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    // When the model hits the output token cap, ask it to continue from where
    // it stopped (up to twice) instead of failing the whole generation.
    let continuations = 0;
    while (
      finishReason === "length" &&
      continuations < 2 &&
      tryExtractJson<CodeGenPayload>(fullResponse, { repair: false }) === null
    ) {
      continuations++;
      sendEvent({ type: "progress", message: `Output hit the token limit — continuing generation (pass ${continuations})...` });
      const contStream = streamAI({
        provider,
        model: models.engineer,
        system: systemPrompt,
        userMessage,
        maxTokens: 65536,
        timeoutMs: 300_000,
        extraMessages: [
          { role: "assistant", content: fullResponse },
          {
            role: "user",
            content:
              "Your previous response was cut off by the output token limit. Continue EXACTLY from the last character you emitted, outputting only the remaining text needed to complete the same JSON object. Do not repeat anything already sent, do not restart the JSON, and do not add commentary or markdown fences.",
          },
        ],
      });
      finishReason = null;
      let continuation = "";
      for await (const chunk of contStream) {
        if (chunk.content) {
          continuation += chunk.content;
          totalContentLength += chunk.content.length;
        }
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
      // Some models restart with a fence despite instructions — strip it.
      fullResponse += continuation.replace(/^\s*```(?:json)?\s*/i, "");
    }

    sendEvent({ type: "parsing", message: "Parsing generated files..." });

    const parsed = this.parseCodeGenResponse(fullResponse, finishReason);

    const normalizedFiles = normalizeIosProject(
      parsed.files,
      appTargetName,
      projectName,
      validDeps,
    );

    const hasSwiftSource = normalizedFiles.some(
      f => f.filename.endsWith(".swift") && f.filename !== "Package.swift",
    );
    if (!hasSwiftSource) {
      throw new Error("Code generation produced no Swift source files. Please try again.");
    }

    // Estimate token usage from content lengths (approx 4 chars per token)
    const estimatedPromptTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
    const estimatedCompletionTokens = Math.ceil(totalContentLength / 4);

    return {
      files: normalizedFiles,
      description: parsed.description ?? null,
      tokenUsage: {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
      },
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

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
  ): CodeGenPayload {
    let extracted: { value: CodeGenPayload; repaired: boolean };
    try {
      extracted = extractJsonWithMeta<CodeGenPayload>(fullResponse);
    } catch {
      throw new Error(
        finishReason === "length"
          ? "Model output was truncated before JSON closed (token cap reached)."
          : "No JSON object found in model output.",
      );
    }
    const payload = extracted.value;
    if (Array.isArray(payload.files)) {
      payload.files = payload.files.filter(
        f => f && typeof f.filename === "string" && typeof f.content === "string",
      );
    }
    if (extracted.repaired && Array.isArray(payload.files) && payload.files.length > 1) {
      // The document was truncated and force-closed, so the last file entry is
      // likely incomplete. Drop it — the accuracy validation + repair pass will
      // regenerate it as a missing file instead of shipping broken Swift.
      payload.files = payload.files.slice(0, -1);
    }
    return payload;
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
- Generate EVERY file in the planned fileList above, using the EXACT planned filenames — one output file per planned filename. Do NOT merge planned files into combined files (no collapsing planned model files into one Models.swift, planned view models into one ViewModels.swift, or planned components into one Components.swift). The accuracy validator marks every planned filename that is absent as MISSING, so merging directly tanks the score. You may add a small number of extra helper files beyond the plan when genuinely needed.
- Each file should be 30-150 lines, dense and well-factored. Engine files (game logic, AI) may be longer if needed to be complete — never truncate working logic to hit a line limit.
- For UIKit: programmatic Auto Layout, no Storyboards. Same design-system + state + accessibility expectations apply (UIColor extensions, UIFont extensions, etc.).
- If the app uses Camera, Microphone, Location, Contacts, Photos, HealthKit, or any privacy-sensitive API, add a comment at the top of the relevant Swift file: \`// REQUIRES Info.plist key: NSCameraUsageDescription = "<reason>"\` (the user reads README.md for what to add).
- All filepaths must use the ${appTargetName}/ prefix (e.g. "${appTargetName}/ContentView.swift", "${appTargetName}/Components/PrimaryButton.swift").
- The code MUST compile cleanly against iOS 17+ with ${IOS_QUALITY_STANDARDS}
SELF-AUDIT before returning the JSON (SwiftUI projects only — skip for UIKit): scan every generated SwiftUI VIEW file for actual code usage (not occurrences inside string literals or comments) of these deprecated patterns and rewrite with modern equivalents before emitting JSON: \`ObservableObject\` / \`@Published\` / \`@StateObject\`, \`NavigationView\`, \`.navigationBarLeading\` / \`.navigationBarTrailing\`, \`.foregroundColor(\`, \`.cornerRadius(\`, \`.accentColor(\`, \`DispatchQueue.main.async\` / \`DispatchQueue.main.asyncAfter\`, \`UIScreen.main\`, \`String(format:\`, \`replacingOccurrences\`, \`PreviewProvider\`, \`.tabItem {\`, \`.font(.system(size:\`. \`UIImpactFeedbackGenerator\` / \`UINotificationFeedbackGenerator\` are allowed ONLY inside the Haptics helper file. \`Color(uiColor: UIColor { ... })\` is allowed ONLY inside the Theme/DesignSystem file.

${approvedPlan.componentPatterns?.length ? getSelectedPatterns(approvedPlan.componentPatterns) : ""}`;
  }
}
