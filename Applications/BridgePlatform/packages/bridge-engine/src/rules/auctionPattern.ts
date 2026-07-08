// Auction-context matching for data-driven bid rules.

import {
  isContractBid,
  partnerOf,
  type AuctionCall,
  type Seat,
} from "@bridge/events";
import type { AuctionPattern } from "./schema";

export type SeatRole = "opening" | "response" | "other";

/**
 * Coarse role classification (mirrors the prototype's constraint-store
 * opening/response walk): "opening" while nobody has made a contract bid;
 * "response" when partner made the auction's first contract bid and this
 * seat has not yet made one.
 */
export function classifyRole(auction: AuctionCall[], seat: Seat): SeatRole {
  const firstBid = auction.find((c) => isContractBid(c.call));
  if (!firstBid) return "opening";
  if (firstBid.seat === partnerOf(seat)) {
    const mine = auction.filter((c) => c.seat === seat && isContractBid(c.call));
    if (mine.length === 0) return "response";
  }
  return "other";
}

/** Partner's most recent contract bid, or null. */
export function partnerLastBid(auction: AuctionCall[], seat: Seat): string | null {
  const partner = partnerOf(seat);
  for (let i = auction.length - 1; i >= 0; i--) {
    const c = auction[i]!;
    if (c.seat === partner && isContractBid(c.call)) return c.call;
  }
  return null;
}

export function matchesAuctionPattern(
  pattern: AuctionPattern,
  auction: AuctionCall[],
  seat: Seat,
): { ok: boolean; reason: string } {
  if (pattern.role && pattern.role !== "any") {
    const role = classifyRole(auction, seat);
    if (role !== pattern.role) return { ok: false, reason: `role is ${role}, needs ${pattern.role}` };
  }
  if (pattern.auctionRegex !== undefined) {
    const joined = auction.map((c) => c.call).join(" ");
    if (!new RegExp(pattern.auctionRegex).test(joined))
      return { ok: false, reason: `auction "${joined}" !~ /${pattern.auctionRegex}/` };
  }
  if (pattern.partnerLastBidRegex !== undefined) {
    const last = partnerLastBid(auction, seat);
    if (last === null || !new RegExp(pattern.partnerLastBidRegex).test(last))
      return {
        ok: false,
        reason: `partner's last bid ${last ?? "(none)"} !~ /${pattern.partnerLastBidRegex}/`,
      };
  }
  return { ok: true, reason: "auction context matched" };
}
