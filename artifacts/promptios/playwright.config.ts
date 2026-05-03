import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80";

/**
 * The promptios artifact is served by the workspace-managed dev workflows
 * (`artifacts/promptios: web` + `artifacts/api-server: API Server`), which
 * are exposed to Playwright through the shared proxy at `localhost:80`. We
 * therefore do NOT spawn a `webServer` here; instead we expect the workflows
 * to already be running. To run against a published deployment, override
 * `PLAYWRIGHT_BASE_URL` (e.g. `PLAYWRIGHT_BASE_URL=https://<repl-domain>`).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
