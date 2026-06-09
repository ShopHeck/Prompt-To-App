import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PhonePreview } from "../phone-preview";

describe("PhonePreview", () => {
  it("shows loading spinner when isGenerating is true", () => {
    render(<PhonePreview src={null} isGenerating={true} />);
    expect(screen.getByText("Rendering preview\u2026")).toBeInTheDocument();
  });

  it("renders iframe with src when available", () => {
    render(<PhonePreview src="https://example.com/preview" />);
    const iframe = screen.getByTitle("App preview");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://example.com/preview");
  });

  it("shows empty hint when no src and not generating", () => {
    render(<PhonePreview src={null} />);
    expect(screen.getByText("No preview yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The live preview is rendered after the first successful build.",
      ),
    ).toBeInTheDocument();
  });

  it("shows custom empty hint when provided", () => {
    render(<PhonePreview src={null} emptyHint="Custom empty message" />);
    expect(screen.getByText("Custom empty message")).toBeInTheDocument();
  });

  it("does not show iframe when generating", () => {
    render(<PhonePreview src="https://example.com" isGenerating={true} />);
    expect(screen.queryByTitle("App preview")).not.toBeInTheDocument();
  });

  it("does not show empty hint when src is provided", () => {
    render(<PhonePreview src="https://example.com/preview" />);
    expect(screen.queryByText("No preview yet")).not.toBeInTheDocument();
  });
});
