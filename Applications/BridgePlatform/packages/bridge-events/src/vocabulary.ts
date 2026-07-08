// Shared bridge vocabulary, ported from the bridgebot prototype
// (src/vendor/bridge/bridge.ts + the helper sections of lin.ts). This is the
// base domain language the event schemas are expressed in; @bridge/engine
// re-exports it for general use. Game LOGIC (legality, contract resolution,
// hand evaluation) lives in @bridge/engine — only vocabulary + trivial
// helpers belong here.
//
// Suits are stored as letters ('C'|'D'|'H'|'S'); ♣♦♥♠ glyphs are display-only.

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
// 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Hand = Card[];

export const SUITS: Suit[] = ["C", "D", "H", "S"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

// Suit ranking for tie-breaks and sorting: S > H > D > C.
export const SUIT_RANK: Record<Suit, number> = { S: 3, H: 2, D: 1, C: 0 };

export const isMajor = (s: Suit): boolean => s === "H" || s === "S";
export const isMinor = (s: Suit): boolean => s === "C" || s === "D";

export function rankLabel(r: Rank): string {
  return r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : r === 14 ? "A" : String(r);
}

export function cardId(c: Card): string {
  return `${c.suit}${c.rank}`;
}

// ---- seats -----------------------------------------------------------------

export type Seat = "S" | "W" | "N" | "E";

// Clockwise rotation order — also the order BBO lists hands/names in.
export const SEATS: Seat[] = ["S", "W", "N", "E"];

export const SEAT_LABEL: Record<Seat, string> = {
  S: "South",
  W: "West",
  N: "North",
  E: "East",
};

export function nextSeat(s: Seat): Seat {
  return SEATS[(SEATS.indexOf(s) + 1) % 4]!;
}

export function partnerOf(s: Seat): Seat {
  return nextSeat(nextSeat(s));
}

export function sameSide(a: Seat, b: Seat): boolean {
  return a === b || partnerOf(a) === b;
}

// ---- vulnerability ---------------------------------------------------------

export type Vul = "none" | "ns" | "ew" | "both";

export const VUL_LABEL: Record<Vul, string> = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both",
};

export function isVulnerable(vul: Vul, seat: Seat): boolean {
  if (vul === "both") return true;
  if (vul === "none") return false;
  const ns = seat === "N" || seat === "S";
  return vul === "ns" ? ns : !ns;
}

// ---- calls -----------------------------------------------------------------

// A call: 'P' pass, 'X' double, 'XX' redouble, or a contract bid like '1C'..'7N'.
export type Call = string;

export interface AuctionCall {
  seat: Seat;
  call: Call;
  alert?: boolean;
  note?: string;
}

const GLYPH: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

export function isContractBid(call: Call): boolean {
  return call !== "P" && call !== "X" && call !== "XX";
}

export function callLabel(call: Call): string {
  if (call === "P") return "Pass";
  if (call === "X") return "Dbl";
  if (call === "XX") return "Rdbl";
  const level = call[0];
  const strain = call[1];
  return strain === "N" ? `${level}NT` : `${level}${GLYPH[strain!]}`;
}

export function isRedStrain(call: Call): boolean {
  return isContractBid(call) && (call[1] === "D" || call[1] === "H");
}

// ---- contract --------------------------------------------------------------

export interface Contract {
  level: number;
  strain: Suit | "N";
  doubled: 0 | 1 | 2; // 0 none, 1 doubled, 2 redoubled
  declarer: Seat;
}

export function contractLabel(c: Contract): string {
  const strain = c.strain === "N" ? "NT" : GLYPH[c.strain];
  const dbl = c.doubled === 1 ? " X" : c.doubled === 2 ? " XX" : "";
  return `${c.level}${strain}${dbl} by ${c.declarer}`;
}

// ---- seeded RNG ------------------------------------------------------------

// mulberry32 — deterministic RNG for reproducible deals and selection policies.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
