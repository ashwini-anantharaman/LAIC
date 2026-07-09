/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/CoachingPolicyProfile.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * The inner behavioral profile a CoachProfile resolves to (persona, hint ladder, questioning style, intervention policy, enabled tools). Collapsed by the resolver into the flat CoachingPolicy the runtime consumes. See LAIC architecture §8.2.
 */
export interface CoachingPolicyProfile {
  schemaVersion: string;
  profileId: string;
  displayName: string;
  persona?: {
    tone?: string;
    terminology?: {
      [k: string]: string;
    };
  };
  hintLadder?: {
    maxLevel?: number;
    /**
     * start the ladder in question form before revealing
     */
    questionFirst?: boolean;
  };
  questioningStyle: "socratic" | "direct" | "mixed";
  interventionPolicy: {
    maxHintLevel: number;
    allowDirectAnswer?: boolean;
    feedbackStyle?: "gentle" | "direct" | "socratic" | "minimal" | "mixed";
    interruptionTolerance?: "low" | "medium" | "high";
    postmortemVsRealtime?: "prefer_realtime" | "prefer_postmortem";
  };
  enabledTools?: string[];
  /**
   * CoachingPolicy fields lower layers may NOT override.
   */
  lockedFields?: string[];
}
