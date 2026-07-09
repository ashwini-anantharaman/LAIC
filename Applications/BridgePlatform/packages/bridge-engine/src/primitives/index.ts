// Registry of COMPLEX PRIMITIVES: engine code implementing multi-step logic
// that pure rule data can't express (execution plan §1, locked decision 2).
// Each primitive's behavior must be specified by cited human-readable
// knowledge items before rules in a published package may invoke it; the
// `specifiedBy` field holds those knowledge item ids (empty until Phase 3
// authors them, which blocks published-package use — validatePackage +
// interpreter both refuse unbound primitives).

export interface ComplexPrimitiveInfo {
  name: string;
  description: string;
  /** Knowledge item ids that specify this primitive's behavior. */
  specifiedBy: string[];
}

export const COMPLEX_PRIMITIVES: Record<string, ComplexPrimitiveInfo> = {
  range_inference: {
    name: "range_inference",
    description:
      "Constraint-store auction walk inferring each seat's shown HCP/shape range, interpreting calls only via the config's own definitions (ported from the prototype's judgment layer). Consumed standalone today; bid-rule bindings arrive with the knowledge items that specify them.",
    specifiedBy: [],
  },
};

export const KNOWN_PRIMITIVES: ReadonlySet<string> = new Set(
  Object.keys(COMPLEX_PRIMITIVES),
);

export { inferRanges, type SeatRange } from "./rangeInference";
