import vm from "node:vm";
import { callAI, callWithFallback, DEFAULT_MODELS, FALLBACK_MODELS, type Provider, type AICallOptions } from "./ai-client";
import { extractJson, tryExtractJson } from "./json-extract";
import { IOS_QUALITY_STANDARDS } from "./ios-quality-standards";
import type {
  ArchitecturePlan,
  AccuracyReport,
  AccuracyItem,
  ItemStatus,
  ClarifyingQuestion,
} from "./types";

type LogLike = { error: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };

function defaultAccuracyReport(
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string }>,
): AccuracyReport {
  const items: AccuracyItem[] = [];
  const filenamesLower = new Set(files.map(f => f.filename.toLowerCase()));
  const swiftFiles = files.filter(f => f.filename.endsWith(".swift"));
  const swiftBasesLower = new Set(swiftFiles.map(f => f.filename.replace(/\.swift$/i, "").toLowerCase()));

  for (const s of plan.screens) {
    const matched = swiftBasesLower.has(s.name.toLowerCase()) || swiftBasesLower.has(`${s.name.toLowerCase()}view`);
    items.push({ type: "screen", name: s.name, status: matched ? "matched" : "missing", confidence: matched ? 0.9 : 0.5 });
  }
  for (const m of plan.models) {
    const matched = swiftBasesLower.has(m.name.toLowerCase());
    items.push({ type: "model", name: m.name, status: matched ? "matched" : "missing", confidence: matched ? 0.9 : 0.5 });
  }
  for (const f of plan.fileList) {
    const matched = filenamesLower.has(f.filename.toLowerCase());
    items.push({ type: "file", name: f.filename, status: matched ? "matched" : "missing", confidence: matched ? 0.95 : 0.6 });
  }
  const total = items.length || 1;
  const matchedCount = items.filter(i => i.status === "matched").length;
  return {
    overallScore: Math.round((matchedCount / total) * 100),
    summary: `${matchedCount} of ${total} planned items present in generated output (heuristic).`,
    items,
  };
}

