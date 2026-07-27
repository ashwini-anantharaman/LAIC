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
  /** Shorthand for levelMin = levelMax = level (used when either is absent). */
  level?: number;
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
  /** Left-hand opponent's most recent call (balancing, responsive doubles). */
  lhoLast?: CallPattern;
  /** This seat's FIRST non-pass call (multi-round rebid sequences). */
  ownFirst?: CallPattern;
  /** Partner's FIRST non-pass call ("partner opened 1♠ and later…"). */
  partnerFirst?: CallPattern;
  /** 1-based partnership bidding round (opening decision = round 1). */
  roundMin?: number;
  roundMax?: number;
  /**
   * Vulnerability relative to this seat: "favorable" = they are vulnerable
   * and we are not, "unfavorable" = the reverse, "equal" = neither or both.
   */
  vulnerability?: "equal" | "favorable" | "unfavorable";
  /** How many DIFFERENT suits the opponents have bid (cue-bid gating). */
  oppSuitsBidMin?: number;
  oppSuitsBidMax?: number;
  /** Partner's last bid was a CUE of a suit the opponents bid first. */
  partnerCued?: boolean;
  /**
   * An ask (by this specified id) is awaiting my response — partner's last
   * call matched a rule declaring that `ask` (Pillar A). Disambiguates "my/
   * partner's 4NT was Blackwood" from a natural/quantitative 4NT. Matched from
   * the partnership-inference state, not from the raw call.
   */
  askInProgress?: string;
}

// ---------------------------------------------------------------------------
// Hand conditions — WHAT the hand must look like
// ---------------------------------------------------------------------------

/** Suit selector: a literal suit or a contextual reference. */
export type SuitRef =
  | Suit
  | "partner_last_bid_suit"
  | "partner_first_bid_suit"
  | "own_longest_suit"
  | "own_shortest_suit"
  | "own_first_bid_suit"
  | "own_last_bid_suit"
  | "rho_bid_suit"
  | "lho_bid_suit"
  /** The single suit NOBODY has bid (resolves only when exactly three are bid). */
  | "only_unbid_suit"
  /**
   * The partnership's agreed trump suit (Pillar A): a suit both partners named,
   * else the best known 8-card combined fit (majors first). Derived by the
   * partnership-inference pass from FACTS ONLY (no hand, no settings) so it
   * resolves inside `bid_suit` too — "bid 6 of the fit suit".
   */
  | "agreed_suit";

export type HandPredicate =
  | { hcp: { min?: NumParam; max?: NumParam } }
  /** HCP + length points (3+ card suits beyond 4th card), the simple v1 valuation. */
  | { totalPoints: { min?: NumParam; max?: NumParam } }
  | { suitLength: { suit: SuitRef; min?: NumParam; max?: NumParam } }
  | { longestSuitAmong: { suits: Suit[] } }
  | { balanced: boolean }
  /** Two of top three, or three of top five honors, in the suit. */
  | { suitQuality: { suit: SuitRef; quality: "two_of_top_three" | "three_of_top_five" } }
  | { hasStopperIn: { suit: SuitRef } }
  /** Number of aces held (Blackwood / Gerber responses). */
  | { aces: { min?: NumParam; max?: NumParam } }
  /** Number of kings held (5NT king ask). */
  | { kings: { min?: NumParam; max?: NumParam } }
  /** Keycards for the ref suit: the four aces + that suit's king (RKCB). */
  | { keycards: { suit: SuitRef; min?: NumParam; max?: NumParam } }
  /** Holds a specific card, e.g. the trump queen (rank: 11=J 12=Q 13=K 14=A). */
  | { holds: { suit: SuitRef; rank: number } }
  /**
   * Estimated playing tricks (preempt discipline): per suit, A=1, K=1 with
   * two-plus cards (half alone), Q=half with three-plus, plus one for every
   * card beyond the third in the suit.
   */
  | { playingTricks: { min?: NumParam; max?: NumParam } }
  // -------------------------------------------------------------------------
  // Partnership predicates (Pillar A). All read the inference pass's enriched
  // facts and are ABSENCE-TOLERANT: when nothing was inferred (old compiles,
  // no auction history) a partner-shown floor reads as 0 and a ceiling as
  // unknown, so a min-check with no evidence fails rather than fires blind.
  // -------------------------------------------------------------------------
  /** Partner has SHOWN this HCP range (min = promised floor; max = promised ceiling). */
  | { partnerShownHcp: { min?: NumParam; max?: NumParam } }
  /** Partner has SHOWN at least (min) / at most (max) cards in the suit. */
  | { partnerShownLength: { suit: SuitRef; min?: NumParam; max?: NumParam } }
  /**
   * The two hands together (my HCP + partner's shown bound). `min` tests my
   * HCP + partner's shown FLOOR; `max` tests my HCP + partner's shown CEILING
   * (fails when partner's ceiling is unknown — the combined max is unbounded).
   */
  | { combinedHcp: { min?: NumParam; max?: NumParam } }
  /**
   * Combined keycards for the agreed suit (my aces + that suit's king +
   * partner's decoded keycards from an ask). `min` uses partner's lowest
   * possible decoded count, `max` the highest.
   */
  | { combinedKeycards: { min?: NumParam; max?: NumParam } }
  /** Keycards the partnership is MISSING (5 total − combined); the sign-off test. */
  | { keycardsMissing: { min?: NumParam; max?: NumParam } }
  /**
   * A trump fit is established: combined length (my holding + partner's shown
   * length) reaches `minCombined` (default 8) in the named suit, in ANY suit,
   * or in ANY_MAJOR.
   */
  | { fitEstablished: { suit?: SuitRef | "any" | "any_major"; minCombined?: NumParam } }
  /**
   * Delayed support: I actually HOLD `min`+ cards in the suit but have not yet
   * SHOWN that length (my own calls promised fewer) — the hidden-fit test.
   */
  | { unshownSupport: { suit: SuitRef; min?: NumParam } };

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
  | { type: "first_legal_of"; calls: { level: number; strain: Strain }[] }
  /**
   * Bid a contextual suit at the given level (cheapest legal when omitted):
   * cue-bid the opponents' suit, rebid your own first suit, raise partner's
   * FIRST suit. Does not act when the reference can't be resolved.
   */
  | { type: "bid_suit"; suit: SuitRef; level?: number };

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
  // Fundamentals (evaluated on the raw trick; always legal-info only).
  | "lowest_following"
  | "highest_following"
  | "win_cheaply"
  | "second_hand_low"
  | "third_hand_high"
  | "cover_honor"
  | "cash_winners"
  | "lowest_legal"
  | "discard_lowest"
  // Declarer techniques (2026-07-21 play expansion). Each self-gates: it
  // returns no card when its trigger doesn't hold, and decides ONLY from
  // legitimate information (own hand + dummy + cards played).
  | "draw_trumps"
  | "finesse_toward_tenace"
  | "hold_up_stopper"
  | "duck_to_preserve_entry"
  | "establish_long_suit"
  | "ruff_loser"
  | "discard_loser_on_winner"
  | "cash_out_when_enough"
  // Defense techniques.
  | "return_partner_suit"
  | "hold_up_ace"
  | "overruff_or_discard"
  | "second_hand_rise_vs_honor";

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

