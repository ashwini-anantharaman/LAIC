// Pin vitest to this package — without a local config it walks up and loads
// TheNexusPlatform/vite.config.ts, whose deps aren't installed here.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { root: __dirname },
});
