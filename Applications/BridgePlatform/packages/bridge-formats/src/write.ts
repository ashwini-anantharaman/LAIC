import type { Card, Suit } from "@bridge/events";
import { nextSeat, type Seat, type Vul } from "@bridge/events";
import type { GameContext } from "./context";

// LIN / PBN writers — the live "current position as text" the harness shows
// while a board runs. PBN round-trips fully (deal + auction + play) through
// our own parser; LIN is BBO-compatible (our LIN parser reads the deal and
// auction; pc| play tags are written for BBO but skipped on re-import).

const RANK_CHAR: Record<number, string> = {
  14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2",
};
const SUITS_DESC: Suit[] = ["S", "H", "D", "C"];

const bySuitDesc = (hand: Card[], suit: Suit): string =>
  hand
    .filter((c) => c.suit === suit)
    .sort((a, b) => b.rank - a.rank)
    .map((c) => RANK_CHAR[c.rank])
    .join("");

// ---- LIN --------------------------------------------------------------------

const LIN_DEALER_DIGIT: Record<Seat, string> = { S: "1", W: "2", N: "3", E: "4" };
const LIN_SV: Record<Vul, string> = { none: "o", ns: "n", ew: "e", both: "b" };
const LIN_SEATS: Seat[] = ["S", "W", "N", "E"];

const linHand = (hand: Card[]): string =>
  SUITS_DESC.map((s) => `${s}${bySuitDesc(hand, s)}`).join("");

const linCall = (call: string): string =>
  call === "P" ? "p" : call === "X" ? "d" : call === "XX" ? "r" : call;

export function toLin(ctx: GameContext): string {
  const parts: string[] = [];
  parts.push(`pn|${LIN_SEATS.map((s) => ctx.players[s] ?? "").join(",")}|`);
  parts.push(`sv|${LIN_SV[ctx.vul]}|`);
  parts.push(`md|${LIN_DEALER_DIGIT[ctx.dealer]}${LIN_SEATS.map((s) => linHand(ctx.hands[s])).join(",")}|`);
  if (ctx.name) parts.push(`ah|${ctx.name}|`);
  for (const c of ctx.auction) parts.push(`mb|${linCall(c.call)}|`);
  if (ctx.play) for (const p of ctx.play) parts.push(`pc|${p.card.suit}${RANK_CHAR[p.card.rank]}|`);
  parts.push("pg||");
  return parts.join("");
}

// ---- PBN --------------------------------------------------------------------

const PBN_VUL: Record<Vul, string> = { none: "None", ns: "NS", ew: "EW", both: "All" };
const SEAT_NAME_TAG: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

const pbnHand = (hand: Card[]): string => SUITS_DESC.map((s) => bySuitDesc(hand, s)).join(".");

const pbnCall = (call: string): string => (call === "P" ? "Pass" : call.endsWith("N") && call.length === 2 ? `${call[0]}NT` : call);

export function toPbn(ctx: GameContext): string {
  const lines: string[] = [];
  lines.push(`[Event "${ctx.name || "bridgebot board"}"]`);
  lines.push(`[Dealer "${ctx.dealer}"]`);
  lines.push(`[Vulnerable "${PBN_VUL[ctx.vul]}"]`);
  // Deal anchored at North, rotating clockwise N→E→S→W.
  const dealSeats: Seat[] = ["N", "E", "S", "W"];
  lines.push(`[Deal "N:${dealSeats.map((s) => pbnHand(ctx.hands[s])).join(" ")}"]`);
  for (const s of dealSeats) if (ctx.players[s]) lines.push(`[${SEAT_NAME_TAG[s]} "${ctx.players[s]}"]`);

  if (ctx.auction.length) {
    lines.push(`[Auction "${ctx.auction[0]?.seat ?? ctx.dealer}"]`);
    for (let i = 0; i < ctx.auction.length; i += 4)
      lines.push(ctx.auction.slice(i, i + 4).map((c) => pbnCall(c.call)).join(" "));
  }

  if (ctx.play?.length) {
    // Standard PBN: columns are anchored to the [Play] seat (the opening
    // leader) for EVERY trick, regardless of who actually led that trick.
    const anchor = ctx.play[0].seat;
    const cols: Seat[] = [anchor, nextSeat(anchor), nextSeat(nextSeat(anchor)), nextSeat(nextSeat(nextSeat(anchor)))];
    lines.push(`[Play "${anchor}"]`);
    const trickCount = Math.max(...ctx.play.map((p) => p.trickIndex)) + 1;
    for (let t = 0; t < trickCount; t++) {
      const inTrick = ctx.play.filter((p) => p.trickIndex === t);
      lines.push(
        cols
          .map((s) => {
            const p = inTrick.find((x) => x.seat === s);
            return p ? `${p.card.suit}${RANK_CHAR[p.card.rank]}` : "-";
          })
          .join(" "),
      );
    }
    lines.push("*");
  }
  return lines.join("\n") + "\n";
}
