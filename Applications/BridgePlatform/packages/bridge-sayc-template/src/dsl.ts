// Terse authoring vocabulary for the curated SAYC chapters. Pure sugar over
// @bridge/kb's knowledge language — chapters stay readable as bridge, the
// compiler still sees plain typed data.

import type {
  AuctionAction,
  AuctionContext,
  AuctionRuleSpec,
  CallPattern,
  ForcingRuleSpec,
  HandCondition,
  ItemPayload,
  KnowledgePhase,
  KnowledgeType,
  NumParam,
  PlayRuleSpec,
  RuleAsk,
  RuleShows,
  SettingSpec,
  Strain,
  SuitRef,
} from "@bridge/kb";
import type { Suit } from "@bridge/events";

// ---------------------------------------------------------------------------
// Template shapes
// ---------------------------------------------------------------------------

/** Which knowledge set(s) an item belongs to (Full SAYC includes them all). */
export type SetTag = "floor" | "core" | "conventions";

export interface TemplateItem {
  /** Stable local key — install derives citations and edge wiring from it. */
  key: string;
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeType;
  phase: KnowledgePhase;
  payload: ItemPayload;
  settings?: SettingSpec[];
  sets: SetTag[];
}

export interface TemplateEdge {
  from: string; // TemplateItem.key
  edgeType: "requires" | "conflicts_with";
  to: string; // TemplateItem.key
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const all = (...cs: HandCondition[]): HandCondition => ({ all: cs });
export const any = (...cs: HandCondition[]): HandCondition => ({ any: cs });
export const not = (c: HandCondition): HandCondition => ({ not: c });
export const ALWAYS: HandCondition = { all: [] };

export const hcp = (min?: NumParam, max?: NumParam): HandCondition => ({
  hcp: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
export const tp = (min?: NumParam, max?: NumParam): HandCondition => ({
  totalPoints: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
export const len = (suit: SuitRef, min?: NumParam, max?: NumParam): HandCondition => ({
  suitLength: { suit, ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
export const bal = (balanced = true): HandCondition => ({ balanced });
export const quality = (
  suit: SuitRef,
  q: "two_of_top_three" | "three_of_top_five" = "two_of_top_three",
): HandCondition => ({ suitQuality: { suit, quality: q } });
export const stopper = (suit: SuitRef): HandCondition => ({ hasStopperIn: { suit } });
export const longestAmong = (...suits: Suit[]): HandCondition => ({
  longestSuitAmong: { suits },
});
export const aces = (min?: number, max?: number): HandCondition => ({
  aces: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
export const kings = (min?: number, max?: number): HandCondition => ({
  kings: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
export const keycards = (suit: SuitRef, min?: number, max?: number): HandCondition => ({
  keycards: { suit, ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** Playing tricks (A=1; K=1 with 2+, ½ alone; Q=½ with 3+; +1/card past the
 *  3rd in an honor-headed suit) — preempt discipline by vulnerability. */
export const ptricks = (min?: NumParam, max?: NumParam): HandCondition => ({
  playingTricks: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});

// ---------------------------------------------------------------------------
// Partnership conditions (Pillar A): read the inference pass's enriched facts,
// so rules reason about the COMBINED hands rather than one hand in isolation.
// ---------------------------------------------------------------------------

/** Partner's calls have SHOWN this HCP range (promised floor/ceiling). */
export const partnerHcp = (min?: NumParam, max?: NumParam): HandCondition => ({
  partnerShownHcp: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** Partner has SHOWN at least (min) / at most (max) cards in the suit. */
export const partnerLen = (suit: SuitRef, min?: NumParam, max?: NumParam): HandCondition => ({
  partnerShownLength: { suit, ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** My HCP + partner's shown bound (min uses partner's floor, max the ceiling). */
export const combHcp = (min?: NumParam, max?: NumParam): HandCondition => ({
  combinedHcp: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** Combined keycards for the agreed suit (needs an agreed suit + decoded ask). */
export const combKc = (min?: NumParam, max?: NumParam): HandCondition => ({
  combinedKeycards: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** Keycards the partnership is MISSING (5 − combined) — the sign-off test. */
export const kcMissing = (min?: NumParam, max?: NumParam): HandCondition => ({
  keycardsMissing: { ...(min !== undefined && { min }), ...(max !== undefined && { max }) },
});
/** A trump fit is established (my holding + partner's shown length ≥ minCombined). */
export const fit = (
  suit?: SuitRef | "any" | "any_major",
  minCombined?: NumParam,
): HandCondition => ({
  fitEstablished: {
    ...(suit !== undefined && { suit }),
    ...(minCombined !== undefined && { minCombined }),
  },
});
/** Delayed support: I HOLD min+ cards in the suit but have not yet SHOWN them. */
export const unshown = (suit: SuitRef, min: NumParam): HandCondition => ({
  unshownSupport: { suit, min },
});

// ---------------------------------------------------------------------------
// Call patterns & contexts
// ---------------------------------------------------------------------------

/** "1N" | "2C" … → exact-bid pattern; "X"/"P" for double/pass; "bid" etc. raw kinds. */
export const is = (call: string): CallPattern => {
  if (call === "P") return { kind: "pass" };
  if (call === "X") return { kind: "double" };
  if (call === "XX") return { kind: "redouble" };
  return { kind: "bid", level: Number(call[0]), strains: [call[1] as Strain] };
};
export const bidAt = (opts: {
  level?: number;
  min?: number;
  max?: number;
  strains?: Strain[];
}): CallPattern => ({
  kind: "bid",
  ...(opts.level !== undefined && { level: opts.level }),
  ...(opts.min !== undefined && { levelMin: opts.min }),
  ...(opts.max !== undefined && { levelMax: opts.max }),
  ...(opts.strains && { strains: opts.strains }),
});
export const anyBid: CallPattern = { kind: "any_bid" };
export const noCall: CallPattern = { kind: "none" };
export const passed: CallPattern = { kind: "pass" };
export const doubled: CallPattern = { kind: "double" };

export const ctx = (
  role: AuctionContext["role"],
  rest: Omit<AuctionContext, "role"> = {},
): AuctionContext => ({ role, ...rest });

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const bid = (level: number, strain: Strain): AuctionAction => ({
  type: "bid",
  level,
  strain,
});
export const pass: AuctionAction = { type: "pass" };
export const dbl: AuctionAction = { type: "double" };
export const rdbl: AuctionAction = { type: "redouble" };
export const raise = (toLevel: number): AuctionAction => ({ type: "raise_partner", toLevel });
export const bidLongest = (among: Suit[], level?: number): AuctionAction => ({
  type: "bid_longest",
  among,
  ...(level !== undefined && { level }),
});
export const bidSuit = (suit: SuitRef, level?: number): AuctionAction => ({
  type: "bid_suit",
  suit,
  ...(level !== undefined && { level }),
});
export const firstLegal = (...calls: string[]): AuctionAction => ({
  type: "first_legal_of",
  calls: calls.map((c) => ({ level: Number(c[0]), strain: c[1] as Strain })),
});

// ---------------------------------------------------------------------------
// Rules, settings, items
// ---------------------------------------------------------------------------

export const rule = (
  key: string,
  label: string,
  context: AuctionContext,
  conditions: HandCondition,
  action: AuctionAction,
  priority: number,
  meta: { shows?: RuleShows; ask?: RuleAsk } = {},
): AuctionRuleSpec => ({
  key,
  label,
  context,
  conditions,
  action,
  priority,
  ...(meta.shows && { shows: meta.shows }),
  ...(meta.ask && { ask: meta.ask }),
});

/**
 * What a bid SHOWS (Pillar A meaning metadata) — attached to a rule so the
 * partnership-inference pass attributes it to the call. Plain numbers only
 * ($setting-free): the meaning must resolve without a player's dials.
 */
export const shows = (s: RuleShows): RuleShows => s;

/**
 * Declare a bid an ASK and give each of partner's responses a machine meaning
 * (keycards/kings the inference decodes into the combined-keycard arithmetic).
 */
export const ask = (id: string, responses: RuleAsk["responses"]): RuleAsk => ({ id, responses });

/** A forcing situation: in this context, PASS is not an available call. */
export const forcing = (
  key: string,
  label: string,
  context: AuctionContext,
  priority: number,
): ForcingRuleSpec => ({ key, label, context, priority });

/**
 * The booklet's interference policy for notrump systems: conventional
 * responses stay ON over an opponent's double and are OFF over a bid.
 * Duplicates the rule for rhoLast = pass and rhoLast = double, so an
 * intervening BID silently switches the convention off.
 */
export const overPassOrDouble = (r: AuctionRuleSpec): AuctionRuleSpec[] => [
  { ...r, context: { ...r.context, rhoLast: { kind: "pass" } } },
  { ...r, key: `${r.key}-x`, context: { ...r.context, rhoLast: { kind: "double" } } },
];

export const play = (
  behavior: PlayRuleSpec["behavior"],
  priority: number,
  opts: { position?: PlayRuleSpec["position"]; side?: PlayRuleSpec["side"] } = {},
): PlayRuleSpec => ({
  position: opts.position ?? "any",
  side: opts.side ?? "any",
  behavior,
  priority,
});

export const toggle = (key: string, label: string, on = true, description?: string): SettingSpec => ({
  key,
  label,
  control: "toggle",
  role: "enable",
  default: on,
  ...(description && { description }),
});

export const range = (
  key: string,
  label: string,
  low: number,
  high: number,
  bounds: { min?: number; max?: number } = {},
): SettingSpec => ({
  key,
  label,
  control: "range_hcp",
  role: "parameter",
  default: { low, high },
  min: bounds.min ?? 0,
  max: bounds.max ?? 40,
});

/** `$key.low` / `$key.high` NumParam refs. */
export const low = (key: string): NumParam => ({ $setting: key, field: "low" });
export const high = (key: string): NumParam => ({ $setting: key, field: "high" });

export const item = (
  key: string,
  title: string,
  text: string,
  knowledgeType: KnowledgeType,
  phase: KnowledgePhase,
  payload: ItemPayload,
  opts: { settings?: SettingSpec[]; sets?: SetTag[] } = {},
): TemplateItem => ({
  key,
  title,
  humanReadableText: text,
  knowledgeType,
  phase,
  payload,
  settings: opts.settings ?? [],
  sets: opts.sets ?? ["core"],
});

export const auctionItem = (
  key: string,
  title: string,
  text: string,
  knowledgeType: KnowledgeType,
  rules: AuctionRuleSpec[],
  opts: { settings?: SettingSpec[]; sets?: SetTag[] } = {},
): TemplateItem =>
  item(key, title, text, knowledgeType, "auction", { kind: "auction_rules", rules }, opts);
