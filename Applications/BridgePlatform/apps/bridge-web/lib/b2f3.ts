// B2F3 CURRICULUM COLLECTIONS (Pillar E) — the deterministic classifier that
// drafts three teachable knowledge sets from an existing KB's items:
//
//   B2F3 Beginner            — the natural core a first-year learner needs:
//                              openings, responses, raises, basic rebids, the
//                              card-play fundamentals, and the engine floor.
//   B2F3 Advanced Beginner   — adds basic competition and Stayman (extends
//                              Beginner).
//   B2F3 Intermediate        — adds transfers, the strong 2♣, slam conventions
//                              (Blackwood/RKCB/Gerber) and the advanced
//                              competitive gadgets (extends Advanced Beginner).
//
// This module is PURE and DETERMINISTIC: no LLM, no I/O, no clock. It reads a
// KnowledgeItem's own content — phase, payload kind, rule contexts/actions and
// title keywords — and returns a level plus a human rationale. It is authored
// to run server-side (from createB2F3CollectionsAction) but has no server-only
// dependency, so `arena.ts` can import the collection-name constants safely.
//
// The output is a DRAFT. Fellows adjust membership in the existing set builder;
// re-running the action regenerates the drafts from the classifier (pack
// version history preserves the prior state). "Standard teaching progression"
// is the ordering source — no syllabus document exists (owner decision).

import type { AuctionRuleSpec, KnowledgeItem } from "@bridge/kb";

// ---------------------------------------------------------------------------
// Levels & collection identity (single source of truth for the action + arena)
// ---------------------------------------------------------------------------

export type B2f3Level = "beginner" | "advanced_beginner" | "intermediate" | "out_of_scope";

/** Name prefix every B2F3 collection carries — the idempotency key (packs are
 *  matched by exact name) AND the marker `pickDefaultSet` uses to keep the
 *  quickplay default from silently switching to one of these supersets. */
export const B2F3_COLLECTION_PREFIX = "B2F3 ";

/** True for a pack that is one of the three B2F3 curriculum collections. */
export function isB2f3Collection(packName: string): boolean {
  return packName.startsWith(B2F3_COLLECTION_PREFIX);
}

/** The three collections, in ladder order. Each extends the previous, so its
 *  effective (compiled) roster is the union up the chain. */
export interface B2f3CollectionDef {
  level: Exclude<B2f3Level, "out_of_scope">;
  name: string;
  levelId: string;
  ordinal: number;
  description: string;
  /** Level of the collection this one extends (undefined for Beginner). */
  extendsLevel?: Exclude<B2f3Level, "out_of_scope">;
}

export const B2F3_COLLECTIONS: B2f3CollectionDef[] = [
  {
    level: "beginner",
    name: "B2F3 Beginner",
    levelId: "b2f3-beginner",
    ordinal: 0,
    description:
      "Draft · the natural core: opening bids, responses, raises, basic rebids, opening leads, signals and card-play fundamentals, over the engine floor. A complete first player. Adjust freely in the set builder.",
  },
  {
    level: "advanced_beginner",
    name: "B2F3 Advanced Beginner",
    levelId: "b2f3-advanced-beginner",
    ordinal: 1,
    extendsLevel: "beginner",
    description:
      "Draft · adds basic competition (overcalls, takeout and negative doubles, balancing) and Stayman on top of Beginner. Includes everything in B2F3 Beginner.",
  },
  {
    level: "intermediate",
    name: "B2F3 Intermediate",
    levelId: "b2f3-intermediate",
    ordinal: 2,
    extendsLevel: "advanced_beginner",
    description:
      "Draft · adds transfers, the strong 2♣, slam conventions (Blackwood, RKCB, Gerber) and the advanced competitive gadgets (Michaels, unusual 2NT, Jordan, cue-bid raises). Includes everything in B2F3 Advanced Beginner.",
  },
];

