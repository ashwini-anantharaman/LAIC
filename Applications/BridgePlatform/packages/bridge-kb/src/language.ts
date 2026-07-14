// The knowledge language (Knowledge Rework spec §1–2): the typed, enumerable
// vocabulary knowledge items are written in. Structured BY DESIGN — no
// regexes — so the compiler can reason about which auction contexts a pack
// covers (coverage envelopes, spec §5) and typed editors map onto it 1:1.
//
// Owned here (not in @bridge/engine): this is the language fellows author in;
// the engine's decision layer interprets its COMPILED form. @bridge/engine
// depends on this package, never the reverse.

import type { Call, Seat, Suit } from "@bridge/events";
import type { HcpRange, Option, SettingValue } from "@bridge/config";

export type Strain = Suit | "N";

// ---------------------------------------------------------------------------
// Numeric parameters — literal, or bound to a setting the item declares
// (the `$setting` mechanism carried over from engine v1).
// ---------------------------------------------------------------------------

export type NumParam = number | { $setting: string; field?: "low" | "high" };

// ---------------------------------------------------------------------------
// Call patterns
// ---------------------------------------------------------------------------

/** Matches one call (or its absence). All present fields must hold. */
export interface CallPattern {
  /** "any_bid" = any suit/NT bid; "none" = that seat has not called yet. */
  kind: "bid" | "pass" | "double" | "redouble" | "any_bid" | "any" | "none";
  levelMin?: number;
  levelMax?: number;
  strains?: Strain[];
}

// ---------------------------------------------------------------------------
// Auction context — WHERE in the auction a rule applies
// ---------------------------------------------------------------------------

/**
 * The seat's relationship to the auction:
 *  - opening:   nobody has bid yet (passes allowed) and it is my turn
 *  - opener:    my side opened and I made that opening (rebids etc.)
 *  - responder: my partner opened
 *  - overcaller: the opponents opened; me or my partner has not yet acted /
 *                I made (or am making) my side's first action over it
 *  - advancer:  my partner overcalled/doubled over the opponents' opening
 */
export type AuctionRole =
  | "opening"
  | "opener"
  | "responder"
  | "overcaller"
  | "advancer"
  | "any";

/**
 * Typed auction context. All present constraints must hold. Enumerable: the
 * compiler derives pack coverage by unioning contexts over the role/opening
 * dimensions (spec §5).
 */
export interface AuctionContext {
  role: AuctionRole;
  /** Opponents have made a non-pass call at some point. */
  contested?: boolean;
  /** The partnership's opening call (for responder/opener-rebid contexts). */
  opening?: CallPattern;
  partnerLast?: CallPattern;
  ownLast?: CallPattern;
  /** Right-hand opponent's most recent call. */
  rhoLast?: CallPattern;
  /** 1-based partnership bidding round (opening decision = round 1). */
  roundMin?: number;
  roundMax?: number;
}

// ---------------------------------------------------------------------------
// Hand conditions — WHAT the hand must look like
// ---------------------------------------------------------------------------

/** Suit selector: a literal suit or a contextual reference. */
export type SuitRef =
  | Suit
  | "partner_last_bid_suit"
  | "own_longest_suit"
  | "rho_bid_suit";

export type HandPredicate =
  | { hcp: { min?: NumParam; max?: NumParam } }
  /** HCP + length points (3+ card suits beyond 4th card), the simple v1 valuation. */
  | { totalPoints: { min?: NumParam; max?: NumParam } }
  | { suitLength: { suit: SuitRef; min?: NumParam; max?: NumParam } }
  | { longestSuitAmong: { suits: Suit[] } }
  | { balanced: boolean }
  /** Two of top three, or three of top five honors, in the suit. */
  | { suitQuality: { suit: SuitRef; quality: "two_of_top_three" | "three_of_top_five" } }
  | { hasStopperIn: { suit: SuitRef } };

