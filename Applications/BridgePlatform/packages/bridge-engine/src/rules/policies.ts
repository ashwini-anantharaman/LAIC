// Rule-selection policies, carried over from the prototype's semantics:
// first_match (default, deterministic), random (seeded), narrowest (prefers
// the rule stating the tightest HCP range — reduces the shown range).

export type SelectionPolicy = "first_match" | "random" | "narrowest";

export interface SelectableMatch<A> {
  ruleId: string;
  title: string;
  action: A;
  /** Width of the rule's stated HCP range; null when it states none. */
  hcpWidth: number | null;
}

export function selectMatch<M extends SelectableMatch<unknown>>(
  matches: readonly M[],
  policy: SelectionPolicy,
  rng?: () => number,
): M {
  if (!matches.length) throw new Error("selectMatch called with no matches");
  switch (policy) {
    case "first_match":
      return matches[0]!;
    case "random": {
      const r = rng ? rng() : 0;
      const i = Math.min(matches.length - 1, Math.floor(r * matches.length));
      return matches[i]!;
    }
    case "narrowest": {
      let best = matches[0]!;
      for (const m of matches) {
        const bw = best.hcpWidth ?? 41;
        const mw = m.hcpWidth ?? 41;
        if (mw < bw) best = m;
      }
      return best;
    }
  }
}
