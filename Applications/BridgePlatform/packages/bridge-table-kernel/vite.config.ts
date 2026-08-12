// Library build: ONE ESM file, nothing external — the whole point is that a
// host (the native coach app) vendors dist/table-kernel.js by path and gets
// the game law with zero dependencies to resolve. mitt (the event bus's only
// dep) is bundled in; there is no React anywhere in the law layer.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "table-kernel.js" },
    rollupOptions: { external: [] },
    sourcemap: true,
    emptyOutDir: true,
  },
});
