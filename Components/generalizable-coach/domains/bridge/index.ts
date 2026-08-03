/**
 * `@laic/coach/domains/bridge` — the bridge domain, opt in.
 *
 * The counterpart to ../../core.ts. Core is what every host imports; this is
 * what a host that actually coaches BRIDGE imports as well. The split exists
 * because the root entrypoint registers this domain for side effect and, with
 * it, constructs a double-dummy solver — which is right for a bridge table and
 * pure weight for a host that coaches quizzes.
 *
 * WHAT IS NOT HERE, and why:
 *
 *   · The BIDDING evaluator. A host that owns the rules being taught — and
 *     bridge-web compiles a whole knowledge base — must feed its own verdicts
 *     through the `VerdictSource` port. Two evaluators for one game is two
 *     answers to "was that right", and the divergence is silent.
 *   · Domain REGISTRATION. Importing this used to register "bridge_gameplay"
 *     for side effect, which drags the LLM-backed bridge coach and its
 *     evaluator into the graph of a host that only wanted a card solver.
 *     Registration is its own module — `@laic/coach/domains/bridge/register` —
 *     so `openCoachSession("bridge_gameplay", …)` is opt-in too.
 *
 * What IS here is the exception that proves the rule: judging a CARD needs a
 * double-dummy search, which the bridge platform does not have and this
 * component does. That is a capability, not a second opinion.
 */

export { BRIDGE_DOMAIN_ID } from "./plugin/constants";
export type { Seat, BridgeBidAction, BridgeGameState } from "./plugin/events";

// --- Card play -------------------------------------------------------------
// The oracle decides correctness where it can see far enough; the principle
// engine names the tactic and covers the rest.
export {
  LiveCardPlayEvaluator,
  type LiveCardPlayAction,
  type LiveCardPlayState,
  type TrickCard,
} from "./cardplay/LiveCardPlayEvaluator";
export {
  NullOracle,
  type DoubleDummyOracle,
  type OracleVerdict,
} from "./cardplay/oracle";
export { LocalDoubleDummyOracle } from "./cardplay/dds/LocalDoubleDummyOracle";
// The principle engine, exported so a host can run it PROSPECTIVELY — over the
// cards a learner could play, not just the one they did. It is the only thing
// that can advise in the middle of a hand: a double-dummy search grows about
// sevenfold per card and cannot reach there, while a principle is O(1) and
// applies wherever its situation holds.
export { runPrinciples, type PrincipleFinding } from "./cardplay/principles";
export { solvePosition, encodeCard, decodeCard } from "./cardplay/dds/solver";
