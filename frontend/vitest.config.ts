import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "shared/tests/**/*.test.ts",
      "web/src/**/*.test.ts",
      "mobile/src/**/*.test.ts",
    ],
  },
});
