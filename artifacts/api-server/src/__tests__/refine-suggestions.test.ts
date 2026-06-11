import { describe, it, expect } from "vitest";
import { buildRefineSuggestions } from "../lib/refine-suggestions";

const qualityReport = JSON.stringify({
  overallScore: 80,
  dimensions: {},
  verdict: "studio",
  strengths: [],
  improvements: [
    { file: "GameView.swift", issue: "No particle effects on hits", fix: "Add a particle burst when a target is hit", impact: "high" },
    { file: "general", issue: "Flat list layouts", fix: "Vary card layouts between screens", impact: "medium" },
    { file: "Theme.swift", issue: "Low contrast secondary text", fix: "Raise textSecondary contrast", impact: "low" },
  ],
  summary: "Good",
});

const accuracyReport = JSON.stringify({
  overallScore: 80,
  summary: "Mostly matched",
  items: [
    { type: "file", name: "ResultsView.swift", status: "off-spec", confidence: 0.9, notes: "no saving state UI" },
    { type: "file", name: "RootView.swift", status: "matched", confidence: 0.9 },
    { type: "file", name: "MenuView.swift", status: "off-spec", confidence: 0.8 }, // no notes — skipped
  ],
});

describe("buildRefineSuggestions", () => {
  it("derives quality suggestions ranked by impact, then accuracy, then presets", () => {
    const result = buildRefineSuggestions(qualityReport, accuracyReport, "swiftui");
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result[0].source).toBe("quality");
    expect(result[0].impact).toBe("high");
    expect(result[0].instruction).toContain("GameView.swift");
    const accuracySuggestions = result.filter((s) => s.source === "accuracy");
    expect(accuracySuggestions).toHaveLength(1);
    expect(accuracySuggestions[0].instruction).toContain("ResultsView.swift");
    expect(result.some((s) => s.source === "preset")).toBe(true);
  });

  it("omits the file prefix for 'general' improvements", () => {
    const result = buildRefineSuggestions(qualityReport, null, "swiftui");
    const general = result.find((s) => s.instruction.includes("Vary card layouts"));
    expect(general).toBeDefined();
    expect(general!.instruction.startsWith("In general")).toBe(false);
  });

  it("falls back to presets when no reports exist", () => {
    const result = buildRefineSuggestions(null, null, "swiftui");
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.every((s) => s.source === "preset")).toBe(true);
    expect(result.some((s) => s.instruction.includes("ContentUnavailableView"))).toBe(true);
  });

  it("uses web presets for react projects", () => {
    const result = buildRefineSuggestions(null, null, "react");
    expect(result.some((s) => s.instruction.toLowerCase().includes("aria"))).toBe(true);
    expect(result.every((s) => !s.instruction.includes("SwiftUI") && !s.instruction.includes("SF Symbol"))).toBe(true);
  });

  it("survives malformed report JSON", () => {
    const result = buildRefineSuggestions("{not json", "[]", "swiftui");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.source === "preset")).toBe(true);
  });

  it("deduplicates identical instructions and caps at 8", () => {
    const dupes = JSON.stringify({
      improvements: Array.from({ length: 12 }, () => ({
        file: "A.swift", issue: "Same issue", fix: "Same fix", impact: "high",
      })),
    });
    const result = buildRefineSuggestions(dupes, null, "swiftui");
    expect(result.filter((s) => s.source === "quality")).toHaveLength(1);
    expect(result.length).toBeLessThanOrEqual(8);
  });
});
