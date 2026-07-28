/**
 * @bridge/engine — the game-LAW layer only (Knowledge Rework decision 17):
 * hand evaluation, auction/play legality, event-sourced game state (fold +
 * single-writer controller), and Law-77 scoring. No React/DOM; runs in web,
 * server, workers, and tests alike.
 *
 * The decision layer (rule matching, policies, interpretation) was rebuilt
 * against @bridge/kb's compiled artifacts and lives in ./decide (Stage B).
 * This package contains NO convention content and never will.
 */

export * from "./hand";
export * from "./auction";
export * from "./state";
export * from "./apply";
export * from "./decision";
export * from "./game";
export { scoreBoard, resultLabel, type ScoreBreakdown } from "./scoring";

// Decision layer v2 (Knowledge Rework §2): interprets @bridge/kb compiled
// artifacts. Policies, fallback chain, engine floor, full traces.
export {
  analyzeSeat,
  matchCallPattern,
  matchContext,
  type SeatAuctionFacts,
} from "./decide/auctionContext";
export {
  evalCondition,
  resolveNumParam,
  resolveSuitRef,
  totalPoints,
  type ConditionEnv,
} from "./decide/handConditions";
export {
  realizeAuctionAction,
  realizeLead,
  realizePlayBehavior,
} from "./decide/actions";
export {
  createKbDecider,
  effectiveSurface,
  type KbDeciderOptions,
  type KbPlayerConfig,
} from "./decide/decider";
export {
  inferPartnership,
  type PartnershipInference,
  type ShownState,
  type InferenceSurface,
} from "./decide/inference";
export { mulberry32, seedFrom } from "./decide/rng";
export {
  seededDeal,
  simulateDeal,
  simulateSelfPlay,
  type SelfPlayReport,
  type SimulatedDeal,
  type SimulateOptions,
} from "./decide/simulate";
export {
  analyzeSelfPlay,
  outcomeAnomalies,
  type AnalyzeOptions,
  type ContinuationGap,
  type OutcomeAnomaly,
  type AnomalyKind,
  type InsightsReport,
  type DealOutcome,
} from "./decide/insights";
