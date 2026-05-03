import { test, expect } from "@playwright/test";
import { loadFixtures } from "./fixtures";
import {
  seededAccuracyReport,
  seededClarifyAnswers,
} from "./seed-data";

test("shared read-only view shows clarifications, accuracy report, and files", async ({ page }) => {
  const { shareToken } = loadFixtures();
  await page.goto(`/share/${shareToken}`);

  await expect(page.getByText(/Shared Read-Only/i)).toBeVisible();

  await expect(page.getByText("Clarifications").first()).toBeVisible();
  for (const a of seededClarifyAnswers) {
    await expect(page.getByText(a.answer)).toBeVisible();
  }

  const panel = page.getByTestId("accuracy-report-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(`${seededAccuracyReport.overallScore}/100`)).toBeVisible();

  // Shared view defaults to collapsed; expand it.
  await panel.getByRole("button", { name: /Accuracy Report/i }).click();

  const screenItems = seededAccuracyReport.items.filter(i => i.type === "screen");
  const modelItems = seededAccuracyReport.items.filter(i => i.type === "model");
  const fileItems = seededAccuracyReport.items.filter(i => i.type === "file");

  await expect(panel.getByText(`screens (${screenItems.length})`)).toBeVisible();
  await expect(panel.getByText(`models (${modelItems.length})`)).toBeVisible();
  await expect(panel.getByText(`files (${fileItems.length})`)).toBeVisible();

  await expect(panel.getByText(/Repair history/i)).toBeVisible();

  await expect(page.getByText("Package.swift").first()).toBeVisible();
});
