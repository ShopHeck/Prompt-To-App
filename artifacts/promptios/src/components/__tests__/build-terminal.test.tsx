import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BuildTerminal, type LogLine } from "../build-terminal";

function makeLine(overrides: Partial<LogLine> & { id: number }): LogLine {
  return {
    time: Date.now(),
    kind: "info",
    text: "test message",
    ...overrides,
  };
}

describe("BuildTerminal", () => {
  it("renders empty state when no lines", () => {
    render(<BuildTerminal lines={[]} active={false} />);
    expect(screen.getByText(/awaiting agent/)).toBeInTheDocument();
  });

  it("renders log lines with correct text", () => {
    const lines: LogLine[] = [
      makeLine({ id: 1, kind: "info", text: "Starting build..." }),
      makeLine({ id: 2, kind: "build", text: "Compiling sources" }),
      makeLine({ id: 3, kind: "error", text: "Failed to compile" }),
    ];
    render(<BuildTerminal lines={lines} active={false} />);

    expect(screen.getByText("Starting build...")).toBeInTheDocument();
    expect(screen.getByText("Compiling sources")).toBeInTheDocument();
    expect(screen.getByText("Failed to compile")).toBeInTheDocument();
  });

  it("renders the correct kind labels", () => {
    const lines: LogLine[] = [
      makeLine({ id: 1, kind: "info", text: "msg1" }),
      makeLine({ id: 2, kind: "error", text: "msg2" }),
      makeLine({ id: 3, kind: "build", text: "msg3" }),
      makeLine({ id: 4, kind: "validate", text: "msg4" }),
    ];
    render(<BuildTerminal lines={lines} active={false} />);

    expect(screen.getAllByText("info").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("error").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("build").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("validate").length).toBeGreaterThanOrEqual(1);
  });

  it("shows live indicator when active", () => {
    const lines: LogLine[] = [makeLine({ id: 1 })];
    render(<BuildTerminal lines={lines} active={true} />);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("does not show live indicator when inactive", () => {
    const lines: LogLine[] = [makeLine({ id: 1 })];
    render(<BuildTerminal lines={lines} active={false} />);
    expect(screen.queryByText("live")).not.toBeInTheDocument();
  });

  it("shows the terminal header with agent.log label", () => {
    render(<BuildTerminal lines={[]} active={false} />);
    expect(screen.getByText("agent.log")).toBeInTheDocument();
  });

  it("renders the data-testid attribute", () => {
    render(<BuildTerminal lines={[]} active={false} />);
    expect(screen.getByTestId("build-terminal")).toBeInTheDocument();
  });
});