export async function runAccuracyValidation(
  reqLog: LogLike,
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string; content: string }>,
  provider: Provider = "openai",
): Promise<AccuracyReport> {
  const FILE_PREVIEW_CAP = 1800;
  const fileSummary = files
    .map(f => {
      const c = f.content;
      let snippet: string;
      if (c.length <= FILE_PREVIEW_CAP) {
        snippet = c;
      } else {
        const head = c.slice(0, 1200);
        const tail = c.slice(-500);
        snippet = `${head}\n// ...elided ${c.length - 1700} chars...\n${tail}`;
      }
      return `\n──── ${f.filepath} (${c.length} chars) ────\n${snippet}`;
    })
    .join("\n");

  const systemPrompt = `You are a strict QA reviewer for studio-grade iOS apps. You evaluate both COMPLETENESS (does the build match the plan?) and QUALITY (does it look hand-crafted, accessible, and App Store-shippable?). Compare the generated project to its original prompt and approved architecture plan, and produce a structured accuracy report.

Output ONLY JSON of this shape:
{
  "overallScore": 0-100,
  "summary": "one-sentence assessment",
  "items": [
    { "type": "screen" | "model" | "file", "name": "Name", "status": "matched" | "missing" | "off-spec" | "extra", "confidence": 0..1, "notes": "optional short note" }
  ]
}

Status rules:
- Include one item for every planned screen, every planned model, and every planned file.
- "matched": present in output AND meets studio-grade quality (see quality bar below).
- "missing": planned but not in the output.
- "off-spec": present but clearly wrong purpose, empty stub, trivially broken, OR fails the quality bar (e.g. a screen with hardcoded colors, no loading/empty state, or no accessibility). BE CONSERVATIVE — only mark off-spec when you can quote the SPECIFIC problematic line from the file content shown. If the snippet does not contain enough code to judge a criterion, mark it "matched" with confidence ≤ 0.7, NOT "off-spec". Notes must point to a real, visible defect in the snippet — never speculate with "likely…", "unclear…", "evidence not shown", "may be missing…". Hallucinated off-specs are worse than missed real ones because they trigger needless repair regressions.
- "extra": for output items NOT in the plan that look unrelated. Small helpers and merged model files (e.g. several planned model types combined into one Models.swift) are FINE — do NOT flag those as extra. Only flag a file as extra if it has no plausible role in the planned app.

Studio-grade quality bar (used to decide matched vs. off-spec, and to drive overallScore):
- FUNCTIONAL COMPLETENESS (most important): every interactive feature actually works end-to-end. For game apps: legal move validation runs, the AI opponent makes real moves after the human plays, win/loss/draw is detected and shown. For data apps: CRUD persists immediately. For forms: submit validates + writes + gives feedback. A beautiful app with dead logic scores 0-24 regardless of visual quality.
- Design system: there is a Theme/DesignSystem file with color palette + typography + spacing tokens. Other files use those tokens, NOT hardcoded colors / font sizes.
- States: list / data-driven screens have explicit loading, empty, and error states (or compose dedicated state-view components).
- Realistic data: seed data is varied and believable, not "Item 1, Item 2".
- Modern Swift: SwiftUI uses @Observable (Observation framework) for view models, NavigationStack (not NavigationView), async/await for any IO.
- Accessibility: icon-only buttons have accessibility labels; body text scales with Dynamic Type.
- Polish: at least some haptics or animations on key interactions where they fit.
- Persistence + Settings: when relevant to the app, there is a persistence layer and a Settings screen.

Scoring rubric (overallScore is the holistic result, not a strict average):
- 90-100: Fully functional + plan complete + all studio-grade quality bars met. Reviewer would happily ship.
- 75-89: Functional + plan complete but 1-2 quality gaps (design system inconsistent, missing some empty states).
- 50-74: Functional but mediocre quality — hardcoded colors, weak states, no haptics/animations, dated patterns.
- 25-49: Partially functional OR plan partially missing AND quality is weak.
- 0-24: Core features don't work (game AI doesn't move, forms don't submit, buttons are dead) OR plan largely missing.

Notes guidance:
- Keep notes <= 14 words and SPECIFIC. Examples: "uses hardcoded #FF0000 instead of Theme.colors.danger", "no empty state for empty list", "uses NavigationView (deprecated)", "missing accessibility labels on icon buttons".
- For matched items, omit notes unless something noteworthy.

DEPRECATED-API CHECK (SwiftUI VIEW files only — UIKit projects skip this; only count actual code usage, not occurrences in comments or string literals): mark a file off-spec and drag overallScore down for any of: \`ObservableObject\` / \`@Published\` / \`@StateObject\`, \`NavigationView\`, \`.navigationBarLeading\` / \`.navigationBarTrailing\`, \`.foregroundColor(\`, \`.cornerRadius(\`, \`.accentColor(\`, \`DispatchQueue.main.async\` / \`DispatchQueue.main.asyncAfter\`, \`UIScreen.main\`, \`PreviewProvider\`, \`.tabItem {\`, \`.font(.system(size:\`, \`String(format:\`, \`replacingOccurrences\`. \`UIImpactFeedbackGenerator\` / \`UINotificationFeedbackGenerator\` are OK only inside a Haptics helper file. \`Color(uiColor: UIColor { ... })\` is OK only inside the Theme/DesignSystem file. Also flag in view files: missing \`@MainActor\` on \`@Observable\` classes, \`@AppStorage\` inside \`@Observable\` without \`@ObservationIgnored\`, \`@State\` declared without \`private\`, mixing \`navigationDestination(for:)\` with \`NavigationLink(destination:)\`, \`onTapGesture\` used for plain actions instead of \`Button\`.
${IOS_QUALITY_STANDARDS}
Output JSON only. No markdown.`;

  const userMessage = `Original prompt:
${enrichedPrompt}

Approved plan:
- screens: ${plan.screens.map(s => `${s.name} (${s.purpose})`).join("; ")}
- models: ${plan.models.map(m => m.name).join(", ")}
- navigation: ${plan.navigation}
- fileList: ${plan.fileList.map(f => f.filename).join(", ")}

Generated files (path :: short preview):
${fileSummary}

Produce the JSON report now.`;

  try {
    const models = DEFAULT_MODELS[provider];
    const fallbacks = FALLBACK_MODELS[provider];
    const result = await callWithFallback(
      { provider, model: models.reviewer, system: systemPrompt, userMessage, maxTokens: 2400 },
      fallbacks.reviewer,
    );
    const parsed = extractJson<AccuracyReport>(result.content);
    if (!Array.isArray(parsed.items)) throw new Error("Missing items array");
    const score = typeof parsed.overallScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.overallScore))) : 0;
    return {
      overallScore: score,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      items: parsed.items
        .filter(i => i && typeof i.name === "string" && typeof i.type === "string")
        .map(i => ({
          type: (["screen", "model", "file"].includes(i.type) ? i.type : "file") as AccuracyItem["type"],
          name: i.name,
          status: (["matched", "missing", "off-spec", "extra"].includes(i.status) ? i.status : "missing") as ItemStatus,
          confidence: typeof i.confidence === "number" ? Math.max(0, Math.min(1, i.confidence)) : 0.5,
          notes: typeof i.notes === "string" ? i.notes : undefined,
        })),
    };
  } catch (validateErr) {
    reqLog.error({ validateErr }, "AI validation failed; falling back to heuristic accuracy report");
    return defaultAccuracyReport(plan, files);
  }
}

