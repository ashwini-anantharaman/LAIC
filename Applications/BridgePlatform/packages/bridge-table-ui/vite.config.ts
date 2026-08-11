// Design-system build (design-sync). Emits a self-contained ESM artifact for
// the Claude Design converter to bundle — the workspace siblings it imports
// (@bridge/events, @bridge/table-config) are compiled IN so the artifact needs
// nothing but React at runtime.
//
// This is ADDITIVE. The package's own `main`/`exports` still point at src/, so
// bridge-web keeps compiling the TypeScript sources through Next exactly as
// before; nothing here changes how the app consumes the library.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "index.js" },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
