// Pure input parsing for the decision test bench (/bridge/kb/[kbId]/test):
// a typed hand + auction → engine types, with friendly errors. No JSX —
// unit-tested directly (testBench.test.ts).

import { auctionComplete, contractRank, legalCalls } from "@bridge/engine";
import {
  callLabel,
  isContractBid,
  nextSeat,
  rankLabel,
  type AuctionCall,
  type Call,
  type Card,
  type Rank,
  type Seat,
  type Suit,
} from "@bridge/events";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const RANK_OF: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "10": 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

/**
 * Parse a 13-card hand in either format:
 * - PBN suit-dot, S.H.D.C order: "AKQ2.T94.532.A87" (T or 10 for ten)
 * - tokens, suit-then-rank: "SA SK SQ H7 …"
 */
export function parseHand(input: string): { hand: Card[] } | { error: string } {
  const text = input.trim();
  if (!text) return { error: "enter a hand — 13 cards" };

  const cards: Card[] = [];
  const seen = new Set<string>();
  const add = (suit: Suit, rankToken: string, shown: string): string | null => {
    const rank = RANK_OF[rankToken.toUpperCase()];
    if (rank === undefined) return `"${shown}" isn't a card`;
    if (seen.has(`${suit}${rank}`)) return `duplicate ${GLYPH[suit]}${rankLabel(rank)}`;
    seen.add(`${suit}${rank}`);
    cards.push({ suit, rank });
    return null;
  };

  if (text.includes(".")) {
    // PBN: four dot-separated suit holdings, ♠.♥.♦.♣ order.
    const parts = text.split(".");
    if (parts.length !== 4)
      return { error: `expected 4 suits separated by dots (♠.♥.♦.♣) — got ${parts.length}` };
    const suits: Suit[] = ["S", "H", "D", "C"];
    for (let i = 0; i < 4; i++) {
      const holding = parts[i]!.replace(/\s+/g, "");
      for (let j = 0; j < holding.length; j++) {
        let token = holding[j]!;
        if (token === "1" && holding[j + 1] === "0") {
          token = "10";
          j++;
        }
        const err = add(suits[i]!, token, token);
        if (err) return { error: err };
      }
    }
  } else {
    // Token format: "SA SK … H10 …".
    for (const token of text.split(/[\s,]+/).filter(Boolean)) {
      const suit = token[0]!.toUpperCase();
      if (token.length < 2 || !(suit in GLYPH))
        return { error: `"${token}" isn't a card — use suit then rank, like SA or H10` };
      const err = add(suit as Suit, token.slice(1), token);
      if (err) return { error: err };
    }
  }

  if (cards.length !== 13)
    return { error: `${cards.length} card${cards.length === 1 ? "" : "s"} — need 13` };
  return { hand: cards };
}

/** "1NT"/"1n" → "1N", PASS → P, DBL → X, RDBL → XX; null = not a call. */
function normalizeCall(raw: string): Call | null {
  const t = raw.toUpperCase();
  if (t === "P" || t === "PASS") return "P";
  if (t === "X" || t === "DBL") return "X";
  if (t === "XX" || t === "RDBL") return "XX";
  const m = /^([1-7])(NT|N|S|H|D|C)$/.exec(t);
  if (m) return `${m[1]}${m[2] === "NT" ? "N" : m[2]}`;
  return null;
}

function illegalWhy(call: Call, auction: AuctionCall[]): string {
  if (isContractBid(call)) {
    let highest: Call | null = null;
    for (const c of auction)
      if (isContractBid(c.call) && (!highest || contractRank(c.call) > contractRank(highest)))
        highest = c.call;
    return highest && contractRank(call) <= contractRank(highest)
      ? `${callLabel(call)} after ${callLabel(highest)} is insufficient`
      : `${callLabel(call)} isn't legal here`;
  }
  if (call === "X") return "X isn't legal here — no opponent bid to double";
  return "XX isn't legal here — no double to redouble";
}

/**
 * Parse an auction typed as whitespace/dash/comma-separated calls, assigning
 * seats in rotation from the dealer and checking legality as we fold. Empty
 * input = the dealer's opening decision.
 */
export function parseAuction(
  input: string,
  dealer: Seat,
): { auction: AuctionCall[]; toAct: Seat } | { error: string } {
  const tokens = input.trim().split(/[\s,-]+/).filter(Boolean);
  const auction: AuctionCall[] = [];
  let seat = dealer;

  for (const raw of tokens) {
    const call = normalizeCall(raw);
    if (call === null)
      return { error: `"${raw}" isn't a call — use P, X, XX, or a bid like 1NT or 2H` };
    if (auctionComplete(auction))
      return { error: `the auction is already over before ${callLabel(call)}` };
    if (!legalCalls(auction, seat).has(call)) return { error: illegalWhy(call, auction) };
    auction.push({ seat, call });
    seat = nextSeat(seat);
  }

  if (auctionComplete(auction))
    return {
      error: "that auction is complete — remove the trailing passes to test the last decision",
    };
  return { auction, toAct: seat };
}
