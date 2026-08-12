import { type GameState } from "@bridge/engine";
import { type Card, type Seat, type Vul } from "@bridge/events";
import type { BridgeDecide } from "./BridgeTable";
import type { SoloLine } from "./soloResults";
export interface BenReferenceInput {
    hands: Record<Seat, Card[]>;
    dealer: Seat;
    vul: Vul;
    /** The seat the LEARNER sits — the side the raw score is signed for. */
    humanSeat: Seat;
    biddingOnly: boolean;
    decide: BridgeDecide;
    /** Set true to abandon the line (the board changed, the block unmounted). */
    cancelled: () => boolean;
}
export declare function runBenReferenceLine(input: BenReferenceInput): Promise<SoloLine | null>;
/**
 * A finished GameState as a comparable line. The raw score is flipped for an
 * E/W seat so the figure always reads "good for the learner" — the convention
 * `ChallengePlay.rawScore` uses, and the reason two lines can be compared at
 * all. NO SCORE IS NOT A SCORE OF ZERO: a bidding-only line leaves it absent.
 */
export declare function freezeLine(state: GameState, humanSeat: Seat, biddingOnly: boolean): SoloLine;
