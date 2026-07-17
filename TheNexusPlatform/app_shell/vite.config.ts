import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Offline service worker. The per-app web manifest is injected at runtime
    // by the Player (src/pwa.ts) so a shared link installs as the specific app,
    // not as the Studio — hence `manifest: false` here.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      devOptions: { enabled: false },
      workbox: { globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"] },
    }),
  ],
  server: { port: 5175 },
});
