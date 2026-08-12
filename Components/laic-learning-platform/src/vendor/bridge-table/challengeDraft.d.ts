import { MAX_BOARDS, MIN_BOARDS, type ChallengeFormat, type ChallengeScoring, type ControlOverride } from "@bridge/challenges";
import { type Card, type Seat, type Vul } from "@bridge/events";
export { MAX_BOARDS, MIN_BOARDS };
export declare const TITLE_MAX = 120;
export declare const DESCRIPTION_MAX = 240;
/**
 * WHAT A BOARD ASKS FOR — the first question the wizard puts, because it
 * decides whether the scoring question is asked at all.
 *
 * `bidding-only` is not a variant of a scored board: it ends the board at the
 * end of the auction and replaces the score with one comparison against BEN's
 * own auction on the same deal.
 */
export declare const FORMAT_OPTIONS: readonly {
    key: ChallengeFormat;
    label: string;
    sub: string;
    note: string;
    /** The line the Review step reads. */
    review: string;
}[];
export declare const SCORING_OPTIONS: readonly {
    key: ChallengeScoring;
    label: string;
    full: string;
    note: string;
}[];
/**
 * The table controls a creator may force on or off for this challenge, keyed by
 * their ACCESS-CATALOGUE key so a draft authored here means the same thing on
 * the platform. Undo and show-all-hands default to `hide`: this is scored play.
 */
export declare const CHALLENGE_CONTROLS: readonly {
    key: string;
    label: string;
    sub: string;
    def: ControlState;
    note?: string;
}[];
/** A checklist cell: leave the catalogue alone, or override it either way. */
export type ControlState = "default" | ControlOverride;
export declare const CONTROL_STATES: readonly {
    key: ControlState;
    label: string;
}[];
export declare function defaultControlStates(): Record<string, ControlState>;
/** The checklist's non-`default` cells — what actually gets stored. */
export declare function controlOverridesOf(states: Record<string, ControlState>): Record<string, ControlOverride>;
/** The state of the two controls the PLAYER actually reads off the draft. */
export declare function tableControls(overrides: Record<string, ControlOverride> | undefined): {
    showAllHands: boolean;
};
export interface ChallengeBoardDraft {
    boardNo: number;
    /** The deal seed — `seededDeal(seed)` reproduces the pack exactly. */
    seed: number;
    dealer: Seat;
    humanSeat: Seat;
    /**
     * The board's OWN vulnerability. Omitted, it follows the standard cycle for
     * its position. A board imported from a BBO link brings its own, because
     * vulnerability is part of the deal that was imported.
     */
    vul?: Vul;
    /** Set once the creator hand-edited this board: ♠.♥.♦.♣ text per seat. */
    pack?: Record<Seat, string>;
}
/**
 * The stored draft. This IS the block's content in a host that persists one —
 * a plain JSON object with no ids, no timestamps and no user in it.
 */
export interface SoloChallengeDraft {
    title: string;
    description: string;
    /** Absent is tolerated and MEANS `full`, exactly as on the platform. */
    format?: ChallengeFormat;
    /** Ignored by a bidding-only challenge, but carried so switching back
     *  restores the creator's choice rather than silently resetting it. */
    scoring: ChallengeScoring;
    boards: ChallengeBoardDraft[];
    controlOverrides: Record<string, ControlOverride>;
}
/** A hand-edited pack, parsed and legality-checked. */
export declare function packFromDraft(pack: Record<Seat, string>): {
    hands: Record<Seat, Card[]>;
} | {
    error: string;
};
/**
 * Every rule the create form enforces, as readable sentences. The wizard runs
 * it to keep the Create button honest; a host that stores drafts should run it
 * again on the way back in, because a stored blob is never the authority.
 */
export declare function validateDraft(draft: SoloChallengeDraft): string[];
/**
 * WHAT A HOST IS ALLOWED TO HAND IN. A draft that has been through JSON — a
 * tutorial block's content, a database column — is a plain object until
 * something checks it, so the components take one and run `normalizeDraft`
 * themselves rather than asking every host to prove the shape first.
 */
export type ChallengeDraftInput = SoloChallengeDraft | object;
/**
 * A stored blob read back as a draft, with every gap filled by the default the
 * wizard would have given it. A host persists JSON, and JSON that came from an
 * older version of this component must still open.
 */
export declare function normalizeDraft(raw: unknown): SoloChallengeDraft | null;
