import { defineConfig } from "@playwright/test";

// §19.1 UI flows: table play, admin generation loop, progress. Runs against
// its OWN dev server on 3105 with an isolated, freshly-wiped store
// (BRIDGE_DATA_DIR=.data-e2e) — e2e runs never pollute the .data store a
// human browses on :3000. workers=1 because flows share the JSON stores.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3105" },
  webServer: {
    command:
      "rm -rf .data-e2e && BRIDGE_DATA_DIR=.data-e2e NEXT_DIST_DIR=.next-e2e pnpm next dev --port 3105",
    port: 3105,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
