// Hand-authored declarations for the vendored table-kernel artifact.
//
// WHY BY HAND: tsc-emitted declarations reference @bridge/* module specifiers
// a vendoring host (the native coach app's npm tree) cannot resolve. The law
// surface is small and stable, so it is transcribed here VERBATIM from the
// source modules — when the entry (src/index.ts) gains an export, add it here
// in the same change. The JS artifact may carry more than this file types;
// an untyped export is a prompt to extend this file, never to cast.
//
// Sources of truth (packages/…):
//   bridge-events/src/vocabulary.ts, types.ts
//   bridge-engine/src/{hand,auction,state,apply,decision,scoring}.ts
//   bridge-table-config/src/index.ts
//   bridge-table-ui/src/{tokens,challengeTokens,challengeLogic}.ts

// ── Vocabulary (@bridge/events/src/vocabulary.ts) ───────────────────────────

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Hand = Card[];

export const SUITS: Suit[];
export const RANKS: Rank[];
export const SUIT_RANK: Record<Suit, number>;

export function isMajor(s: Suit): boolean;
export function isMinor(s: Suit): boolean;
export function rankLabel(r: Rank): string;
export function cardId(c: Card): string;

export type Seat = "S" | "W" | "N" | "E";
export const SEATS: Seat[];
export const SEAT_LABEL: Record<Seat, string>;
export function nextSeat(s: Seat): Seat;
export function partnerOf(s: Seat): Seat;
export function sameSide(a: Seat, b: Seat): boolean;

export type Vul = "none" | "ns" | "ew" | "both";
export const VUL_LABEL: Record<Vul, string>;
export function isVulnerable(vul: Vul, seat: Seat): boolean;

/** 'P' pass, 'X' double, 'XX' redouble, or a contract bid like '1C'..'7N'. */
export type Call = string;

export interface AuctionCall {
  seat: Seat;
  call: Call;
  alert?: boolean;
  note?: string;
}

export function isContractBid(call: Call): boolean;
export function callLabel(call: Call): string;
export function isRedStrain(call: Call): boolean;

export interface Contract {
  level: number;
  strain: Suit | "N";
  doubled: 0 | 1 | 2;
  declarer: Seat;
}

export function contractLabel(c: Contract): string;

/** mulberry32 — deterministic RNG for reproducible deals and policies. */
export function mulberry32(seed: number): () => number;

// ── Event schemas (@bridge/events/src/types.ts) ─────────────────────────────

export type EventCategory =
  | "bid-event"
  | "play-event"
  | "bid-logic-event"
  | "play-logic-event";

export interface EventBase {
  /** Monotonic, stamped by the Game controller (single writer). */
  seq: number;
  /** Epoch millis at emit. */
  ts: number;
  boardRef: string;
  category: EventCategory;
}

export interface BidEvent extends EventBase {
  category: "bid-event";
  seat: Seat;
  call: Call;
  /** True when produced by the fixed safe-default fallback. */
  fallback: boolean;
}

export interface PlayEvent extends EventBase {
  category: "play-event";
  seat: Seat;
  card: Card;
  fallback: boolean;
}

/** Advisory robot decision traces — never state-changing. The client folds
 *  action events only; logic events are typed loosely on purpose. */
export interface BidLogicEvent extends EventBase {
  category: "bid-logic-event";
  seat: Seat;
  fallback: boolean;
  candidates: Call[];
  chosen: Call;
  [k: string]: unknown;
}

export interface PlayLogicEvent extends EventBase {
  category: "play-logic-event";
  seat: Seat;
  fallback: boolean;
  candidates: Card[];
  chosen: Card;
  [k: string]: unknown;
}

export type GameEvent = BidEvent | PlayEvent | BidLogicEvent | PlayLogicEvent;
export type ActionEvent = BidEvent | PlayEvent;
export type LogicEvent = BidLogicEvent | PlayLogicEvent;

export function isActionEvent(e: GameEvent): e is ActionEvent;
export function isLogicEvent(e: GameEvent): e is LogicEvent;

// ── Game state (bridge-engine/src/state.ts) ─────────────────────────────────

export type GamePhase = "auction" | "play" | "complete";

export interface Trick {
  leader: Seat;
  /** In play order, 0..4. */
  plays: { seat: Seat; card: Card }[];
  winner?: Seat;
}

export interface GameState {
  boardRef: string;
  dealer: Seat;
  vul: Vul;
  /** REMAINING cards per seat — played cards are removed by the fold. */
  hands: Record<Seat, Card[]>;
  auction: AuctionCall[];
  contract: Contract | null;
  phase: GamePhase;
  turn: Seat;
  /** Completed tricks + the in-progress trick (last). */
  tricks: Trick[];
  trickCount: { NS: number; EW: number };
}

