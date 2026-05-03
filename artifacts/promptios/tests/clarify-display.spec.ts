import { test, expect } from "@playwright/test";
import { loadFixtures } from "./fixtures";
import { seededClarifyingQuestions } from "./seed-data";

test("renders the clarifying questions panel for an awaiting_clarification project", async ({ page }) => {
  const { awaitingProjectId } = loadFixtures();
  await page.goto(`/projects/${awaitingProjectId}`);

  await expect(page.getByText("Clarifying Questions")).toBeVisible();

  for (const q of seededClarifyingQuestions) {
    await expect(page.getByTestId(`clarify-input-${q.id}`)).toBeVisible();
  }
  await expect(page.getByTestId("btn-submit-clarifications")).toBeVisible();
  await expect(page.getByTestId("btn-skip-clarifications")).toBeVisible();
  await expect(page.getByTestId("btn-use-suggestions")).toBeVisible();
});

test("'Use suggested defaults' fills inputs with the suggested answers", async ({ page }) => {
  const { awaitingProjectId } = loadFixtures();
  await page.goto(`/projects/${awaitingProjectId}`);

  await page.getByTestId("btn-use-suggestions").click();

  for (const q of seededClarifyingQuestions) {
    const input = page.getByTestId(`clarify-input-${q.id}`);
    await expect(input).toHaveValue(q.suggestion ?? "");
  }
});
