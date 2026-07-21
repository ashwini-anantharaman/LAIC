// Auction-context analysis for the decision layer (Knowledge Rework §2):
// derive a seat's typed facts from the auction, then match the structured
// AuctionContext of compiled rules. No regexes — contexts are enumerable so
// the compiler can reason about coverage (spec §5).

import {
  isContractBid,
  partnerOf,
  sameSide,
  type AuctionCall,
  type Call,
  type Seat,
} from "@bridge/events";
import type { AuctionContext, AuctionRole, CallPattern, Strain } from "@bridge/kb";

/** Typed description of where `seat` stands in the auction. */
export interface SeatAuctionFacts {
  role: Exclude<AuctionRole, "any">;
  /** Opponents have made a non-pass call. */
  contested: boolean;
  opening?: Call;
  partnerLast?: Call;
  ownLast?: Call;
  rhoLast?: Call;
  lhoLast?: Call;
  /** First NON-PASS call by this seat / partner (pattern matching). */
  ownFirst?: Call;
  partnerFirst?: Call;
  /** First / last CONTRACT BID by seat and partner (SuitRef resolution —
   *  doubles don't name a suit, so these skip X/XX as well as passes). */
  ownFirstBid?: Call;
  ownLastBid?: Call;
  partnerFirstBid?: Call;
  /** 1-based partnership bidding round (this seat's upcoming turn index). */
  round: number;
}

/** First non-pass call in the auction, with its absolute index. */
function firstBid(auction: AuctionCall[]): { call: AuctionCall; index: number } | null {
  for (let i = 0; i < auction.length; i++) {
    if (auction[i]!.call !== "P") return { call: auction[i]!, index: i };
  }
  return null;
}

export function analyzeSeat(auction: AuctionCall[], seat: Seat): SeatAuctionFacts {
  const partner = partnerOf(seat);
  const own = auction.filter((c) => c.seat === seat);
  const mine = own.length; // completed turns
  const opened = firstBid(auction);

  const lastOf = (s: Seat): Call | undefined => {
    for (let i = auction.length - 1; i >= 0; i--) {
      if (auction[i]!.seat === s) return auction[i]!.call;
    }
    return undefined;
  };
  const firstOf = (s: Seat, ok: (c: Call) => boolean): Call | undefined =>
    auction.find((c) => c.seat === s && ok(c.call))?.call;
  const nonPass = (c: Call) => c !== "P";
  const lastBidOf = (s: Seat): Call | undefined => {
    for (let i = auction.length - 1; i >= 0; i--) {
      if (auction[i]!.seat === s && isContractBid(auction[i]!.call)) return auction[i]!.call;
    }
    return undefined;
  };

  // RHO/LHO = the seats acting immediately before/after `seat`.
  const order: Seat[] = ["N", "E", "S", "W"];
  const rho = order[(order.indexOf(seat) + 3) % 4]!;
  const lho = order[(order.indexOf(seat) + 1) % 4]!;

  const contested =
    opened !== null &&
    auction.some((c) => c.call !== "P" && !sameSide(c.seat, opened.call.seat));

  let role: SeatAuctionFacts["role"];
  if (!opened) {
    role = "opening";
  } else if (opened.call.seat === seat) {
    role = "opener";
  } else if (opened.call.seat === partner) {
    role = "responder";
  } else {
    // Opponents opened. My side's relationship to their opening:
    // the first of us to act over it is the overcaller; their partner advances.
    const firstOwnSideAction = auction.find(
      (c, i) => i > opened.index && sameSide(c.seat, seat) && c.call !== "P",
    );
    if (!firstOwnSideAction || firstOwnSideAction.seat === seat) role = "overcaller";
    else role = "advancer";
  }

  return {
    role,
    contested,
    opening: opened?.call.call,
    partnerLast: lastOf(partner),
    ownLast: lastOf(seat),
    rhoLast: lastOf(rho),
    lhoLast: lastOf(lho),
    ownFirst: firstOf(seat, nonPass),
    partnerFirst: firstOf(partner, nonPass),
    ownFirstBid: firstOf(seat, isContractBid),
    ownLastBid: lastBidOf(seat),
    partnerFirstBid: firstOf(partner, isContractBid),
    round: mine + 1,
  };
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

const parseBid = (call: Call): { level: number; strain: Strain } | null =>
  isContractBid(call) && call.length === 2
    ? { level: Number(call[0]), strain: call[1] as Strain }
    : null;

export function matchCallPattern(pattern: CallPattern, call: Call | undefined): boolean {
  switch (pattern.kind) {
    case "none":
      return call === undefined;
    case "any":
      return call !== undefined;
    case "pass":
      return call === "P";
    case "double":
      return call === "X";
    case "redouble":
      return call === "XX";
    case "any_bid":
    case "bid": {
      if (call === undefined) return false;
      const bid = parseBid(call);
      if (!bid) return false;
      if (pattern.kind === "any_bid") return true;
      // `level` is shorthand for levelMin = levelMax = level.
      const levelMin = pattern.levelMin ?? pattern.level;
      const levelMax = pattern.levelMax ?? pattern.level;
      if (levelMin !== undefined && bid.level < levelMin) return false;
      if (levelMax !== undefined && bid.level > levelMax) return false;
      if (pattern.strains && !pattern.strains.includes(bid.strain)) return false;
      return true;
    }
  }
}

/** Does `context` apply to a seat with these facts? */
export function matchContext(context: AuctionContext, facts: SeatAuctionFacts): boolean {
  if (context.role !== "any" && context.role !== facts.role) return false;
  if (context.contested !== undefined && context.contested !== facts.contested) return false;
  if (context.opening && !matchCallPattern(context.opening, facts.opening)) return false;
  if (context.partnerLast && !matchCallPattern(context.partnerLast, facts.partnerLast))
    return false;
  if (context.ownLast && !matchCallPattern(context.ownLast, facts.ownLast)) return false;
  if (context.rhoLast && !matchCallPattern(context.rhoLast, facts.rhoLast)) return false;
  if (context.lhoLast && !matchCallPattern(context.lhoLast, facts.lhoLast)) return false;
  if (context.ownFirst && !matchCallPattern(context.ownFirst, facts.ownFirst)) return false;
  if (context.partnerFirst && !matchCallPattern(context.partnerFirst, facts.partnerFirst))
    return false;
  if (context.roundMin !== undefined && facts.round < context.roundMin) return false;
  if (context.roundMax !== undefined && facts.round > context.roundMax) return false;
  return true;
}