export function initialState(
  boardRef: string,
  dealer: Seat,
  vul: Vul,
  hands: Record<Seat, Card[]>,
): GameState;

export function sideOf(seat: Seat): "NS" | "EW";

// ── Legality + fold (bridge-engine/src/{auction,apply}.ts) ──────────────────

export function contractRank(call: Call): number;
export function legalCalls(auction: AuctionCall[], seat: Seat): Set<Call>;
export function auctionComplete(auction: AuctionCall[]): boolean;
export function finalContract(auction: AuctionCall[]): Contract | null;

export function trickWinner(trick: Trick, trump: Suit | "N"): Seat;
export function legalPlays(state: GameState, seat: Seat): Card[];
/** The pure fold: state + one ACTION event → next state. */
export function applyEvent(state: GameState, event: ActionEvent): GameState;
export function reconstruct(initial: GameState, actions: ActionEvent[]): GameState;

// ── Hand evaluation (bridge-engine/src/hand.ts) ─────────────────────────────

export function hcp(hand: Hand): number;
export function suitCounts(hand: Hand): Record<Suit, number>;
export function shape(hand: Hand): [number, number, number, number];
export function isBalanced(hand: Hand): boolean;
export function longestSuits(hand: Hand): { suit: Suit; length: number }[];

// ── Scoring (bridge-engine/src/scoring.ts) ──────────────────────────────────

export interface ScoreBreakdown {
  /** null = the board was passed out. */
  contract: Contract | null;
  tricksTaken: number;
  /** +n overtricks, -n undertricks, 0 = exact make. */
  result: number;
  made: boolean;
  vulnerable: boolean;
  trickScore: number;
  overtrickScore: number;
  gameBonus: number;
  partscoreBonus: number;
  slamBonus: number;
  insultBonus: number;
  penalty: number;
  /** Total from the declaring side's perspective (negative when down). */
  declarerScore: number;
  /** Total from North-South's perspective (0 when passed out). */
  nsScore: number;
}

/** Score a COMPLETED board (phase === "complete"); null otherwise. */
export function scoreBoard(state: GameState): ScoreBreakdown | null;
export function resultLabel(score: ScoreBreakdown): string;

// ── Skins & appearance (bridge-table-config/src/index.ts) ───────────────────

export type SkinName = "bbo" | "midnight" | "parchment" | "noir" | "claret";
export type Strain = "N" | "S" | "H" | "D" | "C";

/** The skin token columns — colour strings keyed by surround. */
export type SkinTokens = Record<string, string>;

export interface AppearanceOverrides {
  feltColor?: string;
  accent?: string;
  bidBoxColor?: string;
  auctionColor?: string;
  cardBackColor?: string;
}

export interface TableAppearance {
  skin: SkinName;
  handLayout: "row" | "fan";
  bidPad: "grid" | "columns";
  centreFrame: boolean;
  fanSpread: number;
  fanRadius: number;
  overrides: AppearanceOverrides;
}

export const TABLE_SKINS: Record<SkinName, SkinTokens>;
/** The suit-column bid pad's per-strain tints (table-skins.json). */
export const STRAIN_TINT: Record<Strain, { bg: string; ink: string; edge: string }>;
export const SKIN_ORDER: readonly SkinName[];
export const DEFAULT_APPEARANCE: TableAppearance;
export function resolveSkin(name: SkinName, overrides?: AppearanceOverrides): SkinTokens;
export function nextSkin(name: SkinName): SkinName;
export function skinLabel(name: SkinName): string;
export function normalizeAppearance(input: unknown): TableAppearance;

// ── Table design tokens (bridge-table-ui/src/tokens.ts) ─────────────────────

export const RED: string;
export const GOLD: string;
export const GLYPH: Record<string, string>;
export const STRAINS: readonly ["C", "D", "H", "S", "N"];
export const ORDER: Seat[];
export const DISPLAY: Suit[];
export const PARTNER: Record<Seat, Seat>;
export function isRed(s: string): boolean;
export function rankText(r: number): string;
export function isBid(c: string): boolean;
export function callText(c: string): string;
export function callColor(c: string): string;

// Challenge tokens/logic (bridge-table-ui): additional colour constants and
// pure helpers ride in the JS; type them here as they come into use.
export const CHALLENGE_ACCENT: string;
export const POS: string;
export const NEG: string;
export const NEU: string;
