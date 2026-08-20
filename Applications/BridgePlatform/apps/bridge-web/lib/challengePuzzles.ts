// Turning a DRAFT puzzle into a stored BoardPuzzle — shared by the web create
// action and the app's create route so the two cannot drift.
//
// The draft carries cards as "SK"/"HT" text; here they become real Cards, and
// the whole story is REPLAYED through eventsFromRecording against the board's
// actual pack before anything is stored. The engine is the judge of legality —
// wrong turn order, a card not in that hand, a revoke — and its own sentence
// is what the creator sees, because "Recorded card ♠K falls outside the play"
// beats any paraphrase this file could invent.
//
// SERVER-ONLY: eventsFromRecording folds engine events.

import type { BoardPuzzle } from "@bridge/challenges";
import type { Call, Card, Rank, Seat, Suit, Vul } from "@bridge/events";
import { eventsFromRecording } from "@bridge/sessions";

import type { ChallengeBoardDraft } from "@/app/bridge/challenges/draft";

const RANK_OF: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 10, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "SK" / "H10" / "CT" → a Card. Throws on garbage — normalizeDraft filtered
 *  already, so reaching here with garbage is a bug worth hearing about. */
export function cardFromText(text: string): Card {
  const suit = text[0] as Suit;
  const rank = RANK_OF[text.slice(1)];
  if (!"SHDC".includes(suit) || !rank) throw new Error(`Unreadable card "${text}"`);
  return { suit, rank: rank as Rank };
}

/**
 * The stored puzzle, replay-validated. Throws with the engine's own message
 * when the story is not legal on this pack.
 */
export function boardPuzzleFromDraft(
  draft: NonNullable<ChallengeBoardDraft["puzzle"]>,
  board: { boardRef: string; dealer: Seat; vul: Vul; pack: Record<Seat, Card[]> },
): BoardPuzzle {
  const puzzle: BoardPuzzle = {
    auction: draft.auction.map((a) => ({ seat: a.seat, call: a.call as Call })),
    play: draft.play.map((p) => ({ seat: p.seat, card: cardFromText(p.card) })),
    brief: draft.brief.trim(),
    solution:
      draft.solution.kind === "call"
        ? { kind: "call", call: draft.solution.call as Call }
        : { kind: "goal", ...(draft.solution.tricks ? { tricks: draft.solution.tricks } : {}) },
    explanation: draft.explanation.trim(),
  };
  // The judge. Throws on an illegal story; a legal one is discarded here and
  // replayed for real when a participant opens the board.
  eventsFromRecording({
    boardRef: board.boardRef,
    dealer: board.dealer,
    vul: board.vul,
    hands: board.pack,
    auction: puzzle.auction,
    play: puzzle.play,
  });
  return puzzle;
}
