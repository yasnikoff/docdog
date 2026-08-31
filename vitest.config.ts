import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    // Pool: use forks (not threads) so each test file gets a clean process.
    // Sequential files: better-sqlite3 + temp-dir churn stay predictable on
    // Windows; the whole suite is a few seconds anyway.
    fileParallelism: false,
    pool: "forks",
  },
});
