import type { Card, Seat, Vul } from "@bridge/events";
export interface BoardDraftState {
    boardNo: number;
    seed: number;
    dealer: Seat;
    humanSeat: Seat;
    vul: Vul;
    hands: Record<Seat, Card[]>;
    /** The pack differs from the seeded deal, so it travels card-by-card. */
    edited: boolean;
}
export declare const nextSeat: (seat: Seat) => Seat;
export declare function ChallengeBoardCard({ board, onChange, onReroll, }: Readonly<{
    board: BoardDraftState;
    onChange: (patch: Partial<BoardDraftState>) => void;
    onReroll: () => void;
}>): import("react").JSX.Element;