export type HandCondition =
  | { all: HandCondition[] }
  | { any: HandCondition[] }
  | { not: HandCondition }
  | HandPredicate;

/** A condition that always holds (canonical "no constraints"). */
export const ALWAYS: HandCondition = { all: [] };

// ---------------------------------------------------------------------------
// Auction actions — WHAT to do when context + conditions match
// ---------------------------------------------------------------------------

export type AuctionAction =
  | { type: "bid"; level: number; strain: Strain }
  | { type: "pass" }
  | { type: "double" }
  | { type: "redouble" }
  /** Bid the longest suit among `among` at the given level (cheapest legal if omitted). */
  | { type: "bid_longest"; among: Suit[]; level?: number }
  /** Raise partner's last bid suit to the given level. */
  | { type: "raise_partner"; toLevel: number }
  /** First legal call from an ordered preference list. */
  | { type: "first_legal_of"; calls: { level: number; strain: Strain }[] };

// ---------------------------------------------------------------------------
// Card-play language (leads, following, declarer/defense behaviors)
// ---------------------------------------------------------------------------

export type LeadStyle =
  | "fourth_best"
  | "top_of_sequence"
  | "low_from_honor"
  | "top_of_nothing"
  | "low_from_longest";

export interface LeadSpec {
  /** Applies on defense against suit contracts, NT, or both. */
  versus: "suit" | "notrump" | "any";
  style: LeadStyle;
}

/** Position in the trick when the behavior applies. */
export type TrickPosition = "lead" | "second" | "third" | "fourth" | "any";

export type PlayBehavior =
  | "lowest_following"
  | "highest_following"
  | "win_cheaply"
  | "second_hand_low"
  | "third_hand_high"
  | "cover_honor"
  | "cash_winners"
  | "lowest_legal"
  | "discard_lowest";

export interface PlayRuleSpec {
  position: TrickPosition;
  /** Restrict to declarer-side seats (declarer/dummy) or defenders. */
  side?: "declarer" | "defense" | "any";
  behavior: PlayBehavior;
  conditions?: HandCondition;
  priority: number;
}

export interface SignalSpec {
  attitude?: "standard" | "upside_down" | "none";
  count?: "standard" | "reverse" | "none";
  firstDiscard?: "attitude" | "count" | "none";
}

// ---------------------------------------------------------------------------
// Auction rule spec (one matching unit inside an item)
// ---------------------------------------------------------------------------

export interface AuctionRuleSpec {
  /** Stable within the item; compiled ruleId = `${itemId}.${key}`. */
  key: string;
  /** Short label for traces/cards, e.g. "Stayman 2♣ ask". */
  label: string;
  context: AuctionContext;
  conditions: HandCondition;
  action: AuctionAction;
  /** Within-band ordering; lower fires first (bands come from knowledgeType). */
  priority: number;
}

// ---------------------------------------------------------------------------
// Fallbacks (spec decision 7: knowledge items + engine floor)
// ---------------------------------------------------------------------------

export type FallbackBehavior =
  | { phase: "auction"; behavior: "pass" }
  | { phase: "opening_lead"; behavior: LeadStyle }
  | { phase: "card_play"; behavior: "lowest_legal" };

// ---------------------------------------------------------------------------
// Inline setting declarations (spec §1: items declare their own controls)
// ---------------------------------------------------------------------------

/**
 * A control an item exposes. `enable` settings gate the item's compiled rules
 * (the PDF's `enabled_by → config key`); `parameter` settings feed `$setting`
 * refs inside the item's own payload.
 */
export interface SettingSpec {
  key: string;
  label: string;
  control: "toggle" | "single_select" | "multi_select" | "range_hcp" | "number";
  role: "enable" | "parameter";
  default: SettingValue;
  options?: Option[];
  min?: number;
  max?: number;
  description?: string;
}

export type { HcpRange, SettingValue };
export type { Call, Seat, Suit };
