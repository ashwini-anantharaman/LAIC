/**
 * Guard for the two promises core.ts makes: no domain, no dependencies.
 *
 * Walks the import graph from core.ts and fails on
 *   · any path under domains/  — a host that doesn't play bridge must not carry it;
 *   · any bare specifier or node: builtin — the graph must stay installable-free
 *     so a Next app can consume it as source over a `link:` dependency.
 *
 * `import type` is erased at compile time, so type-only imports are exempt —
 * that is how the generated contracts stay reachable while the ajv-backed
 * validator does not.
 *
 * Run: node scripts/check-core-graph.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, "core.ts");

/** Strip comments and string literals so their contents can't look like imports. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Value imports/re-exports only: `import type` / `export type` are erased. */
function valueSpecifiers(src) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    // `import type {...}` / `export type {...}` — whole statement erased.
    if (/^\s*type\s/.test(clause)) continue;
    out.push({ spec: m[2], clause });
  }
  return out;
}

/** Members marked `type` inline are erased; a clause of only those is too. */
function isFullyTypeOnly(clause) {
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (!braces) return false;
  if (clause.slice(0, clause.indexOf("{")).trim().replace(/,$/, "")) return false;
  const members = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
  return members.length > 0 && members.every((s) => /^type\s/.test(s));
}

function resolve(spec, fromFile) {
  const abs = path.resolve(path.dirname(fromFile), spec);
  for (const c of [abs.replace(/\.js$/, ".ts"), `${abs}.ts`, path.join(abs, "index.ts")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const violations = [];
const seen = new Set();
const queue = [entry];

while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);

  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel.startsWith("domains/")) {
    violations.push(`${rel} — a domain is reachable from core.ts`);
    continue;
  }

  for (const { spec, clause } of valueSpecifiers(code(readFileSync(file, "utf8")))) {
    if (isFullyTypeOnly(clause)) continue;
    if (!spec.startsWith(".")) {
      violations.push(`${rel} imports "${spec}" — core.ts must stay dependency-free`);
      continue;
    }
    const next = resolve(spec, file);
    if (next) queue.push(next);
    else violations.push(`${rel} imports "${spec}" — unresolved`);
  }
}

if (violations.length) {
  console.error("core graph violations:\n  " + violations.join("\n  "));
  process.exit(1);
}
console.log(`core graph clean — ${seen.size} modules, no domain, no dependencies`);
