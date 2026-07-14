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
