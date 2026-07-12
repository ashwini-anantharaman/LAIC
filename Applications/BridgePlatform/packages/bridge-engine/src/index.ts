/**
 * @bridge/engine
 *
 * The pure bridge domain engine: hand evaluation, auction/play legality,
 * event-sourced game state (fold + single-writer controller, ported from the
 * bridgebot prototype), and the rules-as-data system — package schema,
 * predicate library, selection policies, interpreter, and the deterministic
 * AI decider. No React/DOM; runs in web, server, workers, and tests alike.
 *
 * Content boundary: this package contains NO convention content. Rules arrive
 * as BridgeRulePackage data from published knowledge packages (Phase 3);
 * the fixtures/ test package is a dev fixture, not bridge content.
 */

// Ported machinery
export * from "./hand";
export * from "./auction";
export * from "./state";
export * from "./apply";
export * from "./decision";
export * from "./game";
export { scoreBoard, resultLabel, type ScoreBreakdown } from "./scoring";

// Rules-as-data system
export * from "./rules/schema";
export {
  evalConstraint,
  hcpRangeWidth,
  KNOWN_PREDICATES,
  PREDICATES,
  type PredicateContext,
} from "./rules/predicates";
export {
  classifyRole,
  matchesAuctionPattern,
  partnerLastBid,
  type SeatRole,
} from "./rules/auctionPattern";
export { selectMatch, type SelectableMatch, type SelectionPolicy } from "./rules/policies";
export { interpretBid, interpretPlay, type InterpreterOptions } from "./rules/interpreter";
export { createPackageDecider, type PackageDeciderOptions } from "./rules/decider";

// Complex primitives (engine logic specified by knowledge items)
export {
  COMPLEX_PRIMITIVES,
  inferRanges,
  KNOWN_PRIMITIVES,
  type ComplexPrimitiveInfo,
  type SeatRange,
} from "./primitives";

// Golden-board harness
export { runBoards, type BoardInput, type BoardReport, type HarnessReport } from "./harness";

// Golden boards (curated + seeded deterministic deals for harness baselines)
export {
  BOARD_G1,
  GOLDEN_BOARDS,
  parseHandShdc,
  seededBoard,
} from "./fixtures/goldenBoards";
