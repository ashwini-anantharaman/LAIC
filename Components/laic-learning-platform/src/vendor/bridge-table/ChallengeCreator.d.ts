import { type ChallengeDraftInput, type SoloChallengeDraft } from "./challengeDraft";
export interface ChallengeCreatorProps {
    /**
     * A draft to re-open — everything the author had, as the wizard produced it
     * or as a host stored it. Absent, the wizard starts from fresh random deals.
     */
    draft?: ChallengeDraftInput;
    /**
     * Where a finished draft goes. Called on every Create press; the host stores
     * it, plays it, or both. This is the only outward edge the wizard has.
     */
    onCreate: (draft: SoloChallengeDraft) => void;
    /** The Create button's word. Defaults to "Create challenge". */
    createLabel?: string;
    /**
     * Fires on EVERY change, not only on Create — for a host whose editor saves
     * continuously and has no Create button of its own.
     */
    onChange?: (draft: SoloChallengeDraft) => void;
    /** Seed the first set of deals derive from. Given, the first render is
     *  reproducible; absent, a random one is chosen on mount. */
    seedBase?: number;
}
export declare function ChallengeCreator({ draft: stored, onCreate, onChange, createLabel, seedBase, }: Readonly<ChallengeCreatorProps>): import("react").JSX.Element;
