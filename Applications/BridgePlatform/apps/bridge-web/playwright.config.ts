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
      // .next-e2e is wiped along with the store: a stale turbopack chunk once
      // kept serving a rewritten route's OLD code (and the cache's >100MB
      // files broke Vercel uploads). Wiped via node so the command runs on
      // Windows too — `rm -rf` and inline VAR= prefixes only worked on POSIX.
      'node -e "for (const d of [\'.data-e2e\',\'.next-e2e\']) require(\'fs\').rmSync(d, {recursive: true, force: true})" && pnpm next dev --port 3105',
    env: {
      // Stripped so extraction/augmentation stay deterministic (the UI shows
      // its needs-a-key note instead of spending real tokens mid-test).
      ANTHROPIC_API_KEY: "",
      BRIDGE_DATA_DIR: ".data-e2e",
      NEXT_DIST_DIR: ".next-e2e",
      // The suite IS the stub suite (helpers.ts signs in via the dev-user
      // cookie) — pinned here so a developer's .env pointing at a live Nexus
      // (NEXUS_CLIENT_MODE=http) can't flip the mode under the tests.
      NEXUS_CLIENT_MODE: "stub",
    },
    port: 3105,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
