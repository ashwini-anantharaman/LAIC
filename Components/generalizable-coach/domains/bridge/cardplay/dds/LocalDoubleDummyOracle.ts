/**
 * Zone 3 — Bridge: an in-process double-dummy oracle backed by the local TS
 * solver. It is the authoritative correctness source for live card play.
 *
 * To keep the coach responsive on the main thread, it only solves END-GAME
 * positions (at most `maxCardsPerHand` cards in any hand — a handful of tricks
 * left, where the search is fast and where precise card choice matters most).
 * Earlier in the hand it returns `undefined`, so the coach falls back to the
 * principle engine. Raise the cap (or move this to a Web Worker) to solve
 * deeper.
 */
import type { DoubleDummyOracle, OracleVerdict } from "../oracle";
import type { LiveCardPlayState } from "../LiveCardPlayEvaluator";
import { encodeCard, solvePosition, type Position, type SeatId } from "./solver";

const SUIT_INDEX: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };

function parseHandCodes(hand: string): number[] {
  const codes: number[] = [];
  for (const token of hand.trim().split(/\s+/)) {
    const m = token.match(/^([SHDC]):(.*)$/i);
    if (!m) continue;
    const suit = (m[1] ?? "").toUpperCase();
    for (const ch of (m[2] ?? "").toUpperCase().replace(/10/g, "T")) {
      const code = encodeCard(suit + ch);
      if (code >= 0) codes.push(code);
    }
  }
  return codes;
}

export class LocalDoubleDummyOracle implements DoubleDummyOracle {
  constructor(private readonly maxCardsPerHand = 5) {}

  async evaluate(
    state: LiveCardPlayState,
    playedCard: string,
  ): Promise<OracleVerdict | undefined> {
    const seats: SeatId[] = ["N", "E", "S", "W"];
    const hands: Record<SeatId, number[]> = { N: [], E: [], S: [], W: [] };
    for (const s of seats) hands[s] = parseHandCodes(state.hands[s] ?? "");

    // Only solve small end-game positions to stay fast on the main thread.
    const maxHand = Math.max(...seats.map((s) => hands[s].length));
    if (maxHand === 0 || maxHand > this.maxCardsPerHand) return undefined;

    const trump = state.trump === "NT" ? -1 : SUIT_INDEX[state.trump] ?? -1;
    const trick = state.trickSoFar.map((t) => ({
      seat: t.seat as SeatId,
      code: encodeCard(t.card),
    }));
    if (trick.some((t) => t.code < 0)) return undefined;

    const pos: Position = {
      hands,
      trick,
      toPlay: state.playFromSeat as SeatId,
      trump,
    };

    let result;
    try {
      result = solvePosition(pos);
    } catch {
      return undefined;
    }

    const played = encodeCard(playedCard);
    const playedEntry = result.scores.find((s) => encodeCard(s.card) === played);
    if (!playedEntry) return undefined; // played card wasn't a legal move we scored

    return {
      playedTricks: playedEntry.tricks,
      bestTricks: result.bestTricks,
      bestCards: result.bestCards,
      tricksLost: result.bestTricks - playedEntry.tricks,
    };
  }
}
