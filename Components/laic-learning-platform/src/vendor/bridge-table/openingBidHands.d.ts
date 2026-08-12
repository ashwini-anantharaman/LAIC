import type { Card } from "@bridge/events";
/** One drill hand: what the learner sees, what they should bid, and why. */
export interface DrillHand {
    /** 1-based, as the author numbered them. */
    no: number;
    hand: Card[];
    /** The author's answer, in our call notation ("P", "1S", "1N", "2C"…). */
    bid: string;
    /** Shown after the learner answers — the author's own reasoning. */
    why: string;
}
/** High-card points, so the drill can show them and check the author's note. */
export declare function hcp(cards: readonly Card[]): number;
export declare const OPENING_BID_HANDS: readonly DrillHand[];
export interface DrillHandProblem {
    no: number;
    /** "short" = fewer than 13 cards; "hcp" = the note disagrees with the cards. */
    kind: "short" | "hcp";
    detail: string;
}
/**
 * Every way a hand contradicts itself. Teaching data is worth checking: a drill
 * that shows 12 cards, or claims a point count the cards do not hold, teaches
 * the wrong lesson confidently. Called by the component so problems surface
 * where an author can see them rather than only in a test.
 */
export declare function validateDrillHands(hands?: readonly DrillHand[]): DrillHandProblem[];
