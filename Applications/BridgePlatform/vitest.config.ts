import { fileURLToPath } from "node:url";
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
  // `@/…` is the app's own tsconfig path (apps/bridge-web/tsconfig.json), and
  // Next resolves it in the real build. Vitest reads no tsconfig paths, so
  // without this any app module that uses the alias — or that imports one that
  // does — is untestable: the import simply fails to resolve. Mirrors the
  // tsconfig entry exactly; there is only one app.
  resolve: {
    alias: { "@/": fileURLToPath(new URL("./apps/bridge-web/", import.meta.url)) },
  },
});
