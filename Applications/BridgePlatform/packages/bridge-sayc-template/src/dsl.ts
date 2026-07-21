// Terse authoring vocabulary for the curated SAYC chapters. Pure sugar over
// @bridge/kb's knowledge language — chapters stay readable as bridge, the
// compiler still sees plain typed data.

import type {
  AuctionAction,
  AuctionContext,
  AuctionRuleSpec,
  CallPattern,
  HandCondition,
  ItemPayload,
  KnowledgePhase,
  KnowledgeType,
  NumParam,
  PlayRuleSpec,
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
): AuctionRuleSpec => ({ key, label, context, conditions, action, priority });

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
