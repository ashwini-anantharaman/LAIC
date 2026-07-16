import { defineConfig } from "@playwright/test";

// §19.1 UI flows: table play, admin generation loop, progress. Runs against
// the dev server (stub auth via the bridge_dev_user cookie); workers=1
// because the flows share the JSON file stores.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
