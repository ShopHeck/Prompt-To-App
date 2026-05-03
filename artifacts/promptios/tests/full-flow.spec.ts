import { test, expect } from "@playwright/test";

/**
 * Full live end-to-end test: vague prompt -> clarifying questions ->
 * submit answers -> plan -> approve -> build -> accuracy report.
 *
 * This exercises the real LLM through every phase (clarify, plan, build,
 * validate) and the SSE state machine on the frontend. It is the primary
 * regression test for the new clarify + accuracy flow, and is allowed up
 * to 8 minutes because the build phase performs multi-pass code
 * generation + validation.
 */
test("vague prompt -> clarify -> submit -> approve -> accuracy report", async ({ page }) => {
  test.setTimeout(8 * 60_000);

  const projectName = `FullFlowE2E-${Date.now()}`;

  await page.goto("/projects/new");
  await page.getByTestId("input-name").fill(projectName);
  await page.getByTestId("textarea-prompt").fill("make me a simple notes app");
  await page.getByTestId("radio-swiftui").click();
  await page.getByTestId("btn-submit").click();
  await page.waitForURL(/\/projects\/\d+/, { timeout: 30_000 });

  // Phase 1: clarifying questions stream in via SSE.
  await expect(page.getByTestId("btn-submit-clarifications")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Clarifying Questions")).toBeVisible();

  // Use suggested defaults to fill any inputs, then submit.
  await page.getByTestId("btn-use-suggestions").click();
  await page.getByTestId("btn-submit-clarifications").click();

  // Phase 2: planning streams in, awaiting approval.
  await expect(page.getByTestId("btn-approve-plan")).toBeVisible({ timeout: 180_000 });

  // The read-only Clarifications summary should be visible above the plan.
  await expect(page.getByText("Clarifications").first()).toBeVisible();

  // Phase 3: approve, then build + validate run.
  await page.getByTestId("btn-approve-plan").click();

  // Phase 4: accuracy report appears once build + validation complete.
  const panel = page.getByTestId("accuracy-report-panel");
  await expect(panel).toBeVisible({ timeout: 6 * 60_000 });
  await expect(panel.getByText(/\d+\/100/)).toBeVisible();

  // Expand the panel and check the grouped item structure.
  await panel.getByRole("button", { name: /Accuracy Report/i }).click();
  await expect(panel.getByText(/screens \(\d+\)/)).toBeVisible();
  await expect(panel.getByText(/models \(\d+\)/)).toBeVisible();
  await expect(panel.getByText(/files \(\d+\)/)).toBeVisible();
});
