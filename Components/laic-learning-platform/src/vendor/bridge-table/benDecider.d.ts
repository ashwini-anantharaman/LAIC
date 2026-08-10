import { type GameState } from "@bridge/engine";
import { type AuctionCall, type Call, type Card, type Seat, type Vul } from "@bridge/events";
import type { BridgeDecide } from "./BridgeTable";
/** A hand as BEN's PBN holding: "AKQ.J54.T92.8763" in ♠.♥.♦.♣ order. */
export declare function handToPbn(cards: readonly Card[]): string;
/** The auction so far, as concatenated ctx tokens (empty = opening bid). */
export declare function auctionToCtx(auction: readonly AuctionCall[]): string;
/** BEN's vul code: none empty, both @v@V, NS @v, EW @V. */
export declare function vulToBen(vul: Vul): string;
/** The play so far as BEN's `played` string: "DJDKD3D2…" in play order. */
export declare function playedToBen(state: Pick<GameState, "tricks">): string;
/** A seat's ORIGINAL 13 cards: what it still holds plus what it has played. */
export declare function originalHand(state: Pick<GameState, "hands" | "tricks">, seat: Seat): Card[];
/** BEN's returned call in our notation. Unknown tokens pass through. */
export declare function normalizeBenCall(bid: string): Call;
/** "S7" / "HT" / "CA" → a Card, or null when unparseable. */
export declare function parseBenCard(raw: string): Card | null;
export interface BenDeciderOptions {
    /** Where BEN is. No trailing slash needed. */
    endpoint: string;
    /** Per-request ceiling. BEN's hard bids can take tens of seconds. */
    timeoutMs?: number;
    /** Swap in for tests. Defaults to the global fetch. */
    fetchImpl?: typeof fetch;
    /** Called with a one-line reason whenever a seat is skipped. */
    onProblem?: (why: string) => void;
}
/**
 * A `decide` backed by BEN. Give it to <BridgeTable decide={...}/> and the three
 * seats the learner is not sitting in are played by the neural engine.
 */
export declare function createBenDecider({ endpoint, timeoutMs, fetchImpl, onProblem, }: BenDeciderOptions): BridgeDecide;
