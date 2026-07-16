import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // better-sqlite3 is a native addon; forks avoids worker_threads edge cases.
    pool: "forks",
  },
});
