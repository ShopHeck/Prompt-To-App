import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import {
  AccuracyReportPanel,
  type AccuracyReport,
} from "../accuracy-report-panel";

const mockReport: AccuracyReport = {
  overallScore: 87,
  summary: "Most screens and models implemented correctly",
  items: [
    {
      type: "screen",
      name: "HomeScreen",
      status: "matched",
      confidence: 0.95,
      notes: "Fully implemented",
    },
    {
      type: "screen",
      name: "ProfileScreen",
      status: "missing",
      confidence: 0.0,
      notes: "Not found in output",
    },
    {
      type: "model",
      name: "User",
      status: "matched",
      confidence: 0.9,
    },
    {
      type: "model",
      name: "Settings",
      status: "off-spec",
      confidence: 0.6,
      notes: "Missing required fields",
    },
    {
      type: "file",
      name: "App.swift",
      status: "matched",
      confidence: 1.0,
    },
  ],
};

describe("AccuracyReportPanel", () => {
  it("returns null when report is null", () => {
    const { container } = render(<AccuracyReportPanel report={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders overall score", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByText("87/100")).toBeInTheDocument();
  });

  it("renders the summary text when expanded", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(
      screen.getByText("Most screens and models implemented correctly"),
    ).toBeInTheDocument();
  });

  it("renders items with matched status", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByText("HomeScreen")).toBeInTheDocument();
  });

  it("renders items with missing status", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByText("ProfileScreen")).toBeInTheDocument();
  });

  it("renders items with off-spec status", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows count summary in header", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByText(/3 matched/)).toBeInTheDocument();
    expect(screen.getByText(/1 missing/)).toBeInTheDocument();
    expect(screen.getByText(/1 off-spec/)).toBeInTheDocument();
  });

  it("hides content when defaultCollapsed is true", () => {
    render(<AccuracyReportPanel report={mockReport} defaultCollapsed={true} />);
    expect(
      screen.queryByText("Most screens and models implemented correctly"),
    ).not.toBeInTheDocument();
  });

  it("toggles collapsed state on click", async () => {
    const user = userEvent.setup();
    render(<AccuracyReportPanel report={mockReport} defaultCollapsed={true} />);

    // Should be collapsed initially
    expect(screen.queryByText("HomeScreen")).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText("Accuracy Report"));
    expect(screen.getByText("HomeScreen")).toBeInTheDocument();
  });

  it("renders data-testid attribute", () => {
    render(<AccuracyReportPanel report={mockReport} />);
    expect(screen.getByTestId("accuracy-report-panel")).toBeInTheDocument();
  });
});
