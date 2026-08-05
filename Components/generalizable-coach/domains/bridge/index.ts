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
// The hand-written solver and its oracle are GONE, not deprecated. Measured
// against a play-out of its own recommendations it was correct on 17 of 40
// five-card endings — it cached alpha-beta values after a cutoff, where the
// number is only a bound, keyed on position with no record of the window it was
// valid for. On one position it reported that both sides could win every trick.
//
// A wrong reference implementation is worse than none: it gets used as a test
// oracle and quietly certifies bad behaviour. Hosts supply an oracle through the
// port instead — bridge-web wires a WASM build of Bo Haglund's dds, which was
// correct on 40 of 40 and solves a full thirteen-card deal in ~13ms against
// roughly four days for ours.
// The principle engine, exported so a host can run it PROSPECTIVELY — over the
// cards a learner could play, not just the one they did. It is the only thing
// that can advise in the middle of a hand: a double-dummy search grows about
// sevenfold per card and cannot reach there, while a principle is O(1) and
// applies wherever its situation holds.
export { runPrinciples, type PrincipleFinding } from "./cardplay/principles";
