/**
 * Zone 3 — Bridge: the double-dummy oracle port.
 *
 * The oracle is the authoritative correctness source for the play of the hand:
 * given the full deal and the card the learner played, it says how many tricks
 * that card yields with best play by everyone (double-dummy) versus the best
 * available, and which cards are optimal. It is a PORT so the heavy solver (a
 * WASM build of Bo Haglund's DDS, or any equivalent) can be dropped in behind a
 * stable interface, lazy-loaded, or swapped for a worker — without the
 * evaluator or any UI knowing.
 *
 * When no solver is wired (or it cannot judge a position), the evaluator falls
 * back to the deterministic principle engine (see principles.ts). That is the
 * "hybrid" design: the oracle judges correctness, principles + knowledge + LLM
 * explain the why.
 */
import type { LiveCardPlayState } from "./LiveCardPlayEvaluator";

export interface OracleVerdict {
  /** tricks the learner's side takes if the played card is chosen, then best play by all */
  playedTricks: number;
  /** best tricks the learner's side can take from this position */
  bestTricks: number;
  /** the card(s) that achieve bestTricks, in "HQ" form */
  bestCards: string[];
  /** tricks given up versus optimal (0 = the play is double-dummy optimal) */
  tricksLost: number;
}

export interface DoubleDummyOracle {
  /**
   * Judge the played card. Return `undefined` when the oracle cannot evaluate
   * this position (not wired, mid-load, or unsupported) so the evaluator can
   * fall back to principles.
   */
  evaluate(
    state: LiveCardPlayState,
    playedCard: string,
  ): Promise<OracleVerdict | undefined>;
}

/** Default oracle: judges nothing, so the coach relies purely on principles. */
export class NullOracle implements DoubleDummyOracle {
  async evaluate(): Promise<OracleVerdict | undefined> {
    return undefined;
  }
}
