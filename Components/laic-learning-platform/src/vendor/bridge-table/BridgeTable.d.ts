import { type GameState } from "@bridge/engine";
import type { Call, Card, Seat, Vul } from "@bridge/events";
import { type AppearanceOverrides, type TableAppearance } from "@bridge/table-config";
/** What a host's robot answers with — a call in the auction, a card in play. */
export interface BridgeDecision {
    call?: Call;
    card?: Card;
}
/** Asked for one seat's action. Any transport: BEN over HTTP, a script, a bot. */
export type BridgeDecide = (state: GameState, seat: Seat) => Promise<BridgeDecision | null> | BridgeDecision | null;
export interface BridgeTableProps {
    /** The deal. Give cards outright, or a seed to derive them deterministically. */
    deal?: Record<Seat, Card[]>;
    seed?: number;
    dealer?: Seat;
    vul?: Vul;
    /** The seat the learner sits. Default South. */
    humanSeat?: Seat;
    /** Face up: the learner's hand always; the dummy once play starts. */
    showAllHands?: boolean;
    /**
     * Skin name, the layout knobs, and the five colour overrides — the platform's
     * own appearance vocabulary, so a look configured there reads the same here.
     */
    appearance?: Partial<Omit<TableAppearance, "overrides">> & {
        overrides?: AppearanceOverrides;
    };
    /** The other three seats. Omitted, they wait. */
    decide?: BridgeDecide;
    /** Milliseconds to pause before a robot acts, so a board can be followed. */
    robotDelayMs?: number;
    showCoach?: boolean;
    coachShare?: number;
    /** Fires once, when the last trick has resolved. */
    onComplete?: (state: GameState) => void;
    /**
     * Fires on EVERY position, the first included. A wrapper needs this when the
     * board it is running ends somewhere other than the last trick — a
     * bidding-only challenge board is over the moment the auction closes, and
     * `onComplete` would never fire at all there.
     */
    onState?: (state: GameState) => void;
}
export declare function BridgeTable({ deal, seed, dealer, vul, humanSeat, showAllHands, appearance, decide, robotDelayMs, showCoach, coachShare, onComplete, onState, }: Readonly<BridgeTableProps>): import("react").JSX.Element;
