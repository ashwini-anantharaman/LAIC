/**
 * Zone 3 — Bridge implementation: the bridge-flavored CoachSession wrapper.
 *
 * This is the one-call entry point bridge hosts use. It supplies the bridge
 * coach, the double-dummy oracle default, and the bridge chat persona, then
 * delegates to the platform's domain-agnostic createCoreCoachSession. All the
 * bridge-specific defaults live here, NOT in the platform.
 *
 *   const coach = createCoachSession({ learnerId: "S" });   // zero-config bridge
 */
import {
  createCoreCoachSession,
  type CoachSession,
  type CoreCoachSessionOptions,
} from "../../../platform/embed/index";
import { HeuristicLLM } from "../../../platform/embed/index";
import type { LLMLike } from "../../../platform/llm/index";
import type { FeedbackStyle, ExplanationDepth } from "../../../platform/types/index";
import { buildBridgeCoach, type BridgeCoach } from "./buildBridgeCoach";
import { BRIDGE_DOMAIN_ID } from "../plugin/constants";
import type { DoubleDummyOracle } from "../cardplay/oracle";

export interface CoachSessionOptions {
  /** the learner/seat being coached, e.g. "S" for South */
  learnerId: string;
  learnerName?: string;
  domainId?: string;
  feedbackStyle?: FeedbackStyle;
  explanationDepth?: ExplanationDepth;
  /** Inject a real model client (or proxy). Omit for the offline default. */
  llm?: LLMLike;
  /**
   * Double-dummy oracle for authoritative live card-play correctness.
   *
   * THERE IS NO DEFAULT, and that is the change. It used to construct an
   * in-process solver, so every host got authoritative-looking trick counts
   * without asking for them — and that solver was wrong, right on 17 of 40
   * measured endings. Omitting this now means card play is coached from
   * principles alone, which is a weaker coach and an honest one. `null` is
   * accepted as an explicit way to say the same thing.
   */
  oracle?: DoubleDummyOracle | null;
  /** reuse an already-built coach (e.g. to share a learner model). */
  coach?: BridgeCoach;
  /** Emit "silent" turns to listeners too (default false). */
  emitSilent?: boolean;
}

export function createCoachSession(opts: CoachSessionOptions): CoachSession {
  const domainId = opts.domainId ?? BRIDGE_DOMAIN_ID;
  const oracle = opts.oracle ?? undefined;
  const coach =
    opts.coach ?? buildBridgeCoach({ llm: opts.llm ?? new HeuristicLLM(), oracle });

  const coreOpts: CoreCoachSessionOptions = {
    learnerId: opts.learnerId,
    learnerName: opts.learnerName,
    domainId,
    coach,
    feedbackStyle: opts.feedbackStyle,
    explanationDepth: opts.explanationDepth,
    llm: opts.llm,
    chatPersona: "an adaptive bridge coach",
    emitSilent: opts.emitSilent,
  };
  return createCoreCoachSession(coreOpts);
}
