import { type DrillHand } from "./openingBidHands";
import { type BiddingChallengeAnswer, type BiddingChallengeMark } from "./openingBidDrill";
export interface BiddingChallengeProps {
    /**
     * The hands, in order. Defaults to the authored set so the drill is a drill
     * with no configuration at all; an author with their own set passes it here
     * and everything below — the judging, the notice, the mark — reads theirs.
     */
    hands?: readonly DrillHand[];
    /** Ask only the first N. Anything ≤ 0 or absent asks the whole set. */
    limit?: number;
    /**
     * Show the aggregate "this data has problems" notice. True by default: a
     * component that knows its hands are broken should say so wherever it is
     * mounted. A host that has its own author-facing surface for it — the
     * learning platform prints it in the block's Configure panel — turns it off
     * for readers, who are told about the hand in front of them either way.
     */
    showDataNotice?: boolean;
    /** Fires after every answer, with the running mark. */
    onProgress?: (mark: BiddingChallengeMark) => void;
    /** Fires once, when the last hand has been answered. */
    onComplete?: (mark: BiddingChallengeMark, answers: readonly BiddingChallengeAnswer[]) => void;
}
export declare function BiddingChallenge({ hands, limit, showDataNotice, onProgress, onComplete, }: Readonly<BiddingChallengeProps>): import("react").JSX.Element;
