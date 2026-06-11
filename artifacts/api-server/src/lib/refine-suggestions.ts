// Derives clickable post-generation edit suggestions from the reports the
// engine already persists: the quality report's per-file improvements and the
// accuracy report's off-spec findings. Each suggestion carries a full
// refinement instruction that can be sent straight to the refine endpoint.

import type { AccuracyReport } from "./types";
import type { QualityReport } from "./quality-scorer";

export interface RefineSuggestion {
  id: string;
  /** Short chip text shown in the UI. */
  label: string;
  /** Full instruction sent to the refinement engine when clicked. */
  instruction: string;
  impact: "high" | "medium" | "low";
  source: "quality" | "accuracy" | "preset";
}

const MAX_SUGGESTIONS = 8;
const MAX_QUALITY = 5;
const MAX_ACCURACY = 3;

const IOS_PRESETS: Array<{ label: string; instruction: string }> = [
  { label: "Add more animations", instruction: "Add tasteful spring animations and transitions to the main interactions: animate list item insertion/removal, add .contentTransition(.numericText()) to changing numbers, and use withAnimation(.smooth) on state changes." },
  { label: "Polish empty states", instruction: "Review every list/data screen and make sure each has a designed empty state using ContentUnavailableView with a fitting SF Symbol, a clear headline, and a call-to-action button where appropriate." },
  { label: "Strengthen haptics", instruction: "Add sensory feedback to the key interactions: .sensoryFeedback(.success, ...) on completions, .impact on primary buttons, and .error on failed validations. Keep it subtle and meaningful." },
  { label: "Improve accessibility", instruction: "Audit accessibility: add .accessibilityLabel to every icon-only button, combine composite cards with .accessibilityElement(children: .combine), and make sure all text scales with Dynamic Type." },
  { label: "Richer seed data", instruction: "Make the seed data richer and more believable: 8-10 varied items per list with realistic names, dates, and descriptions that show off the UI (long and short values, edge cases)." },
];

const WEB_PRESETS: Array<{ label: string; instruction: string }> = [
  { label: "Add page transitions", instruction: "Add smooth page transitions and entrance animations: fade/slide on route changes, staggered list item entrances, and hover/active states on all interactive elements." },
  { label: "Polish empty states", instruction: "Review every list/data page and add a designed empty state with an icon, a clear headline, and a call-to-action button where appropriate." },
  { label: "Improve responsiveness", instruction: "Audit the layout on mobile, tablet, and desktop breakpoints: fix any overflow, cramped spacing, or oversized tap targets, and make navigation fully usable on small screens." },
  { label: "Improve accessibility", instruction: "Audit accessibility: ensure semantic HTML, ARIA labels on icon-only buttons, visible focus rings, and sufficient color contrast throughout." },
  { label: "Richer seed data", instruction: "Make the seed data richer and more believable: 8-10 varied items per list with realistic names, dates, and descriptions that show off the UI." },
];

function truncateLabel(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function tryParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function buildRefineSuggestions(
  qualityReportJson: string | null | undefined,
  accuracyReportJson: string | null | undefined,
  framework: string,
): RefineSuggestion[] {
  const suggestions: RefineSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: RefineSuggestion) => {
    const key = s.instruction.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  };

  // 1. Quality report improvements — already file-specific, fix-shaped text.
  const quality = tryParse<QualityReport>(qualityReportJson);
  if (quality?.improvements && Array.isArray(quality.improvements)) {
    const ranked = [...quality.improvements]
      .filter((i) => i && typeof i.fix === "string" && i.fix.trim().length > 0)
      .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 3) - (IMPACT_ORDER[b.impact] ?? 3))
      .slice(0, MAX_QUALITY);
    ranked.forEach((imp, idx) => {
      const where = imp.file && imp.file !== "general" ? `In ${imp.file}: ` : "";
      const issue = typeof imp.issue === "string" && imp.issue.trim() ? `${imp.issue.trim()}. ` : "";
      push({
        id: `quality-${idx}`,
        label: truncateLabel(imp.issue || imp.fix),
        instruction: `${where}${issue}${imp.fix.trim()}`,
        impact: imp.impact === "high" || imp.impact === "medium" || imp.impact === "low" ? imp.impact : "medium",
        source: "quality",
      });
    });
  }

  // 2. Accuracy report off-spec items with concrete notes.
  const accuracy = tryParse<AccuracyReport>(accuracyReportJson);
  if (accuracy?.items && Array.isArray(accuracy.items)) {
    accuracy.items
      .filter((i) => i && i.status === "off-spec" && typeof i.notes === "string" && i.notes.trim().length > 0)
      .slice(0, MAX_ACCURACY)
      .forEach((item, idx) => {
        push({
          id: `accuracy-${idx}`,
          label: truncateLabel(`Fix ${item.name}: ${item.notes}`),
          instruction: `Fix ${item.name} — the build review found: "${item.notes!.trim()}". Rework the affected code completely so it meets the spec and modern API standards.`,
          impact: "high",
          source: "accuracy",
        });
      });
  }

  // 3. Curated presets fill the remaining slots.
  const presets = framework === "react" ? WEB_PRESETS : IOS_PRESETS;
  for (const preset of presets) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    push({
      id: `preset-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: preset.label,
      instruction: preset.instruction,
      impact: "medium",
      source: "preset",
    });
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}
