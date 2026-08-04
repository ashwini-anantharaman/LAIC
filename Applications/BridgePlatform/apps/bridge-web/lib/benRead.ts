// What BEN reads the other three hands as, at this point in the auction.
//
// A DIFFERENT KIND OF ANSWER from the bid-meaning card beside it. That card is
// the knowledge base explaining what each call you could make would PROMISE.
// This is a neural engine's estimate of what the other three players actually
// HOLD — the thing a learner cannot see and most needs to reason about.
//
// BEN's /bid response carries the estimate in two arrays, whose meaning is not
// documented anywhere; it was established by probing the live service
// (2026-08-03) with distinctive auctions:
//
//   hand AK43.KQ2.QJ2.432, seat S, partner N opens 1S, RHO E overcalls 2H
//     hcp   [2.5, 11.7, 11.8]
//     shape [[2.4,2.5,4.0,4.0], [5.0,2.0,3.0,3.0], [1.6,5.5,2.9,2.9]]
//                                 ^ 5 spades = the 1S opener   ^ 5+ hearts = the 2H overcaller
//
// So: three entries, ordered [LHO, partner, RHO] relative to the asking seat,
// and each `shape` group is four average suit lengths in PBN order (S,H,D,C).
//
// `explanations` on that same response is EMPTY on this deployment — the prose
// field the seat decider is written to consume never arrives. These arrays are
// the only explanatory output BEN currently gives us.
//
// WHY THIS IS NOT CALLED DURING RENDER: measured 7.6s, 7.9s and 22.6s on three
// consecutive calls. The bid-meaning card is pure in-process computation over
// compiled rules; putting this in that path would add eight to twenty-two
// seconds to every table load. It is fetched on demand instead, from the route
// handler that wraps this.

import { handToPbn, vulToBen, auctionToCtx } from "./benchmark";
import type { GameState } from "@bridge/engine";
import type { Seat } from "@bridge/events";

/** BEN's read of one opponent or partner. */
export interface SeatRead {
  seat: Seat;
  /** "partner" / "left-hand opponent" / "right-hand opponent", from the asker. */
  relation: "partner" | "lho" | "rho";
  /** Estimated high-card points. */
  hcp: number;
  /** Estimated average length per suit, in S/H/D/C order. */
  shape: [number, number, number, number];
}

/** Clockwise from a seat: S→W→N→E. */
const NEXT: Record<Seat, Seat> = { S: "W", W: "N", N: "E", E: "S" };

export function benConfigured(): boolean {
  return Boolean(process.env.BEN_ENDPOINT);
}

/**
 * Ask BEN what it reads at this position.
 *
 * `null` whenever BEN cannot or will not answer — unconfigured, unreachable,
 * timed out, or a response without the inference arrays (which happens: a probe
 * with an auction BEN rejected came back with no `hcp` at all). A missing read
 * is a feature that did not fire, never an error the learner should see.
 */
export async function benRead(
  state: GameState,
  seat: Seat,
  opts: { timeoutMs?: number } = {},
): Promise<SeatRead[] | null> {
  const endpoint = process.env.BEN_ENDPOINT;
  if (!endpoint) return null;

  const hand = state.hands[seat];
  if (!hand?.length) return null;

  const params = new URLSearchParams({
    hand: handToPbn(hand),
    seat,
    dealer: state.dealer,
    vul: vulToBen(state.vul),
    ctx: auctionToCtx(state.auction),
    details: "true",
  });

  // Generous, because BEN is slow and this is a deliberate request the learner
  // is waiting on — but bounded, so a hung service ends in a shrug.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  let body: unknown;
  try {
    const res = await fetch(`${endpoint.replace(/\/+$/, "")}/bid?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const { hcp, shape } = (body ?? {}) as { hcp?: unknown; shape?: unknown };
  const hcps = Array.isArray(hcp) ? hcp.filter((n): n is number => typeof n === "number") : [];
  const shapes = Array.isArray(shape) ? shape.filter((n): n is number => typeof n === "number") : [];
  if (hcps.length < 3 || shapes.length < 12) return null;

  // [LHO, partner, RHO] — clockwise from the asking seat.
  const lho = NEXT[seat];
  const partner = NEXT[lho];
  const rho = NEXT[partner];
  const order: { seat: Seat; relation: SeatRead["relation"] }[] = [
    { seat: lho, relation: "lho" },
    { seat: partner, relation: "partner" },
    { seat: rho, relation: "rho" },
  ];

  return order.map((o, i) => ({
    ...o,
    hcp: hcps[i]!,
    shape: shapes.slice(i * 4, i * 4 + 4) as [number, number, number, number],
  }));
}
