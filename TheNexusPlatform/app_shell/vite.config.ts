import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5175: platform_logic dev server owns 5180, learning app 5190.
// The @laic/app-shell package is consumed as source via alias until it grows
// its own build step / npm publishing.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  resolve: {
    alias: [
      {
        find: /^@laic\/app-shell$/,
        replacement: fileURLToPath(new URL("./packages/app-shell/src/index.ts", import.meta.url)),
      },
    ],
  },
});