/**
 * A FORCING situation: an auction pattern in which this seat must not pass
 * (partner's last call is forcing). Declared by items with the
 * "forcing_rules" payload — the decider suppresses pass and, with nothing
 * better, makes the cheapest sensible bid, citing the declaring rule.
 */
export interface ForcingRuleSpec {
  key: string;
  label: string;
  context: AuctionContext;
  priority: number;
}

// ---------------------------------------------------------------------------
// Meaning metadata (Pillar A): what a bid SHOWS and what an ask DECODES. Both
// are authorable and reviewable; both are absence-tolerant (old artifacts lack
// them). The compiler DERIVES `shows` from the rule's own `all`-conditions when
// it is absent, so every rule carries a meaning the inference pass can read.
// ---------------------------------------------------------------------------

/** One inclusive numeric bound (plain numbers — meaning is $setting-free). */
export interface ShowsBound {
  min?: number;
  max?: number;
}

/**
 * What making this bid SHOWS about the bidder's hand. Auto-derived at compile
 * from the rule's `all`-conditions when omitted (hcp/totalPoints/suitLength
 * bounds; `any`/`not` contribute nothing); an explicit `shows` overrides.
 */
export interface RuleShows {
  hcp?: ShowsBound;
  tp?: ShowsBound;
  /** Per-suit length promise. */
  suits?: { suit: Suit; min?: number; max?: number }[];
  /** The bid is forcing (partner must not pass). */
  forcing?: boolean;
}

/** The machine meaning of one response to an ask (a possible-values set). */
export interface AskResponseMeaning {
  /** Keycards this response promises (a set — e.g. 5♦ = "1 or 4" → [1,4]). */
  keycards?: number[];
  /** Kings this response promises (5NT king ask). */
  kings?: number[];
}

/**
 * A convention ASK (Blackwood/Gerber/RKCB): making this bid asks a question,
 * and each of partner's possible responses carries a decoded meaning. The
 * inference pass decodes partner's actual response into `partnerShownKeycards`.
 */
export interface RuleAsk {
  /** Stable ask identifier, matched into `AuctionContext.askInProgress`. */
  id: string;
  /** Partner's response call (e.g. "5D") → its meaning. */
  responses: Record<Call, AskResponseMeaning>;
}

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
  /**
   * What this bid SHOWS (Pillar A). Optional and authorable; when absent the
   * compiler derives it from `conditions`. The partnership-inference pass reads
   * this to attribute meaning to each of a partner's (and one's own) prior calls.
   */
  shows?: RuleShows;
  /** This bid is an ASK; decodes partner's responses into keycards/kings. */
  ask?: RuleAsk;
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
