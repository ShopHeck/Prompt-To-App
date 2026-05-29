import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
  },
});
