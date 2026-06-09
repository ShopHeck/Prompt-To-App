import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { checkA11y } from "../../test/a11y-helpers";
import { BuildTerminal, type LogLine } from "../build-terminal";
import { PlanPanel, type ArchitecturePlan } from "../plan-panel";
import { PhonePreview } from "../phone-preview";
import { AccuracyReportPanel, type AccuracyReport } from "../accuracy-report-panel";

const mockPlan: ArchitecturePlan = {
  screens: [
    { name: "HomeScreen", purpose: "Main view" },
    { name: "SettingsScreen", purpose: "User prefs" },
  ],
  models: [{ name: "User", fields: ["id", "name"] }],
  navigation: "Tab navigation",
  spmDependencies: [],
  fileList: [{ filename: "Home.swift", purpose: "Main" }],
};

const mockLogLines: LogLine[] = [
  { id: 1, time: Date.now(), kind: "info", text: "Starting..." },
  { id: 2, time: Date.now(), kind: "build", text: "Building" },
  { id: 3, time: Date.now(), kind: "error", text: "Error occurred" },
];

const mockReport: AccuracyReport = {
  overallScore: 90,
  summary: "Good accuracy",
  items: [
    { type: "screen", name: "Home", status: "matched", confidence: 1.0 },
    { type: "model", name: "User", status: "missing", confidence: 0 },
  ],
};

describe("Accessibility checks", () => {
  it("BuildTerminal with lines has no critical a11y violations", async () => {
    const { container } = render(
      <BuildTerminal lines={mockLogLines} active={true} />,
    );
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });

  it("BuildTerminal empty state has no critical a11y violations", async () => {
    const { container } = render(
      <BuildTerminal lines={[]} active={false} />,
    );
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });

  it("PlanPanel expanded has no critical a11y violations", async () => {
    const { container } = render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={() => {}} />,
    );
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });

  it("PhonePreview empty state has no critical a11y violations", async () => {
    const { container } = render(<PhonePreview src={null} />);
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });

  it("PhonePreview with src has no critical a11y violations", async () => {
    const { container } = render(
      <PhonePreview src="https://example.com/preview" />,
    );
    // Exclude the iframe from axe scanning since jsdom cannot handle frames
    const iframe = container.querySelector("iframe");
    if (iframe) iframe.remove();
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });

  it("AccuracyReportPanel has no critical a11y violations", async () => {
    const { container } = render(
      <AccuracyReportPanel report={mockReport} />,
    );
    await expect(checkA11y(container)).resolves.toBeUndefined();
  });
});
