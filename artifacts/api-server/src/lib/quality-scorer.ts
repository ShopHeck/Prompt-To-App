import { callAI, DEFAULT_MODELS, FALLBACK_MODELS, callWithFallback, type Provider } from "./ai-client";
import type { ArchitecturePlan } from "./types";

export interface QualityDimensions {
  visualIdentity: number;
  componentRichness: number;
  animationMotion: number;
  contentQuality: number;
  layoutHierarchy: number;
  overallPolish: number;
}

export type QualityVerdict = "studio" | "polished" | "adequate" | "needs_work";

export interface QualityImprovement {
  file: string;
  issue: string;
  fix: string;
  impact: "high" | "medium" | "low";
}

export interface QualityReport {
  overallScore: number;
  dimensions: QualityDimensions;
  verdict: QualityVerdict;
  strengths: string[];
  improvements: QualityImprovement[];
  summary: string;
}

const QUALITY_RUBRIC = `You are a Senior iOS Design Critic evaluating a generated SwiftUI app for visual polish and production quality.

You will receive:
1. The app's architecture plan (design system, screens, models)
2. Key Swift source files
3. The preview HTML that approximates the app's appearance (if available)

Evaluate against this rubric (each dimension 0-10):

## Visual Identity (0-10)
- Does the app have a DISTINCTIVE color scheme (not default iOS blue/gray)?
- Is the accent color used consistently and intentionally?
- Does the typography feel custom (fontDesign, weight hierarchy, tracking)?
- Score 0-3: default iOS look, system blue, no personality
- Score 4-6: custom colors but generic layout
- Score 7-10: distinctive visual brand, recognizable palette

## Component Richness (0-10)
- Are there CUSTOM components (GlassCard, StatTile, etc.) or just default List/Form?
- Do cards have rounded corners, shadows, borders, background materials?
- Are SF Symbols used with hierarchical rendering and effects?
- Score 0-3: plain List cells, default Form
- Score 4-6: some custom styling but repetitive
- Score 7-10: rich custom components with depth and variety

## Animation & Motion (0-10)
- Are there spring animations on entrances?
- Staggered list animations?
- matchedGeometryEffect hero transitions?
- sensoryFeedback on actions?
- Score 0-3: no animations, static views
- Score 4-6: basic .animation() calls
- Score 7-10: spring entrances, stagger, hero transitions, haptics

## Content Quality (0-10)
- Is seed data realistic and specific (not "Item 1", "Lorem ipsum")?
- Are empty states designed (SF Symbol + copy + CTA)?
- Do screens feel populated and alive on first launch?
- Score 0-3: placeholder data, generic text
- Score 4-6: some real data but sparse
- Score 7-10: rich, realistic content throughout

## Layout & Hierarchy (0-10)
- Is there clear visual hierarchy (headers, sections, spacing)?
- Do different screens have distinct layouts (not all identical lists)?
- Is spacing consistent and intentional?
- Score 0-3: flat layout, no hierarchy
- Score 4-6: basic sections but repetitive
- Score 7-10: clear hierarchy, varied layouts, intentional whitespace

## Overall Polish (0-10)
- Does the app feel like it was designed by a human designer?
- Are there delightful micro-interactions?
- Is the navigation structure clear and intuitive?
- Score 0-3: feels auto-generated
- Score 4-6: functional but generic
- Score 7-10: feels handcrafted, delightful

Return your evaluation as a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "dimensions": {
    "visualIdentity": <0-10>,
    "componentRichness": <0-10>,
    "animationMotion": <0-10>,
    "contentQuality": <0-10>,
    "layoutHierarchy": <0-10>,
    "overallPolish": <0-10>
  },
  "verdict": "<studio|polished|adequate|needs_work>",
  "strengths": ["<strength1>", "<strength2>"],
  "improvements": [
    { "file": "<filepath or general>", "issue": "<what's wrong>", "fix": "<specific fix>", "impact": "<high|medium|low>" }
  ],
  "summary": "<1-2 sentence assessment>"
}

Be critical but fair. Output ONLY the JSON object.`;

function buildSourceContext(
  files: Array<{ filename: string; filepath: string; content: string }>,
): string {
  const keyFiles = files.filter(
    (f) =>
      f.filepath.includes("Theme") ||
      f.filepath.includes("ContentView") ||
      f.filepath.includes("Component") ||
      f.filepath.includes("App.swift") ||
      f.filepath.endsWith("View.swift"),
  );
  const selected = keyFiles.length > 0 ? keyFiles : files.slice(0, 8);
  return selected
    .map((f) => `// ── ${f.filepath} ──\n${f.content.slice(0, 2000)}`)
    .join("\n\n")
    .slice(0, 15000);
}

export async function evaluateQuality(
  log: { error: (...args: unknown[]) => void },
  plan: ArchitecturePlan,
  files: Array<{ filename: string; filepath: string; content: string }>,
  previewHtml: string | null,
  provider: Provider = "openai",
): Promise<QualityReport | null> {
  try {
    const planContext = `## Architecture Plan\n\`\`\`json\n${JSON.stringify(plan, null, 2).slice(0, 4000)}\n\`\`\``;
    const sourceContext = `## Swift Source Code\n${buildSourceContext(files)}`;
    const previewContext = previewHtml
      ? `## Preview HTML (first 8000 chars)\n\`\`\`html\n${previewHtml.slice(0, 8000)}\n\`\`\``
      : "";

    const userMessage = `Evaluate this generated iOS app for visual quality and polish.

${planContext}

${sourceContext}

${previewContext}

Evaluate each dimension 0-10 per the rubric. Be critical but fair. Return ONLY the JSON object.`;

    const models = DEFAULT_MODELS[provider];
    const fallbacks = FALLBACK_MODELS[provider];

    const result = await callWithFallback(
      {
        provider,
        model: models.reviewer,
        system: QUALITY_RUBRIC,
        userMessage,
        maxTokens: 4000,
        responseFormat: "json",
        timeoutMs: 60_000,
      },
      fallbacks.reviewer,
    );

    const raw = result.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.error("Quality scorer returned non-JSON response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as QualityReport;

    if (
      typeof parsed.overallScore !== "number" ||
      !parsed.dimensions ||
      !parsed.verdict
    ) {
      log.error("Quality scorer returned invalid report structure");
      return null;
    }

    return parsed;
  } catch (err) {
    log.error({ err }, "Quality evaluation failed");
    return null;
  }
}

export function getVerdict(score: number): QualityVerdict {
  if (score >= 80) return "studio";
  if (score >= 60) return "polished";
  if (score >= 40) return "adequate";
  return "needs_work";
}
