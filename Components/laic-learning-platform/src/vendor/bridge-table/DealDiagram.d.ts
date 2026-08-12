import type { Call, Card, Seat, Vul } from "@bridge/events";
export interface DealDiagramProps {
    /** The deal, derived exactly as <BridgeTable/> derives it. */
    seed?: number;
    /** Or the cards outright. */
    deal?: Record<Seat, Card[]>;
    dealer?: Seat;
    vul?: Vul;
    /** The whole board, or just one seat's hand. */
    show?: "all" | Seat;
    /** What the board card reads. Defaults to the seed. */
    boardLabel?: string | number;
    /** Seat names on the plates. Defaults to North / East / South / West. */
    names?: Partial<Record<Seat, string>>;
    /** An auction to print with the board, from the dealer onward. */
    auction?: readonly Call[];
    /** Gold plate — the seat the lesson is about. */
    highlightSeat?: Seat | null;
    /** Face-down seats show suit dashes. Ignored when showing one hand. */
    hiddenSeats?: readonly Seat[];
}
export declare function DealDiagram({ seed, deal, dealer, vul, show, boardLabel, names, auction, highlightSeat, hiddenSeats, }: Readonly<DealDiagramProps>): import("react").JSX.Element;
