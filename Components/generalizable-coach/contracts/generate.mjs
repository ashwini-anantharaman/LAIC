/**
 * Schema-first type generation (LAIC M0).
 *
 * Reads every JSON Schema in contracts/schemas/ and emits a matching TypeScript
 * type into contracts/generated/. Output is deterministic so the drift check
 * (tests/contracts/type-drift.test.ts) can compare generated-from-schema output
 * against what is committed and fail the build if they diverge.
 *
 *   node contracts/generate.mjs        # write generated/*.ts
 *   import { generateAll } from ...     # returns { [filename]: content } (drift test)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compile } from "json-schema-to-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(here, "schemas");
const OUT_DIR = path.join(here, "generated");

function banner(schemaFile) {
  return [
    "/* eslint-disable */",
    "/**",
    ` * AUTO-GENERATED from contracts/schemas/${schemaFile} — DO NOT EDIT BY HAND.`,
    " * Regenerate with: npm run contracts:gen",
    " */",
  ].join("\n");
}

/** Compile every schema to TS. Returns { "<Title>.ts": "<contents>" }. */
export async function generateAll() {
  const files = (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith(".schema.json")).sort();
  const out = {};
  for (const file of files) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, file), "utf8"));
    const ts = await compile(schema, schema.title, {
      // Sibling $refs (e.g. CoachNote -> ./PlatformContext.schema.json) are
      // resolved relative to the schema directory. Without a cwd the compiler
      // has no base to resolve them against and silently inlines `unknown`.
      cwd: `${SCHEMA_DIR}${path.sep}`,
      bannerComment: banner(file),
      additionalProperties: false,
      declareExternallyReferenced: true,
      style: { singleQuote: false, semi: true },
    });
    out[`${schema.title}.ts`] = ts;
  }
  // Barrel re-export, generated deterministically from the sorted titles.
  const titles = Object.keys(out).map((f) => f.replace(/\.ts$/, "")).sort();
  out["index.ts"] =
    `${banner("*")}\n` +
    titles.map((t) => `export type { ${t} } from "./${t}";`).join("\n") +
    "\n";
  return out;
}

async function main() {
  const out = await generateAll();
  for (const [file, content] of Object.entries(out)) {
    await writeFile(path.join(OUT_DIR, file), content, "utf8");
    process.stdout.write(`generated contracts/generated/${file}\n`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