export function collectRepairTargets(report: AccuracyReport): string[] {
  const targets = new Set<string>();
  for (const item of report.items) {
    if (item.type !== "file") continue;
    if (item.status === "missing" || item.status === "off-spec") {
      targets.add(item.name);
    }
  }
  for (const item of report.items) {
    if ((item.type === "screen" || item.type === "model") && item.status === "missing") {
      targets.add(`${item.name}.swift`);
    }
  }
  return Array.from(targets).slice(0, 10);
}

export async function runRepairPass(
  reqLog: LogLike,
  appTargetName: string,
  frameworkName: string,
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  existingFiles: Array<{ filename: string; filepath: string; content: string; language: string }>,
  targets: string[],
  provider: Provider = "openai",
  lintNotes: string | null = null,
): Promise<Array<{ filename: string; filepath: string; content: string; language: string }>> {
  const existingSummary = existingFiles
    .map(f => `- ${f.filepath}`)
    .join("\n");

  const systemPrompt = `You are a principal iOS engineer doing a targeted REPAIR pass on a studio-grade ${frameworkName} app. Regenerate ONLY the files listed below — either because they are missing OR because they fall short of the quality bar. Do not touch any other file.

Output ONLY JSON of this shape:
{
  "files": [
    { "filename": "Name.swift", "filepath": "${appTargetName}/Name.swift", "content": "import SwiftUI\\n...", "language": "swift" }
  ]
}

FUNCTIONAL COMPLETENESS (highest priority — repair broken logic first):
- Every function, method, and computed property MUST have a real working implementation. No empty bodies, no "// TODO:", no stubs.
- GAME ENGINE FILES: if repairing a game engine or AI player, implement the complete logic:
  • All piece/move rules fully enforced (no partially-implemented movement).
  • Win/loss/draw detection fully implemented and returning the correct result.
  • AI opponent picks and returns a real move every time it is called. Minimum: pick a random legal move from the generated legal-move list. Better: 2-ply minimax with basic material evaluation. The AI must NEVER return nil or a no-op — it always makes a move.
  • Turn management: the engine enforces whose turn it is and rejects out-of-turn moves.
- GAME VIEWMODEL FILES: after applying the human's move, immediately trigger the AI's move (via \`Task { await aiPlayer.makeMove() }\`) before returning to the UI.
- FORMS / CRUD: every submit/save action writes to the persistence layer; every delete removes from it.
- TIMERS: use real Timer.publish or async Task.sleep — never a static placeholder.

VISUAL QUALITY (secondary — apply after logic is correct):
- One entry per requested filename. If a target is a screen/component that should live in a subfolder (e.g. Components/), use that filepath.
- Place Swift files under ${appTargetName}/ (no "Sources/" prefix — this is a real iOS App target, not an SPM executable).
- Use ${frameworkName} idioms. SwiftUI: @Observable view models (NOT @ObservableObject), NavigationStack, async/await, modern symbol effects.
- Read tokens from the existing Theme/DesignSystem file — NEVER use hardcoded colors, font sizes, or raw paddings (use Theme.spacing.* / Theme.radii.* / Theme.colors.* / Font.app*).
- Every list / data screen MUST have explicit loading, empty, and error states (use the existing EmptyStateView / LoadingView / ErrorView components when present in the plan).
- Use realistic, varied seed data (5-10 items, believable names/dates/descriptions). NEVER "Item 1, Item 2".
- Add accessibility labels on icon-only buttons; allow Dynamic Type (no \`.fixedSize()\` on body copy); keep tap targets >= 44pt.
- Add subtle haptics (Haptics.impact / Haptics.success / Haptics.error) on primary interactions when a Haptics helper exists.
- File header is a one-line comment: \`// AppName/FileName.swift — purpose\`.
- Files should be 30-150 lines (engine files may be longer to stay complete). Extract subviews when nesting exceeds 3 levels.
- Do not include Package.swift, Info.plist, project.yml, README.md, Assets.xcassets, or any Contents.json — those are managed by the build system.
${IOS_QUALITY_STANDARDS}
SELF-AUDIT every repaired SwiftUI VIEW file before emitting JSON (only actual code usage, not comments or string literals; UIKit code is exempt): replace any of the following with their modern equivalents — \`ObservableObject\` / \`@Published\` / \`@StateObject\`, \`NavigationView\`, \`.navigationBarLeading\` / \`.navigationBarTrailing\`, \`.foregroundColor(\`, \`.cornerRadius(\`, \`.accentColor(\`, \`DispatchQueue.main.async\` / \`DispatchQueue.main.asyncAfter\`, \`UIScreen.main\`, \`PreviewProvider\`, \`.tabItem {\`, \`.font(.system(size:\`, \`String(format:\`, \`replacingOccurrences\`. \`UIImpactFeedbackGenerator\` / \`UINotificationFeedbackGenerator\` are OK only when the file is the Haptics helper. \`Color(uiColor: UIColor { ... })\` is OK only when the file is Theme/DesignSystem.
- Output JSON only.`;

  const userMessage = `Prompt: ${enrichedPrompt}

Plan summary:
- screens: ${plan.screens.map(s => `${s.name} (${s.purpose})`).join("; ")}
- models: ${plan.models.map(m => m.name).join(", ")}
- navigation: ${plan.navigation}

Existing files in project:
${existingSummary}

Repair these specific files (regenerate or create from scratch):
${targets.map(t => `- ${t}`).join("\n")}
${lintNotes ? `\nStatic analysis found these verified defects (line numbers refer to the current file contents — every one of these MUST be fixed in your repaired output):\n${lintNotes}\n` : ""}
Output JSON now.`;

  const models = DEFAULT_MODELS[provider];
  const fallbacks = FALLBACK_MODELS[provider];
  const result = await callWithFallback(
    { provider, model: models.engineer, system: systemPrompt, userMessage, maxTokens: 12000 },
    fallbacks.engineer,
  );
  const parsed = tryExtractJson<{ files?: Array<{ filename: string; filepath: string; content: string; language?: string }> }>(result.content);
  if (!parsed) {
    reqLog.error("Repair pass returned no parseable JSON");
    return [];
  }
  if (!parsed.files || !Array.isArray(parsed.files)) return [];
  return parsed.files
    .filter(f => f && typeof f.filename === "string" && typeof f.content === "string")
    .map(f => ({
      filename: f.filename,
      filepath: typeof f.filepath === "string" && f.filepath.length > 0 ? f.filepath : `${appTargetName}/${f.filename}`,
      content: f.content,
      language: f.language ?? "swift",
    }));
}

