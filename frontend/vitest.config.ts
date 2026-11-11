import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./scripts/test-environment.mjs"],
    include: [
      "shared/tests/**/*.test.ts",
      "web/src/**/*.test.{ts,tsx}",
      "mobile/src/**/*.test.ts",
    ],
  },
});
