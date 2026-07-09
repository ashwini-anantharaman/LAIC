// BBO LIN parser, ported from the bridgebot prototype (the parsing section of
// src/vendor/bridge/lin.ts — the vocabulary/helper sections moved to
// @bridge/events and @bridge/engine).
//
// LIN is BBO's pipe-delimited transcript format: `tag|value|tag|value|...`.
// A whole vugraph match is many boards in one file (split on `qx|`); a single
// Hand Viewer export is one board (one `md|`). We parse either into LinBoard[].
//
// Tags parsed: pn| players, md| deal, sv| vulnerability, mb| bid (trailing
// `!` = alert), an| announcement, ah| board name, qx| board boundary.
// Card play (pc|), claims (mc|), chat (nt|) are ignored — bidding-along v1.

import {
  SEATS,
  type AuctionCall,
  type Call,
  type Card,
  type Rank,
  type Seat,
  type Suit,
  type Vul,
} from "@bridge/events";

export interface LinBoard {
  name: string;
  dealer: Seat;
  vul: Vul;
  players: Record<Seat, string>;
  hands: Record<Seat, Card[]>;
  auction: AuctionCall[];
}

export type LinParseResult =
  | { ok: true; boards: LinBoard[] }
  | { ok: false; error: string };

const RANK_BY_CHAR: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};
const DEALER_BY_DIGIT: Record<string, Seat> = { "1": "S", "2": "W", "3": "N", "4": "E" };

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (const rank of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as Rank[]) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function parseHand(s: string): Card[] {
  const cards: Card[] = [];
  let suit: Suit | null = null;
  for (const ch of s) {
    const up = ch.toUpperCase();
    if (up === "S" || up === "H" || up === "D" || up === "C") {
      suit = up as Suit;
      continue;
    }
    const rank = RANK_BY_CHAR[up];
    if (rank && suit) cards.push({ suit, rank });
  }
  return cards;
}

function parseDeal(md: string): { dealer: Seat; hands: Record<Seat, Card[]> } | null {
  const dealer = DEALER_BY_DIGIT[md[0]!];
  if (!dealer) return null;
  const parts = md.slice(1).split(",");
  const hands: Record<Seat, Card[]> = { S: [], W: [], N: [], E: [] };
  SEATS.forEach((seat, i) => {
    if (parts[i]) hands[seat] = parseHand(parts[i]!);
  });
  // Fill any seat that wasn't fully specified (usually the 4th) from the
  // remaining cards.
  const used = new Set<string>();
  for (const seat of SEATS) for (const c of hands[seat]) used.add(`${c.suit}${c.rank}`);
  const remaining = fullDeck().filter((c) => !used.has(`${c.suit}${c.rank}`));
  for (const seat of SEATS) {
    while (hands[seat].length < 13 && remaining.length) hands[seat].push(remaining.shift()!);
  }
  return { dealer, hands };
}

function normCall(raw: string): { call: Call; alert: boolean } {
  let s = raw.trim();
  let alert = false;
  while (s.endsWith("!")) {
    alert = true;
    s = s.slice(0, -1).trim();
  }
  const lower = s.toLowerCase();
  if (lower === "p" || lower === "pass") return { call: "P", alert };
  if (lower === "d" || lower === "x" || lower === "dbl") return { call: "X", alert };
  if (lower === "r" || lower === "xx" || lower === "rdbl") return { call: "XX", alert };
  const level = s[0];
  let strain = (s[1] ?? "").toUpperCase();
  if (strain === "N") strain = "N"; // NT
  return { call: `${level}${strain}`, alert };
}

// Tokenize `tag|value|tag|value|...` into [tag, value] pairs.
function tokenize(text: string): Array<[string, string]> {
  const parts = text.replace(/\r/g, "").split("|");
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    pairs.push([parts[i]!.trim(), parts[i + 1]!]);
  }
  return pairs;
}

export function parseLin(text: string): LinParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste a LIN string first." };
  if (!trimmed.includes("md|") && !trimmed.includes("|md|")) {
    return {
      ok: false,
      error: 'No deal found — this doesn’t look like a LIN file (expected an "md|" tag).',
    };
  }

  const pairs = tokenize(trimmed);
  const boards: LinBoard[] = [];

  // Defaults carry forward across boards until overridden.
  let players: Record<Seat, string> = { S: "", W: "", N: "", E: "" };
  let vul: Vul = "none";

  let cur: LinBoard | null = null;
  let boardNo = 0;

  const newBoard = (name: string): LinBoard => {
    boardNo += 1;
    const b: LinBoard = {
      name: name || `Board ${boardNo}`,
      dealer: "S",
      vul,
      players: { ...players },
      hands: { S: [], W: [], N: [], E: [] },
      auction: [],
    };
    boards.push(b);
    return b;
  };

  for (const [tag, value] of pairs) {
    switch (tag) {
      case "pn": {
        const names = value.split(",");
        players = {
          S: (names[0] ?? "").trim(),
          W: (names[1] ?? "").trim(),
          N: (names[2] ?? "").trim(),
          E: (names[3] ?? "").trim(),
        };
        if (cur) cur.players = { ...players };
        break;
      }
      case "sv": {
        const v = value.trim().toLowerCase();
        vul = v === "n" ? "ns" : v === "e" ? "ew" : v === "b" ? "both" : "none";
        if (cur) cur.vul = vul;
        break;
      }
      case "qx": {
        const num = value.match(/(\d+)/)?.[1];
        cur = newBoard(num ? `Board ${num}` : "");
        break;
      }
      case "ah":
        if (cur) cur.name = value.trim() || cur.name;
        break;
      case "md": {
        const deal = parseDeal(value.trim());
        if (deal) {
          if (!cur || cur.hands.S.length) cur = newBoard("");
          cur.dealer = deal.dealer;
          cur.hands = deal.hands;
        }
        break;
      }
      case "mb": {
        if (!cur) break;
        const { call, alert } = normCall(value);
        const seat = SEATS[(SEATS.indexOf(cur.dealer) + cur.auction.length) % 4]!;
        cur.auction.push({ seat, call, alert });
        break;
      }
      case "an": {
        if (cur && cur.auction.length) cur.auction[cur.auction.length - 1]!.note = value.trim();
        break;
      }
      default:
        break;
    }
  }

  const complete = boards.filter((b) => b.hands.S.length === 13);
  if (!complete.length)
    return { ok: false, error: "Couldn’t read any complete deals from that LIN." };
  return { ok: true, boards: complete };
}