export async function runLivePreviewGeneration(
  reqLog: LogLike,
  appName: string,
  enrichedPrompt: string,
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string; content: string }>,
  provider: Provider = "openai",
): Promise<string | null> {
  const viewFiles = files
    .filter(f => /view|screen|app\.swift$/i.test(f.filename) || f.filepath.toLowerCase().includes("view"))
    .slice(0, 8);
  const fallback = viewFiles.length === 0 ? files.filter(f => f.filename.endsWith(".swift")).slice(0, 6) : viewFiles;
  const fileBlock = fallback
    .map(f => {
      const clipped = f.content.length > 1500 ? f.content.slice(0, 1500) + "\n// ...truncated" : f.content;
      return `// ${f.filepath}\n${clipped}`;
    })
    .join("\n\n");

  const navHint = (plan.navigation || "").toLowerCase();
  const navStyle = /tab/.test(navHint) ? "bottom tab bar" : /stack|push|nav/.test(navHint) ? "navigation stack with back button" : "single screen";

  const systemPrompt = `You are a UI translator. Given an iOS app's plan and SwiftUI source, produce ONE self-contained HTML document that visually approximates the app so it can be embedded in an iframe inside a phone-frame preview. The iframe is rendered at intrinsic 390×844 logical pixels and CSS-scaled to fit, so design EXACTLY for that viewport.

Hard rules:
- Output a complete HTML document. Start with <!DOCTYPE html>. No markdown fences. No commentary.
- Inline ALL styles and scripts. Allowed CDN tags: <script src="https://cdn.tailwindcss.com"></script>. Optional: Google Fonts <link> tags.
- The <head> MUST include this exact viewport meta tag: <meta name="viewport" content="width=390, initial-scale=1, viewport-fit=cover">.
- The <body> MUST be exactly 390px wide and 844px tall with overflow:hidden, so the iframe scales correctly. Apply this with inline style: style="margin:0;width:390px;height:844px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;".
- Inside <body>, layout must be a column: a fixed-height status bar (~44px), a flex-1 SCREEN container that holds the visible <section>, and (when present) a fixed-height tab bar (~84px) at the bottom. The SCREEN container MUST have overflow-y:auto and overscroll-behavior:contain so vertical scrolling happens INSIDE the iframe. Header / tab bar use position:sticky within their flex slots, NOT position:fixed.
- Render an iOS-style status bar at the top: time "9:41" on the left, signal/wifi/battery glyphs (inline SVG or unicode) on the right, ~44px tall.
- Implement screen switching with plain vanilla JS (no React, no build step). Use a simple state object that toggles which screen <section data-screen="..."> is visible (display:none vs flex).
- Include the navigation pattern indicated below: ${navStyle}. For tab bar, render at the bottom with icons + labels, exactly 84px tall (includes safe-area inset). For nav stack, show a sticky header with title and an optional chevron-left back button when not on the root screen.
- Every interactive element (<button>, list rows that navigate, tab items, toggles, links) MUST have a working JS click/tap handler — no dead controls. Tapping a list row navigates if appropriate; toggles flip a boolean and re-render.
- FUNCTIONAL CORE MECHANIC (this is the most common failure — read carefully): the preview must actually SIMULATE the app's primary feature, not just navigate around stub screens.
  • Games: the game screen MUST render a visible board / grid / playfield (use absolutely-positioned <div>s, inline-SVG circles, or a CSS grid) with the actual playing pieces drawn at their real coordinates. The primary action (shoot, drop, swap, tap, move) MUST visibly mutate the board state — pieces appear / disappear / move / change color — and re-render the board. Score updates from the real mechanic, not from a hardcoded array. Lose/win conditions are detected and trigger the results screen.
  • Bubble shooter / match-3 / breakout / snake / tetris / 2048 / sudoku: model the grid as a 2D JS array, render it on every state change, and implement the core action (e.g. shoot color → place at position → flood-fill same-color group of 3+ → remove and add to score) end-to-end. Even a simplified 6-row × 7-column grid with random colors and a working flood-fill is far better than a placeholder.
  • Lists / forms / CRUD: the add/edit/delete buttons must mutate a JS array and re-render the list. Search must filter the array by the input value. Toggle controls flip state and re-render dependent UI.
  • Timers / counters: use \`setInterval\` so the UI actually ticks.
  • A button whose handler only updates a tooltip text or increments a counter without changing visible content is a FAILED preview. Re-render the affected area.
- ALL inline <script> JavaScript MUST parse cleanly — a single syntax error makes EVERY onclick handler dead. Triple-check ternaries: \`cond ? a : b\` has exactly one \`?\` and one \`:\`. Triple-check that every backtick-delimited template literal is opened and closed correctly, and that nested template literals inside \`.map(...)\` calls do not break the outer template's quoting. When in doubt, build a string with concatenation instead of nesting templates.
- Each screen renders representative content based on its purpose, with realistic mock data (5-10 varied items per list, believable names/dates/copy, NEVER "Item 1, Item 2"). Match modern iOS styling: rounded corners (12-20px), subtle separators (rgba(60,60,67,0.18)), generous spacing (16-24px), accent #007AFF for actions, system grays for secondary text.
- Typography: body text minimum 15px, navigation/tab labels 11-13px, headlines 20-34px. Multi-word strings MUST wrap naturally — no white-space:nowrap on titles, descriptions, or list rows.
- Tap targets are at least 44×44px.
- Keep total output under 32000 characters. The functional core mechanic gets the lion's share of the budget — strip cosmetic polish (decorative gradients, multi-screen onboarding) before strip the working game loop.
- DO NOT fetch external resources besides Tailwind CDN and Google Fonts. No images from external URLs (use CSS gradients or inline SVG placeholders).
- DO NOT include any explanatory text. Output the HTML only.`;

  const userMessage = `App name: ${appName}
Original prompt: ${enrichedPrompt}

Architecture plan:
- screens: ${plan.screens.map(s => `${s.name} — ${s.purpose}`).join("; ")}
- models: ${plan.models.map(m => `${m.name}{${m.fields.join(",")}}`).join("; ")}
- navigation: ${plan.navigation}

SwiftUI source (clipped):
${fileBlock}

Produce the HTML preview now.`;

  const cleanHtml = (raw: string): string | null => {
    let out = raw.trim();
    const fenceMatch = out.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenceMatch) out = fenceMatch[1].trim();
    const docIdx = out.search(/<!doctype|<html/i);
    if (docIdx > 0) out = out.slice(docIdx);
    if (!/<html[\s>]/i.test(out)) return null;
    return out;
  };

  const findScriptSyntaxError = (html: string): { snippet: string; error: string } | null => {
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
      const code = m[1];
      if (!code.trim()) continue;
      const tagOpen = m[0].slice(0, m[0].indexOf(">"));
      if (/type\s*=\s*["'](?!text\/javascript|module|application\/javascript)/i.test(tagOpen)) continue;
      try {
        new vm.Script(code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const snippet = code.length > 1200 ? code.slice(0, 1200) + "\n/* ...truncated... */" : code;
        return { snippet, error: msg };
      }
    }
    return null;
  };

  try {
    const models = DEFAULT_MODELS[provider];
    const fallbacks = FALLBACK_MODELS[provider];
    const result = await callWithFallback(
      { provider, model: models.engineer, system: systemPrompt, userMessage, maxTokens: 14000, timeoutMs: 300_000 },
      fallbacks.engineer,
    );
    const raw = result.content;
    let html = cleanHtml(raw);
    if (!html) {
      reqLog.error("Live preview AI output missing <html> tag");
      return null;
    }

    const jsError = findScriptSyntaxError(html);
    if (jsError) {
      reqLog.error({ jsError: jsError.error }, "Live preview JS has syntax error — attempting one-shot repair");
      const repairResult = await callAI({
        provider,
        model: models.engineer,
        system: systemPrompt,
        userMessage,
        maxTokens: 14000,
        timeoutMs: 300_000,
        extraMessages: [
          { role: "assistant", content: html },
          {
            role: "user",
            content: `The inline <script> in your previous HTML has a JavaScript syntax error: ${jsError.error}\n\nBroken script excerpt:\n${jsError.snippet}\n\nThis breaks every onclick handler in the preview because the script fails to parse. Re-output the COMPLETE corrected HTML document (same structure, all screens, same content) with the JavaScript fixed. Output the full HTML only — no commentary, no fences.`,
          },
        ],
      });
      const repairedRaw = repairResult.content;
      const repairedHtml = cleanHtml(repairedRaw);
      if (repairedHtml) {
        const stillBroken = findScriptSyntaxError(repairedHtml);
        if (!stillBroken) {
          reqLog.info?.("Live preview JS repaired successfully");
          html = repairedHtml;
        } else {
          reqLog.error({ stillBroken: stillBroken.error }, "Live preview JS still broken after repair — keeping original");
        }
      } else {
        reqLog.error("Live preview repair returned no <html> — keeping original");
      }
    }

    return html;
  } catch (err) {
    reqLog.error({ err }, "Live preview generation failed");
    return null;
  }
}

export function mergeFiles(
  base: Array<{ filename: string; filepath: string; content: string; language: string; projectId?: number }>,
  patches: Array<{ filename: string; filepath: string; content: string; language: string }>,
): Array<{ filename: string; filepath: string; content: string; language: string }> {
  const merged = base.map(f => ({ filename: f.filename, filepath: f.filepath, content: f.content, language: f.language }));
  for (const p of patches) {
    // Prefer an exact filepath match; fall back to filename only when it is
    // unambiguous, so a patch for "App/Card.swift" never clobbers an
    // unrelated "App/Components/Card.swift".
    const pathIdx = merged.findIndex(f => f.filepath.toLowerCase() === p.filepath.toLowerCase());
    if (pathIdx >= 0) {
      merged[pathIdx] = p;
      continue;
    }
    const nameMatches = merged
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.filename.toLowerCase() === p.filename.toLowerCase());
    if (nameMatches.length === 1) {
      merged[nameMatches[0].i] = p;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

export async function detectAmbiguityAndAskQuestions(
  prompt: string,
  frameworkName: string,
  provider: Provider = "openai",
): Promise<{ needsClarification: boolean; questions: ClarifyingQuestion[] }> {
  const systemPrompt = `You are an iOS product manager who decides whether a user's app idea is clear enough to plan, or whether it needs 3-5 quick clarifying questions first.

Return ONLY a JSON object of this exact shape:
{
  "needsClarification": true | false,
  "questions": [
    { "id": "kebab-case-key", "question": "Single concise question.", "suggestion": "A short suggested default answer (optional)." }
  ]
}

Decision rules:
- If the prompt names a concrete domain, key entities, and at least a hint of features (e.g. "a habit tracker with daily streaks and reminders"), set needsClarification to false and return [] for questions.
- If the prompt is vague or one-liner ("make me a fitness app", "a notes app"), set needsClarification to true and return 3-5 high-leverage questions covering: target audience, must-have features, data persistence (local/cloud/none), auth (yes/no), and any unique differentiator.
- Each question must be answerable in one short sentence.
- Provide a "suggestion" for each question when a reasonable default exists.
- Do not ask about visual design / colors. Focus on functional scope.
- Output ONLY the JSON object, no markdown, no extra text.`;

  const userMessage = `Framework: ${frameworkName}
User prompt: ${prompt}

Decide.`;

  const models = DEFAULT_MODELS[provider];
  const fallbacks = FALLBACK_MODELS[provider];
  const result = await callWithFallback(
    { provider, model: models.planner, system: systemPrompt, userMessage, maxTokens: 800 },
    fallbacks.planner,
  );

  const parsed = tryExtractJson<{
    needsClarification?: boolean;
    questions?: ClarifyingQuestion[];
  }>(result.content);
  if (!parsed) {
    return { needsClarification: false, questions: [] };
  }
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter(q => q && typeof q.id === "string" && typeof q.question === "string")
        .slice(0, 5)
        .map(q => ({
          id: q.id,
          question: q.question,
          suggestion: typeof q.suggestion === "string" ? q.suggestion : undefined,
        }))
    : [];
  const needs = parsed.needsClarification === true && questions.length > 0;
  return { needsClarification: needs, questions: needs ? questions : [] };
}

export function buildEnrichedPrompt(
  originalPrompt: string,
  answers: Array<{ id: string; question: string; answer: string }>,
): string {
  if (answers.length === 0) return originalPrompt;
  const lines = answers
    .filter(a => a.answer && a.answer.trim().length > 0)
    .map(a => `- ${a.question} → ${a.answer.trim()}`);
  if (lines.length === 0) return originalPrompt;
  return `${originalPrompt}\n\nClarifications from the user:\n${lines.join("\n")}`;
}
