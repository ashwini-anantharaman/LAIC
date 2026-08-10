// Library build: ONE ESM file plus types, with React left external.
//
// Everything else is bundled IN on purpose — the whole point of this package is
// that a host installs it and gets a table, without inheriting a pnpm workspace
// or a Next app. @bridge/* are workspace sources, so they are compiled into the
// output rather than required at runtime.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "table-embed.js" },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
