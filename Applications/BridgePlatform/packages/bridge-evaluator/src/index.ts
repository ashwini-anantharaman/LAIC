/**
 * @bridge/evaluator
 *
 * Judges committed human actions against (resolved config, package version, board state, learner level) producing BridgeActionEvaluation. Structured judgment only, never coaching language, never an LLM.
 *
 * Implementation lands in Phase 8 of
 * laicdocs/Bridge_Workstream_Execution_Plan_v1.md. This is a Phase 0 stub
 * establishing the package boundary; do not add implementation here until
 * that phase begins.
 */

export const PACKAGE_NAME = "@bridge/evaluator" as const;
