// Deterministic AI player adapter (Bridge plan §10.3): wraps the rule
// interpreter as an AsyncDecider the Game controller can seat. Human (Phase 5)
// and BEN (Phase 11) adapters implement the same interface.

import type { SettingValue } from "@bridge/config";
import { mulberry32 } from "@bridge/events";
import type { AsyncDecider } from "../game";
import { interpretBid, interpretPlay } from "./interpreter";
import type { SelectionPolicy } from "./policies";
import type { BridgeRulePackage } from "./schema";

export interface PackageDeciderOptions {
  pkg: BridgeRulePackage;
  values: Record<string, SettingValue>;
  policy?: SelectionPolicy;
  /** Seed for the "random" policy; decisions stay reproducible per seed. */
  rngSeed?: number;
}

export function createPackageDecider(opts: PackageDeciderOptions): AsyncDecider {
  const rng = mulberry32(opts.rngSeed ?? 1);
  const interpreterOpts = {
    pkg: opts.pkg,
    values: opts.values,
    policy: opts.policy ?? "first_match",
    rng,
  };
  return {
    decideBid: async (state, seat) => interpretBid(state, seat, interpreterOpts),
    decidePlay: async (state, seat) => interpretPlay(state, seat, interpreterOpts),
  };
}
