#!/usr/bin/env node
/**
 * package-app — expand a Studio "build package" (.json) into a Capacitor-ready
 * build folder. This is the CLI half of Publish: the browser freezes the app
 * into a JSON; this turns it into the exact inputs a native build consumes.
 *
 *   node scripts/package-app.mjs <appshell-build.json> [outDir]
 *   pnpm package <appshell-build.json>
 *
 * Output (default build/<slug>/):
 *   build-manifest.json      frozen identity/theme/bundle IDs
 *   capacitor.config.json    per-app Capacitor config (appId/appName)
 *   config.json              the full AppShellConfig
 *   published-config.js      sets window.__PUBLISHED_CONFIG__ (baked into the app)
 *   resources/*.png          icons + splash for native tooling
 *
 * It intentionally has ZERO dependencies and does no signing — that's the CI's
 * job (see docs/native-build.md).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

function die(msg) {
  console.error(`package-app: ${msg}`);
  process.exit(1);
}

const [, , inputArg, outArg] = process.argv;
if (!inputArg) die("usage: node scripts/package-app.mjs <appshell-build.json> [outDir]");

let data;
try {
  data = JSON.parse(readFileSync(resolve(inputArg), "utf8"));
} catch (e) {
  die(`could not read/parse ${inputArg}: ${e.message}`);
}
if (data.kind !== "appshell-build" || !data.manifest || !data.config) {
  die("not a valid App Shell build package (expected { kind: 'appshell-build', manifest, config }).");
}

const { manifest, config, icons = {} } = data;
const outDir = resolve(outArg || join("build", manifest.slug));
const resDir = join(outDir, "resources");
mkdirSync(resDir, { recursive: true });

// 1. frozen manifest + raw config
writeFileSync(join(outDir, "build-manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(join(outDir, "config.json"), JSON.stringify(config, null, 2));

// 2. per-app Capacitor config
const capConfig = {
  appId: manifest.bundleId,
  appName: manifest.displayName,
  webDir: "www",
  backgroundColor: manifest.theme.backgroundColor,
};
writeFileSync(join(outDir, "capacitor.config.json"), JSON.stringify(capConfig, null, 2));

// 3. the app, baked in as a global so the packaged build boots into itself
writeFileSync(
  join(outDir, "published-config.js"),
  `window.__PUBLISHED_CONFIG__ = ${JSON.stringify(config)};\n`,
);

// 4. decode PNG assets
let assetCount = 0;
for (const [name, b64] of Object.entries(icons)) {
  if (typeof b64 !== "string" || !b64) continue;
  writeFileSync(join(resDir, name), Buffer.from(b64, "base64"));
  assetCount++;
}

console.log(`✓ Packaged "${manifest.displayName}" (${manifest.bundleId}) v${manifest.version}`);
console.log(`  → ${outDir}`);
console.log(`    build-manifest.json · capacitor.config.json · config.json · published-config.js · resources/ (${assetCount} assets)`);
console.log("");
console.log("Next (native build — see docs/native-build.md):");
console.log("  1. pnpm build                       # build the web app → dist/");
console.log("  2. cp -r dist <outDir>/www          # web assets for Capacitor");
console.log("  3. cp <outDir>/published-config.js <outDir>/www/  &&  reference it in www/index.html");
console.log("  4. cp <outDir>/capacitor.config.json ./           # activate this variant");
console.log("  5. npx cap add ios android  &&  npx cap sync       # (iOS needs macOS)");
console.log("  6. build & sign via CI (Codemagic / GitHub Actions) → TestFlight / Play internal");
