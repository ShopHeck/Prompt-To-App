// Deterministic static-analysis pass over generated Swift sources.
//
// The engineer/reviewer prompts describe a deny-list of deprecated SwiftUI
// APIs and stub markers, but enforcement was purely LLM-based: the reviewer
// both misses real defects and hallucinates fake ones. This linter applies
// the same rules deterministically (and for free), and its findings are
// merged into the repair targets so the repair pass fixes verified defects.

export interface LintFinding {
  filename: string;
  filepath: string;
  line: number;
  rule: string;
  message: string;
}

export interface LintReport {
  findings: LintFinding[];
  /** Unique filenames with at least one finding, worst-first. */
  filesWithIssues: string[];
}

interface LintRule {
  id: string;
  pattern: RegExp;
  message: string;
  /** Skip files matching this predicate (e.g. the Theme file may use UIColor). */
  exempt?: (filename: string) => boolean;
}

const isThemeFile = (name: string) => /theme|designsystem|colors?\.swift$/i.test(name);
const isHapticsFile = (name: string) => /haptic/i.test(name);

const DEPRECATED_RULES: LintRule[] = [
  { id: "navigation-view", pattern: /\bNavigationView\b/, message: "NavigationView is deprecated — use NavigationStack" },
  { id: "observable-object", pattern: /\bObservableObject\b|@Published\b|@StateObject\b/, message: "Use the @Observable macro instead of ObservableObject/@Published/@StateObject" },
  { id: "foreground-color", pattern: /\.foregroundColor\(/, message: "Use .foregroundStyle(...) instead of .foregroundColor(...)" },
  { id: "corner-radius", pattern: /\.cornerRadius\(/, message: "Use .clipShape(.rect(cornerRadius:)) instead of .cornerRadius(...)" },
  { id: "accent-color", pattern: /\.accentColor\(/, message: "Use .tint(...) instead of .accentColor(...)" },
  { id: "dispatch-main", pattern: /DispatchQueue\.main\.(async|asyncAfter)/, message: "Use Task { @MainActor in ... } / async-await instead of DispatchQueue.main" },
  { id: "uiscreen-main", pattern: /UIScreen\.main/, message: "Never use UIScreen.main — prefer containerRelativeFrame/GeometryReader" },
  { id: "preview-provider", pattern: /\bPreviewProvider\b/, message: "Use the #Preview macro instead of PreviewProvider" },
  { id: "navbar-placement", pattern: /\.navigationBarLeading\b|\.navigationBarTrailing\b/, message: "Use .topBarLeading/.topBarTrailing toolbar placements" },
  { id: "tab-item", pattern: /\.tabItem\s*\{/, message: "Use the Tab(\"...\", systemImage:) API instead of .tabItem { }" },
  { id: "fixed-font-size", pattern: /\.font\(\.system\(size:/, message: "Use semantic fonts (.body, .headline) or .custom(_:size:relativeTo:) for Dynamic Type" },
  { id: "state-not-private", pattern: /@(State|FocusState)\s+var\b/, message: "@State/@FocusState properties must be declared private" },
  {
    id: "haptic-generator",
    pattern: /UI(Impact|Notification)FeedbackGenerator/,
    message: "UIKit feedback generators belong only in the Haptics helper file",
    exempt: isHapticsFile,
  },
  {
    id: "uicolor-outside-theme",
    pattern: /Color\(uiColor:|UIColor\s*\{/,
    message: "Dynamic UIColor tokens belong only in the Theme/DesignSystem file",
    exempt: isThemeFile,
  },
];

const STUB_RULES: LintRule[] = [
  { id: "todo-stub", pattern: /\/\/\s*(TODO|FIXME)\b/i, message: "Unfinished TODO/FIXME stub — implement the real logic" },
  { id: "fatal-error", pattern: /\bfatalError\(|\bpreconditionFailure\(/, message: "fatalError/preconditionFailure stub — implement the real logic" },
];

/**
 * Scrub string-literal contents and comments from a Swift line so rules only
 * match actual code usage. Multiline string/comment state is carried by the
 * caller across lines.
 */
interface ScrubState { inBlockComment: boolean; inMultilineString: boolean }

function scrubLine(line: string, state: ScrubState): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inMultilineString) {
      const end = line.indexOf('"""', i);
      if (end === -1) return out;
      state.inMultilineString = false;
      i = end + 3;
      continue;
    }
    if (state.inBlockComment) {
      const end = line.indexOf("*/", i);
      if (end === -1) return out;
      state.inBlockComment = false;
      i = end + 2;
      continue;
    }
    if (line.startsWith('"""', i)) {
      state.inMultilineString = true;
      i += 3;
      continue;
    }
    if (line.startsWith("/*", i)) {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (line.startsWith("//", i)) return out;
    if (line[i] === '"') {
      // Skip a single-line string literal (handles escapes).
      i++;
      while (i < line.length) {
        if (line[i] === "\\") { i += 2; continue; }
        if (line[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

export function lintSwiftFiles(
  files: Array<{ filename: string; filepath: string; content: string }>,
): LintReport {
  const findings: LintFinding[] = [];

  for (const file of files) {
    if (!file.filename.endsWith(".swift") || file.filename === "Package.swift") continue;
    const lines = file.content.split("\n");
    const state: ScrubState = { inBlockComment: false, inMultilineString: false };

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const rawLine = lines[lineNo];

      // Stub markers live in comments, so check the raw line before scrubbing.
      for (const rule of STUB_RULES) {
        if (rule.id === "todo-stub" && rule.pattern.test(rawLine)) {
          findings.push({ filename: file.filename, filepath: file.filepath, line: lineNo + 1, rule: rule.id, message: rule.message });
        }
      }

      const code = scrubLine(rawLine, state);
      if (!code.trim()) continue;

      if (STUB_RULES[1].pattern.test(code)) {
        findings.push({ filename: file.filename, filepath: file.filepath, line: lineNo + 1, rule: "fatal-error", message: STUB_RULES[1].message });
      }
      for (const rule of DEPRECATED_RULES) {
        if (rule.exempt?.(file.filename)) continue;
        if (rule.pattern.test(code)) {
          findings.push({ filename: file.filename, filepath: file.filepath, line: lineNo + 1, rule: rule.id, message: rule.message });
        }
      }
    }
  }

  const countByFile = new Map<string, number>();
  for (const f of findings) {
    countByFile.set(f.filename, (countByFile.get(f.filename) ?? 0) + 1);
  }
  const filesWithIssues = Array.from(countByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return { findings, filesWithIssues };
}

/** Filenames worth repairing, worst offenders first. */
export function collectLintRepairTargets(report: LintReport, max = 5): string[] {
  return report.filesWithIssues.slice(0, max);
}

/** Compact human-readable summary injected into the repair prompt. */
export function formatLintNotes(report: LintReport, maxFindings = 40): string {
  if (report.findings.length === 0) return "";
  const lines = report.findings
    .slice(0, maxFindings)
    .map(f => `- ${f.filename}:${f.line} [${f.rule}] ${f.message}`);
  const elided = report.findings.length - maxFindings;
  if (elided > 0) lines.push(`- ...and ${elided} more findings`);
  return lines.join("\n");
}
