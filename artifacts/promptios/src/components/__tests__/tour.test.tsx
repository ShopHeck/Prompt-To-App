import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockPath = "/dashboard";
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => [mockPath, vi.fn()] as const,
  };
});

import { TourProvider } from "../tour";

describe("TourProvider auto-start gating", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderOn(path: string) {
    mockPath = path;
    render(
      <TourProvider>
        <input data-testid="page-input" />
      </TourProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
  }

  it("auto-starts on /dashboard for first-time visitors", async () => {
    await renderOn("/dashboard");
    expect(screen.getByTestId("tour-overlay")).toBeInTheDocument();
  });

  it("never mounts the overlay on /auth — the signup form must stay typable", async () => {
    await renderOn("/auth");
    expect(screen.queryByTestId("tour-overlay")).toBeNull();
  });

  it("does not auto-start on the landing page or shared views", async () => {
    await renderOn("/");
    expect(screen.queryByTestId("tour-overlay")).toBeNull();
  });

  it("does not auto-start when the tour was already seen", async () => {
    window.localStorage.setItem("promptios.tour.seen.v1", "1");
    await renderOn("/dashboard");
    expect(screen.queryByTestId("tour-overlay")).toBeNull();
  });

  it("does not re-spawn after dismissal even when localStorage writes throw", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      await renderOn("/dashboard");
      expect(screen.getByTestId("tour-overlay")).toBeInTheDocument();

      await act(async () => {
        screen.getByTestId("tour-skip-btn").click();
      });
      expect(screen.queryByTestId("tour-overlay")).toBeNull();

      // The storage write failed, but the session ref must keep it dismissed.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.queryByTestId("tour-overlay")).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });
});
