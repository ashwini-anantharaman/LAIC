/**
 * M0 CI gate — generated types must match the schemas.
 *
 * Regenerates TypeScript from the JSON Schemas in memory and compares against
 * the committed files in contracts/generated/. If they differ, someone edited a
 * schema (or a generated file) without running `npm run contracts:gen`, and the
 * build fails. This is what keeps "no hand-mirrored types" true.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
// @ts-expect-error — .mjs generator has no type declarations; runtime import only.
import { generateAll } from "../../contracts/generate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const GEN_DIR = path.join(here, "..", "..", "contracts", "generated");

describe("type drift", () => {
  it("committed generated types match a fresh generation from the schemas", async () => {
    const fresh = (await generateAll()) as Record<string, string>;
    const stale: string[] = [];

    for (const [file, content] of Object.entries(fresh)) {
      let committed: string | null;
      try {
        committed = await readFile(path.join(GEN_DIR, file), "utf8");
      } catch {
        committed = null;
      }
      if (committed !== content) stale.push(file);
    }

    expect(
      stale,
      `Generated types are out of date for: ${stale.join(", ")}. Run: npm run contracts:gen`,
    ).toEqual([]);
  });
});
