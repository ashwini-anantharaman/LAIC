import type { AppearanceOverrides, TableAppearance } from "@bridge/table-config";
import { type BridgeDecide } from "./BridgeTable";
import { type ChallengeDraftInput } from "./challengeDraft";
import { type SoloChallengeMark } from "./soloResults";
export interface ChallengePlayerProps {
    /**
     * The challenge, as <ChallengeCreator/> produced it — or the JSON a host
     * stored it as. It is normalised on the way in, so a blob written by an older
     * version of the wizard opens rather than throws.
     */
    draft: ChallengeDraftInput;
    /** The three seats the learner is not sitting in, and BEN's own line. */
    decide?: BridgeDecide;
    /** The felt's height. The strip's 40px comes out of it, not off it. */
    height?: number | string;
    appearance?: Partial<Omit<TableAppearance, "overrides">> & {
        overrides?: AppearanceOverrides;
    };
    robotDelayMs?: number;
    /**
     * Run BEN's silent reference line for each board. It is what every figure on
     * the results surface is measured against, so switching it off leaves the
     * boards playable and unrated — which is the honest degradation, not a
     * fabricated comparison.
     */
    benReference?: boolean;
    /** Fires whenever completion or the mark moves. The host's progress edge. */
    onProgress?: (mark: SoloChallengeMark) => void;
    /** Fires once, when the last board is frozen. */
    onComplete?: (mark: SoloChallengeMark) => void;
}
export declare function ChallengePlayer({ draft: input, decide, height, appearance, robotDelayMs, benReference, onProgress, onComplete, }: Readonly<ChallengePlayerProps>): import("react").JSX.Element;
