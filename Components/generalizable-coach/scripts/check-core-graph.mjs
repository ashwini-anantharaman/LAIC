/**
 * Guard for the two promises core.ts makes: no domain, no dependencies.
 *
 * Walks the import graph from core.ts and fails on
 *   · any path under domains/  — a host that doesn't play bridge must not carry it;
 *   · any bare specifier or node: builtin — the graph must stay installable-free
 *     so a Next app can consume it as source over a `link:` dependency.
 *
 * TYPE IMPORTS COUNT TOO, for dependencies. They are erased at runtime, so the
 * original version exempted them entirely — and a single `import type
 * { LearnerDomainProfile } from "../../contracts/index"` then broke a Vercel
 * build, because `next build` TYPE-CHECKS, and tsc resolves the whole chain:
 * barrel → validator → ajv, which a `link:` dependency never installs. The
 * package imported cleanly and failed to compile.
 *
 * So the walk follows type-only edges as well, and reports a bare specifier
 * reached through one as its own class of failure — it will not break at run
 * time, and it will break the build.
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

/**
 * Every import/re-export, tagged with whether it is erased at runtime.
 *
 * An earlier version DISCARDED `import type` statements right here — which is
 * why adding the type-only walk below appeared to work and caught nothing: the
 * edges it was written to follow never reached it. Tag, never drop. The caller
 * decides what a type-only edge means, and for a bare specifier it means "tsc
 * still needs this installed".
 */
function specifiers(src) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    out.push({
      spec: m[2],
      typeOnly: /^\s*type\s/.test(clause) || isFullyTypeOnly(clause),
    });
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
/** Reached only through `import type` — harmless at runtime, fatal to tsc. */
const typeOnlyDeps = [];
const seen = new Set();
const queue = [{ file: entry, typeOnly: false }];

while (queue.length) {
  const { file, typeOnly } = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);

  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel.startsWith("domains/")) {
    violations.push(`${rel} — a domain is reachable from core.ts`);
    continue;
  }

  for (const { spec, typeOnly: stmtTypeOnly } of specifiers(code(readFileSync(file, "utf8")))) {
    // An edge is type-only if this import is, or if we already arrived here
    // through one — a value import inside a type-only module is still erased.
    const edgeTypeOnly = typeOnly || stmtTypeOnly;
    if (!spec.startsWith(".")) {
      const msg = `${rel} imports "${spec}"`;
      if (edgeTypeOnly) typeOnlyDeps.push(`${msg} — reached via import type: erased at runtime, still resolved by tsc`);
      else violations.push(`${msg} — core.ts must stay dependency-free`);
      continue;
    }
    const next = resolve(spec, file);
    if (next) queue.push({ file: next, typeOnly: edgeTypeOnly });
    else violations.push(`${rel} imports "${spec}" — unresolved`);
  }
}

const all = [...violations, ...typeOnlyDeps];
if (all.length) {
  console.error("core graph violations:\n  " + all.join("\n  "));
  process.exit(1);
}
console.log(
  `core graph clean — ${seen.size} modules, no domain, no dependencies (runtime or typecheck)`,
);
