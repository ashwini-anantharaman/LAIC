// Put the hand-authored declarations beside the bundle, twice: index.d.ts is
// what the package's own `types` field points at; table-kernel.d.ts is what a
// host that VENDORS dist/ and imports './table-kernel.js' BY PATH gets —
// TypeScript substitutes a sibling .d.ts for a .js import (the table-embed
// package documents the same trick).
import { copyFileSync } from "node:fs";

copyFileSync("types/table-kernel.d.ts", "dist/index.d.ts");
copyFileSync("types/table-kernel.d.ts", "dist/table-kernel.d.ts");
console.log("types copied to dist/");
