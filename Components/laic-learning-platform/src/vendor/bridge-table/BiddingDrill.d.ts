import type { Call, Card, Seat, Vul } from "@bridge/events";
import type { BridgeDecide } from "./BridgeTable";
/** One problem: a deal, who deals, who the learner is, and what came before. */
export interface DrillHand {
    /** The deal, derived exactly as <BridgeTable/> derives it. */
    seed?: number;
    /** Or the cards outright, when a drill teaches one specific holding. */
    deal?: Record<Seat, Card[]>;
    dealer?: Seat;
    vul?: Vul;
    /** The seat the learner holds on this hand. */
    seat?: Seat;
    /**
     * The calls BEFORE the learner's turn, starting with the dealer — so a drill
     * can pose a response or an overcall, not only an opening bid. Illegal or
     * over-long prefixes are ignored rather than trusted. Whatever is missing
     * between the prefix and the learner's turn is filled with passes, and the
     * grid shows every call, so the question is never implied.
     */
    auction?: readonly Call[];
    /** The author's word on this hand, shown with the feedback. */
    note?: string;
}
/** What the learner did on one hand, and what BEN said about it. */
export interface DrillAnswer {
    index: number;
    seat: Seat;
    seed: number | null;
    /** The learner's call. */
    yourCall: Call;
    /** BEN's call, or null when it never arrived. */
    benCall: Call | null;
    /** null when there is nothing to compare against. */
    agreed: boolean | null;
    /** How long BEN took, for a host that wants to know. */
    benMs: number | null;
}
export interface BiddingDrillProps {
    /** The problems, in order. */
    hands: readonly DrillHand[];
    /** Defaults for any hand that does not say. */
    dealer?: Seat;
    vul?: Vul;
    seat?: Seat;
    /** The judge. Same signature <BridgeTable/> takes; createBenDecider fits. */
    decide?: BridgeDecide;
    /**
     * How many BEN requests to keep in flight while prefetching. Two, measured:
     * against ben-service a COLD request is ~12s and a warm one ~0.35s, so lanes
     * mostly buy extra cold starts rather than extra answers — six hands cost
     * ~13s either way. Two lanes keep one genuinely slow hand from blocking the
     * queue behind it without paying for six cold starts.
     */
    prefetchConcurrency?: number;
    /** Fires once, when the last hand has been answered. */
    onComplete?: (answers: readonly DrillAnswer[]) => void;
}
export declare function BiddingDrill({ hands, dealer, vul, seat, decide, prefetchConcurrency, onComplete, }: Readonly<BiddingDrillProps>): import("react").JSX.Element;
