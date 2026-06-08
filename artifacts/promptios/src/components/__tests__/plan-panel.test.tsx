import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PlanPanel, type ArchitecturePlan } from "../plan-panel";

const mockPlan: ArchitecturePlan = {
  screens: [
    { name: "HomeScreen", purpose: "Main dashboard view" },
    { name: "SettingsScreen", purpose: "User settings" },
  ],
  models: [
    { name: "User", fields: ["id", "name", "email", "avatar"] },
    { name: "Post", fields: ["id", "title", "body"] },
  ],
  navigation: "Tab-based navigation with Home and Settings tabs",
  spmDependencies: [],
  fileList: [
    { filename: "HomeScreen.swift", purpose: "Main view" },
    { filename: "SettingsScreen.swift", purpose: "Settings view" },
  ],
};

describe("PlanPanel", () => {
  it("returns null when no plan and not streaming", () => {
    const { container } = render(
      <PlanPanel plan={null} collapsed={false} onToggle={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders architecture plan header", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("Architecture Plan")).toBeInTheDocument();
  });

  it("renders screen names when expanded", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("HomeScreen")).toBeInTheDocument();
    expect(screen.getByText("SettingsScreen")).toBeInTheDocument();
  });

  it("renders model names when expanded", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
  });

  it("renders navigation info when expanded", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={() => {}} />,
    );
    expect(
      screen.getByText("Tab-based navigation with Home and Settings tabs"),
    ).toBeInTheDocument();
  });

  it("does not render content when collapsed", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={true} onToggle={() => {}} />,
    );
    expect(screen.queryByText("HomeScreen")).not.toBeInTheDocument();
  });

  it("calls onToggle when header is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <PlanPanel plan={mockPlan} collapsed={false} onToggle={onToggle} />,
    );
    await user.click(screen.getByText("Architecture Plan"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows planning badge when streaming", () => {
    render(
      <PlanPanel
        plan={null}
        isStreaming={true}
        collapsed={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText("Planning...")).toBeInTheDocument();
  });

  it("shows plan summary stats in collapsed header", () => {
    render(
      <PlanPanel plan={mockPlan} collapsed={true} onToggle={() => {}} />,
    );
    expect(screen.getByText(/2 screens/)).toBeInTheDocument();
    expect(screen.getByText(/2 models/)).toBeInTheDocument();
  });

  it("shows edit mode when editable", () => {
    render(
      <PlanPanel
        plan={mockPlan}
        editable={true}
        editedPlan={mockPlan}
        onEditedPlanChange={() => {}}
        collapsed={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText(/Review & Edit/)).toBeInTheDocument();
  });
});