export interface B2f3Classification {
  level: B2f3Level;
  /** One sentence explaining the assignment — shown to fellows, stored nowhere. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Keyword vocabulary (matched against the lower-cased item TITLE). Ordered by
// specificity: an intermediate hit outranks an advanced-beginner hit.
// ---------------------------------------------------------------------------

/** Conventions and gadgets that belong at the intermediate rung. */
const INTERMEDIATE_KEYWORDS = [
  "transfer",
  "blackwood",
  "keycard",
  "roman key",
  "rkcb",
  "gerber",
  "grand slam",
  "slam",
  "michaels",
  "unusual 2nt",
  "unusual notrump",
  "jordan",
  "jacoby 2nt",
  "splinter",
  "cue-bid",
  "cue bid",
  "new minor forcing",
  "fourth suit forcing",
  "reverse",
  "jump shift",
  "5nt",
  "king ask",
  "dopi",
  "strong 2♣",
  "strong 2c",
  "artificial 2♣",
  "artificial 2c",
  "after the strong 2",
] as const;

/** Basic competition + Stayman: the first step past the natural core. */
const ADVANCED_BEGINNER_KEYWORDS = [
  "overcall",
  "takeout",
  "negative double",
  "stayman",
  "balancing",
  "redouble",
  "penalty",
  "competitive",
  "competition",
] as const;

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

const RANK: Record<Exclude<B2f3Level, "out_of_scope">, number> = {
  beginner: 0,
  advanced_beginner: 1,
  intermediate: 2,
};

function auctionRules(item: KnowledgeItem): AuctionRuleSpec[] {
  return item.payload.kind === "auction_rules" ? item.payload.rules : [];
}

/**
 * Classify one knowledge item into a B2F3 rung. Deterministic and content-only.
 *
 * Precedence:
 *  1. Scoring-phase items are out of the bidding/play curriculum.
 *  2. Card-play, lead and defense items are day-one fundamentals → beginner.
 *  3. The engine floor and the forcing-situation framework are infrastructure
 *     under all bidding → beginner.
 *  4. Otherwise take the HIGHEST rung signalled by: title keywords, a rule that
 *     declares a slam `ask` (Blackwood/RKCB/Gerber → intermediate), a rule bid
 *     from the overcaller/advancer seat (competition → advanced beginner), and
 *     a `convention` knowledge type (a gadget, not natural bidding → at least
 *     advanced beginner). With no signal an item is natural bidding → beginner.
 */
export function classifyB2f3Level(item: KnowledgeItem): B2f3Classification {
  if (item.phase === "scoring") {
    return {
      level: "out_of_scope",
      rationale: "Scoring is Law 77, outside the bidding-and-play curriculum.",
    };
  }

  if (item.phase === "opening_lead" || item.phase === "declarer_play" || item.phase === "defense") {
    return {
      level: "beginner",
      rationale: `Card-play fundamentals (${item.phase.replace("_", " ")}) — every learner needs these from the first lesson.`,
    };
  }

  if (item.payload.kind === "fallback") {
    return {
      level: "beginner",
      rationale: "Engine-floor fallback — foundational, carried by every rung.",
    };
  }

  if (item.payload.kind === "forcing_rules") {
    return {
      level: "beginner",
      rationale: "Auction framework (forcing situations) — infrastructure beneath all bidding.",
    };
  }

  const title = item.title.toLowerCase();
  const rules = auctionRules(item);

  let level: Exclude<B2f3Level, "out_of_scope"> = "beginner";
  const reasons: string[] = [];
  const raise = (to: Exclude<B2f3Level, "out_of_scope">, why: string) => {
    if (RANK[to] > RANK[level]) level = to;
    reasons.push(why);
  };

  const intHit = INTERMEDIATE_KEYWORDS.find((k) => title.includes(k));
  if (intHit) raise("intermediate", `title names an intermediate convention ("${intHit}")`);

  const abHit = ADVANCED_BEGINNER_KEYWORDS.find((k) => title.includes(k));
  if (abHit) raise("advanced_beginner", `title names basic competition / Stayman ("${abHit}")`);

  if (rules.some((r) => r.ask)) {
    raise("intermediate", "declares a slam ask (Blackwood / RKCB / Gerber)");
  }

  if (rules.some((r) => r.context.role === "overcaller" || r.context.role === "advancer")) {
    raise("advanced_beginner", "bids from the overcaller/advancer seat (competition)");
  }

  // A natural preemptive/artificial OPENING (weak two, preempt) is authored as
  // a `convention` but a beginner learns it on day one — the opening ladder is
  // beginner. Only bump non-opening conventions (NT gadgets, responses) up.
  const isOpeningBid = rules.length > 0 && rules.every((r) => r.context.role === "opening");
  if (item.knowledgeType === "convention" && level === "beginner" && !isOpeningBid) {
    raise("advanced_beginner", "a conventional gadget, not natural bidding");
  }

  if (reasons.length === 0) {
    reasons.push("natural opening / response / raise / rebid — the beginner core");
  }

  return { level, rationale: capitalize(reasons.join("; ")) + "." };
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Draft assembly (pure): bucket a KB's items into the three collections.
// ---------------------------------------------------------------------------

export interface B2f3Bucket {
  def: B2f3CollectionDef;
  /** Item ids classified AT this rung (not the cumulative include-chain set). */
  itemIds: string[];
}

export interface B2f3Draft {
  buckets: B2f3Bucket[];
  /** Items the classifier left out of every collection (e.g. scoring). */
  outOfScopeItemIds: string[];
  /** Per-item classification, for reporting / an audit trail. */
  assignments: { itemId: string; title: string; level: B2f3Level; rationale: string }[];
}

/** Run the classifier over a KB's items and lay out the three draft rosters. */
export function draftB2f3Collections(items: KnowledgeItem[]): B2f3Draft {
  const byLevel = new Map<B2f3Level, string[]>();
  const assignments: B2f3Draft["assignments"] = [];
  for (const item of items) {
    const { level, rationale } = classifyB2f3Level(item);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(item.itemId);
    assignments.push({ itemId: item.itemId, title: item.title, level, rationale });
  }
  return {
    buckets: B2F3_COLLECTIONS.map((def) => ({ def, itemIds: byLevel.get(def.level) ?? [] })),
    outOfScopeItemIds: byLevel.get("out_of_scope") ?? [],
    assignments,
  };
}
