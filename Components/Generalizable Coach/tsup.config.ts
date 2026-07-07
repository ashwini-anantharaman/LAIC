import { defineConfig } from "tsup";

// Bundles the public API (index.ts) to an ESM file + type declarations.
// esbuild resolves the ".js" specifiers to their ".ts" sources and inlines the
// knowledge JSON, producing a single self-contained module any UI can import.
// The server entry (domains/bridge/api/server.ts, express/node) is intentionally
// not part of this bundle — it stays a Node-run script.
export default defineConfig({
  entry: { index: "index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
});
