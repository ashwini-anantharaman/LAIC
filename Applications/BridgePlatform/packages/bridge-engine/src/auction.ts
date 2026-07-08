// Auction legality and contract resolution, ported from the bridgebot
// prototype (src/vendor/bridge/lin.ts helper section + src/game/apply.ts).
// These implement the standard rules of the game (Laws of Duplicate Bridge),
// not convention content.

import {
  isContractBid,
  sameSide,
  type AuctionCall,
  type Call,
  type Contract,
  type Seat,
  type Suit,
} from "@bridge/events";

const STRAIN_ORDER = ["C", "D", "H", "S", "N"];

/** 1C=0 .. 7N=34; non-contract calls rank below everything. */
export function contractRank(call: Call): number {
  if (!isContractBid(call)) return -1;
  return (Number(call[0]) - 1) * 5 + STRAIN_ORDER.indexOf(call[1]!);
}

/** Legal calls for `seat` given the auction so far (standard auction rules). */
export function legalCalls(auction: AuctionCall[], seat: Seat): Set<Call> {
  const legal = new Set<Call>(["P"]); // pass is always legal

  // Every contract bid strictly higher than the highest so far.
  let highest = -1;
  for (const c of auction) highest = Math.max(highest, contractRank(c.call));
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const call = `${level}${strain}`;
      if (contractRank(call) > highest) legal.add(call);
    }
  }

  // Double / redouble depend on the last non-pass call and whose it was.
  let lastNonPass: AuctionCall | null = null;
  for (let i = auction.length - 1; i >= 0; i--) {
    if (auction[i]!.call !== "P") {
      lastNonPass = auction[i]!;
      break;
    }
  }
  if (lastNonPass && !sameSide(lastNonPass.seat, seat)) {
    if (isContractBid(lastNonPass.call)) legal.add("X");
    else if (lastNonPass.call === "X") legal.add("XX");
  }

  return legal;
}

/** Standard auction close: ≥4 calls and the last three are passes. */
export function auctionComplete(auction: AuctionCall[]): boolean {
  if (auction.length < 4) return false;
  const last3 = auction.slice(-3);
  return last3.length === 3 && last3.every((c) => c.call === "P");
}

/** Final contract from a completed auction (null = passed out, or no auction). */
export function finalContract(auction: AuctionCall[]): Contract | null {
  let lastBid: AuctionCall | null = null;
  let doubled: 0 | 1 | 2 = 0;
  for (const c of auction) {
    if (isContractBid(c.call)) {
      lastBid = c;
      doubled = 0;
    } else if (c.call === "X") doubled = 1;
    else if (c.call === "XX") doubled = 2;
  }
  if (!lastBid) return null;

  const strain = lastBid.call[1] as Suit | "N";
  // Declarer = first player on the winning side to name that strain.
  const winningSide = lastBid.seat;
  let declarer: Seat = lastBid.seat;
  for (const c of auction) {
    if (isContractBid(c.call) && c.call[1] === strain && sameSide(c.seat, winningSide)) {
      declarer = c.seat;
      break;
    }
  }
  return { level: Number(lastBid.call[0]), strain, doubled, declarer };
}
