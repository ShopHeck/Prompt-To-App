import { test, expect } from "@playwright/test";

/**
 * Live end-to-end test for the SKIP path:
 *   vague prompt -> clarifying questions panel -> click Skip -> plan rendered.
 *
 * This test exercises the real LLM (clarify + planning calls), so it can be
 * slow. The build phase is intentionally NOT exercised here — see
 * accuracy-workspace.spec.ts and shared-view.spec.ts for the rendering of the
 * post-build accuracy report (driven from seeded data).
 */
test("skip path bypasses clarifications and surfaces the plan", async ({ page }) => {
  test.setTimeout(360_000);

  const projectName = `SkipPathE2E-${Date.now()}`;

  await page.goto("/projects/new");
  await page.getByTestId("input-name").fill(projectName);
  await page.getByTestId("textarea-prompt").fill("build me a fitness app");
  await page.getByTestId("radio-swiftui").click();
  await page.getByTestId("btn-submit").click();

  await page.waitForURL(/\/projects\/\d+/, { timeout: 30_000 });

  // Wait up to 90s for clarifying questions to stream in.
  await expect(page.getByTestId("btn-skip-clarifications")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Clarifying Questions")).toBeVisible();

  // Skip without filling any answer.
  await page.getByTestId("btn-skip-clarifications").click();

  // Wait up to 180s for the plan + approve button to appear.
  await expect(page.getByTestId("btn-approve-plan")).toBeVisible({ timeout: 180_000 });

  // Clarifying-questions panel should be gone.
  await expect(page.getByText("Clarifying Questions")).not.toBeVisible();
});
