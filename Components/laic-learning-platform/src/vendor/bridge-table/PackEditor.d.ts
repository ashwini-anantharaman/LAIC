import { type Card, type Seat } from "@bridge/events";
export interface PackEditorProps {
    /** Prefill: the four hands as they stand. */
    hands: Record<Seat, Card[]>;
    /** The pack, once all four hands hold thirteen. */
    onApply: (hands: Record<Seat, Card[]>) => void;
    onCancel: () => void;
    applyLabel?: string;
}
export declare function PackEditor({ hands, onApply, onCancel, applyLabel, }: Readonly<PackEditorProps>): import("react").JSX.Element;
