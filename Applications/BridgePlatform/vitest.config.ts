import { defineConfig } from "vitest/config";

// Single root config: all workspace packages' tests run via `pnpm test` at the
// workspace root. Packages stay free of per-package vitest wiring.
export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/**/app/**/*.test.ts",
      "services/**/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
