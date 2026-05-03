import { test, expect } from "@playwright/test";
import { loadFixtures } from "./fixtures";
import {
  seededAccuracyReport,
  seededClarifyAnswers,
} from "./seed-data";

test("project workspace shows clarifications and accuracy report for a complete project", async ({ page }) => {
  const { completeProjectId } = loadFixtures();
  await page.goto(`/projects/${completeProjectId}`);

  await expect(page.getByText("Clarifications").first()).toBeVisible();
  for (const a of seededClarifyAnswers) {
    await expect(page.getByText(a.answer)).toBeVisible();
  }

  const panel = page.getByTestId("accuracy-report-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(`${seededAccuracyReport.overallScore}/100`)).toBeVisible();

  // Expand the panel (collapsed by default for completed projects on the workspace).
  await panel.getByRole("button", { name: /Accuracy Report/i }).click();

  const screenItems = seededAccuracyReport.items.filter(i => i.type === "screen");
  const modelItems = seededAccuracyReport.items.filter(i => i.type === "model");
  const fileItems = seededAccuracyReport.items.filter(i => i.type === "file");

  await expect(panel.getByText(`screens (${screenItems.length})`)).toBeVisible();
  await expect(panel.getByText(`models (${modelItems.length})`)).toBeVisible();
  await expect(panel.getByText(`files (${fileItems.length})`)).toBeVisible();

  for (const item of seededAccuracyReport.items.filter(i => i.status !== "matched")) {
    await expect(panel.getByText(item.name).first()).toBeVisible();
  }

  await expect(panel.getByText(/Repair history/i)).toBeVisible();
  await expect(panel.getByText(/72/)).toBeVisible();
  await expect(panel.getByText(/88/).first()).toBeVisible();
});
