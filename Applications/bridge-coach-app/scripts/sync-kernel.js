#!/usr/bin/env node
// Vendor the table kernel: copy the built artifact from the platform
// workspace into lib/vendor/table-kernel/. The app is an npm tree and the
// platform is a pnpm workspace — a built, dependency-free bundle crossing by
// copy is the one mechanism that dodges every resolution problem between
// them (the @bridge/table-embed package documents the same pattern).
//
//   npm run sync:kernel        — copies dist/* (build the kernel first:
//                                `pnpm --filter @bridge/table-kernel build`
//                                in Applications/BridgePlatform)
//
// The copy is COMMITTED. Both trees live in one git repo, so kernel drift is
// visible in a single diff; this script makes refresh one command.

const { copyFileSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const KERNEL_DIST = join(
  __dirname,
  "..",
  "..",
  "BridgePlatform",
  "packages",
  "bridge-table-kernel",
  "dist",
);
const VENDOR = join(__dirname, "..", "lib", "vendor", "table-kernel");

const FILES = ["table-kernel.js", "table-kernel.d.ts", "table-kernel.js.map"];

if (!existsSync(join(KERNEL_DIST, "table-kernel.js"))) {
  console.error(
    `No built kernel at ${KERNEL_DIST} — run \`pnpm --filter @bridge/table-kernel build\` in Applications/BridgePlatform first.`,
  );
  process.exit(1);
}

mkdirSync(VENDOR, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(KERNEL_DIST, file), join(VENDOR, file));
  console.log(`vendored ${file}`);
}
