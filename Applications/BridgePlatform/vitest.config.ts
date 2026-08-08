import { defineConfig } from "vitest/config";

// Single root config: all workspace packages' tests run via `pnpm test` at the
// workspace root. Packages stay free of per-package vitest wiring.
export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/**/app/**/*.test.ts",
      "apps/**/lib/**/*.test.ts",
      "services/**/src/**/*.test.ts",
    ],
    environment: "node",
  },
  // The app tsconfigs say jsx:"preserve" (Next compiles it), which leaves
  // esbuild on the classic runtime and a component rendered inside a test
  // reaching for a global `React`. The automatic runtime is what Next uses in
  // the real build, so tests transform the same way the app does.
  esbuild: { jsx: "automatic" },
});
