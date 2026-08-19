// The curated deal's robots (owner design 2026-08-15): follow the coach's
// recorded line while the learner stays on it; hand the seat back to its
// ordinary decider (KB bidding + DDS play) the moment the line is left.
//
// The challenge system's cached BEN is the template — "divergent lines
// naturally get fresh answers" — but a curated deal is STRONGER: the line is
// recorded data, so on-path robot decisions cost nothing and reproduce the
// coach's board exactly for every learner. The entry is read once per
// session build and cached in-process.

import { hcp } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { Call, Card, Seat } from "@bridge/events";
import type { SeatDecider, SessionRecord } from "@bridge/sessions";

import { lineOf, pathStatus, type CuratedLine } from "./curated";
import { libraryStore } from "./sessions";

/** One line per entry per process — entries are immutable once published. */
const lineCache = new Map<string, Promise<CuratedLine | null>>();

function loadLine(entryId: string): Promise<CuratedLine | null> {
  const hit = lineCache.get(entryId);
  if (hit) return hit;
  const p = (async () => {
    try {
      const entry = await libraryStore().getEntry(entryId);
      return entry ? lineOf(entry) : null;
    } catch {
      return null;
    }
  })();
  // A miss must stay retryable — a cold store hiccup must not pin "no line".
  p.then((line) => {
    if (line === null) lineCache.delete(entryId);
  }).catch(() => lineCache.delete(entryId));
  lineCache.set(entryId, p);
  return p;
}

/**
 * The factory handed to SessionServiceOptions.curatedDecider. `fallback` is
 * the seat's ordinary decider; anything the line cannot answer — divergence,
 * a missing entry, a recorded action that would be illegal — falls through,
 * so a curated table can never stall on its robots.
 */
export function curatedSeatDecider(args: {
  record: SessionRecord;
  seat: Seat;
  fallback: SeatDecider;
}): SeatDecider {
  const { record, seat, fallback } = args;
  const entryId = record.curated?.entryId;
  if (!entryId) return fallback;

  const humanSeat = (Object.entries(record.seats) as [Seat, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human",
  )?.[0];

  const onLine = async (state: GameState): Promise<CuratedLine | null> => {
    const line = await loadLine(entryId);
    if (!line) return null;
    // The learner's seat is what divergence is measured against; with no
    // human at the table (shouldn't happen for curated), any mismatch counts.
    const status = pathStatus(state, line, humanSeat ?? seat);
    return status.onPath ? line : null;
  };

  return {
    decideBid: async (state: GameState, s: Seat) => {
      const line = await onLine(state);
      const next = line?.auction[state.auction.length];
      if (line && next && next.seat === s) {
        return {
          action: next.call as Call,
          candidates: [next.call as Call],
          trace: [],
          citedSettings: [],
          facts: { hcp: hcp(state.hands[s] ?? []) },
          reason: "Your coach's line for this board.",
          rejected: [],
          fallback: false,
        };
      }
      return fallback.decideBid(state, s);
    },
    decidePlay: async (state: GameState, s: Seat) => {
      const line = await onLine(state);
      const playedSoFar = state.tricks.reduce((n, t) => n + t.plays.length, 0);
      const next = line?.play[playedSoFar];
      if (line && next && next.seat === s) {
        return {
          action: next.card as Card,
          candidates: [next.card as Card],
          trace: [],
          citedSettings: [],
          facts: { hcp: hcp(state.hands[s] ?? []) },
          reason: "Your coach's line for this board.",
          rejected: [],
          fallback: false,
        };
      }
      return fallback.decidePlay(state, s);
    },
  };
}