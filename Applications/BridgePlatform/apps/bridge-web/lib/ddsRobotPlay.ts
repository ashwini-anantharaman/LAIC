// The robots' card, from the double-dummy oracle — with guard-rails.
//
// Owner direction 2026-08-15: every KB robot plays its CARDS by DDS (the
// same Haglund/Hein solver Owlee's advice runs on) while its CALLS stay with
// the KB system the coach teaches. Raw double-dummy play looks alien in two
// places, so two rails apply:
//
//   · the OPENING LEAD never comes from here — the sessions package keeps it
//     with the KB's lead rules, because a solver's lead is chosen by peeking
//     at all four hands, which no human lead is;
//   · among solver-EQUAL cards this picks the LOWEST — the card a human
//     habit plays from equals — so the robot never burns an honour where a
//     spot card wins the same tricks.
//
// Injected into SessionService (SessionServiceOptions.kbPlayOverride) because
// the WASM solver lives in this app, and the sessions package stays free of
// runtime dependencies. Returning null — any unreadable position, any solver
// hiccup — hands the card back to the KB rules, so a table never stalls.

import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";

import { livePlayState } from "@/lib/coach/cardVerdicts";
import { scoreEveryCard } from "@/lib/coach/ddsOracle";

/** Card-code ranks ("SK", "D7", "HT") back to the engine's numeric rank. */
const RANK_OF: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export async function ddsRobotCard(state: GameState, seat: Seat): Promise<Card | null> {
  if (state.phase !== "play" || !state.contract) return null;
  const live = livePlayState(state, seat, seat);
  if (!live) return null;

  const scores = await scoreEveryCard(live);
  if (!scores?.length) return null;

  const best = Math.max(...scores.map((s) => s.tricks));
  const equals = scores.filter((s) => s.tricks === best);
  // The natural-habit tie-break: lowest of the solver-equal cards.
  equals.sort((a, b) => (RANK_OF[a.card.slice(1)] ?? 0) - (RANK_OF[b.card.slice(1)] ?? 0));
  const code = equals[0]?.card;
  if (!code) return null;

  const rank = RANK_OF[code.slice(1)];
  if (!rank) return null;
  return { suit: code.slice(0, 1) as Suit, rank: rank as Card["rank"] };
}
