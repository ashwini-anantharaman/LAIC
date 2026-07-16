import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Base Capacitor config. For a real per-app native build, the packaging
 * generator (scripts/package-app.mjs) overwrites `appId` / `appName` from the
 * published app's build manifest, and the built web assets (`dist/`) plus a
 * generated `published-config.js` are synced in. See docs/native-build.md.
 */
const config: CapacitorConfig = {
  appId: "org.laic.appshell",
  appName: "App Shell",
  webDir: "dist",
};

export default config;
