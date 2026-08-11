import type { Card, Rank, Suit } from "@bridge/events";
/** Editor/display suit order (also the dot order in serialized hands). */
export declare const SUIT_ORDER: Suit[];
/** "ak q2" / "AKQ2" / "10 9" → [14,13,12,2]… (or a readable error). */
export declare function ranksFromText(text: string): Rank[] | {
    error: string;
};
/** "AKQ2.987.T4.QJ32" (♠.♥.♦.♣) → a hand (or a readable error). */
export declare function handFromSerialized(serialized: string): Card[] | {
    error: string;
};
/** A hand → per-suit display strings (highest first), for prefill. */
export declare function suitTextsFromCards(hand: readonly Card[]): Record<Suit, string>;
/** A whole hand in the ♠.♥.♦.♣ serialization the draft carries. */
export declare function serializeHand(hand: readonly Card[]): string;
