// Id + hash helpers. FNV-1a (no crypto dependency, deterministic) — the same
// mechanism session pinning used before the rework.

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable stringify: object keys sorted at every level. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashValue(value: unknown): string {
  return fnv1a(stableStringify(value));
}

let counter = 0;

/** Collision-safe-enough ids for a single-writer store: time + counter. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 0xffff;
  const t = Date.now().toString(36);
  const c = counter.toString(36).padStart(3, "0");
  return `${prefix}_${t}${c}`;
}
