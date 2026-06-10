import { describe, it, expect } from "vitest";
import { lintSwiftFiles, collectLintRepairTargets, formatLintNotes } from "../lib/swift-lint";

const file = (filename: string, content: string) => ({
  filename,
  filepath: `App/${filename}`,
  content,
});

describe("lintSwiftFiles", () => {
  it("flags deprecated SwiftUI APIs in code", () => {
    const report = lintSwiftFiles([
      file(
        "HomeView.swift",
        [
          "import SwiftUI",
          "struct HomeView: View {",
          "  var body: some View {",
          "    NavigationView {",
          "      Text(\"Hi\").foregroundColor(.red).cornerRadius(8)",
          "    }",
          "  }",
          "}",
        ].join("\n"),
      ),
    ]);
    const rules = report.findings.map(f => f.rule);
    expect(rules).toContain("navigation-view");
    expect(rules).toContain("foreground-color");
    expect(rules).toContain("corner-radius");
    expect(report.filesWithIssues).toEqual(["HomeView.swift"]);
  });

  it("does not flag occurrences inside comments or string literals", () => {
    const report = lintSwiftFiles([
      file(
        "CleanView.swift",
        [
          "// NavigationView is deprecated, we use NavigationStack",
          "/* .foregroundColor( should never appear */",
          'let hint = "Use NavigationView here"',
          "let title = Text(\"ok\")",
        ].join("\n"),
      ),
    ]);
    expect(report.findings.filter(f => f.rule !== "todo-stub")).toEqual([]);
  });

  it("tracks multi-line block comments and multiline strings", () => {
    const report = lintSwiftFiles([
      file(
        "Docs.swift",
        [
          "/*",
          " NavigationView {",
          "*/",
          'let doc = """',
          ".foregroundColor(.red)",
          '"""',
          "let x = 1",
        ].join("\n"),
      ),
    ]);
    expect(report.findings).toEqual([]);
  });

  it("flags TODO/FIXME comments and fatalError stubs", () => {
    const report = lintSwiftFiles([
      file(
        "Engine.swift",
        ["func makeMove() {", "  // TODO: implement AI move", "  fatalError(\"unimplemented\")", "}"].join("\n"),
      ),
    ]);
    const rules = report.findings.map(f => f.rule);
    expect(rules).toContain("todo-stub");
    expect(rules).toContain("fatal-error");
  });

  it("exempts the Theme file from UIColor rules and the Haptics file from generator rules", () => {
    const report = lintSwiftFiles([
      file("Theme.swift", "static let bg = Color(uiColor: UIColor { trait in .black })"),
      file("Haptics.swift", "let gen = UIImpactFeedbackGenerator(style: .soft)"),
      file("DetailView.swift", "let gen = UIImpactFeedbackGenerator(style: .soft)"),
    ]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].filename).toBe("DetailView.swift");
    expect(report.findings[0].rule).toBe("haptic-generator");
  });

  it("flags non-private @State but not @State private", () => {
    const report = lintSwiftFiles([
      file(
        "StateView.swift",
        ["@State var exposed = 0", "@State private var hidden = 0", "@FocusState var focus: Bool"].join("\n"),
      ),
    ]);
    const stateFindings = report.findings.filter(f => f.rule === "state-not-private");
    expect(stateFindings.map(f => f.line)).toEqual([1, 3]);
  });

  it("ignores non-Swift files and Package.swift", () => {
    const report = lintSwiftFiles([
      file("README.md", "NavigationView"),
      file("Package.swift", "// TODO: nothing"),
    ]);
    expect(report.findings).toEqual([]);
  });

  it("orders filesWithIssues worst-first and caps repair targets", () => {
    const bad = "NavigationView {}\n.foregroundColor(.red)\n.cornerRadius(2)";
    const mild = "NavigationView {}";
    const report = lintSwiftFiles([file("Mild.swift", mild), file("Bad.swift", bad)]);
    expect(report.filesWithIssues[0]).toBe("Bad.swift");
    expect(collectLintRepairTargets(report, 1)).toEqual(["Bad.swift"]);
  });
});

describe("formatLintNotes", () => {
  it("returns empty string for clean reports", () => {
    expect(formatLintNotes({ findings: [], filesWithIssues: [] })).toBe("");
  });

  it("formats findings with file, line, and rule", () => {
    const report = lintSwiftFiles([file("HomeView.swift", "NavigationView {")]);
    const notes = formatLintNotes(report);
    expect(notes).toContain("HomeView.swift:1");
    expect(notes).toContain("navigation-view");
  });
});
