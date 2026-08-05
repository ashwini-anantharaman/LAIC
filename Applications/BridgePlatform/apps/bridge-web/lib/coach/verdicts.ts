// Was that call right? — the host's answer, for the coach to act on.
//
// THE COACH NEVER RE-IMPLEMENTS BRIDGE. It decides whether to speak, in what
// form and at what depth; what "right" means is the host's to say, because the
// host owns the rulebook the table is actually playing. So this file produces
// the `EvaluationResult` the engine consumes, and the engine's own bridge
// evaluator stays unused.
//
// The mechanism is the KB decider run in ASK mode: `decideBid` is pure over
// (compiled rules, state, seat) and commits nothing, so we can ask "what would
// this system have called here?" at the exact position the learner faced, then
// compare. Robot calls already carry this verdict — their logic events record
// `reason`, `matchedRuleId`, `rejected[]`. A human call records
// `reason: "human action"` and nothing else, which is the gap this closes.
//
// THE MAPPING, written once so it is not re-invented per call site:
//
//   the system would have made this call        → aligned              → correct
//   another rule that matched here realizes it  → reasonable alternative → acceptable
//   no rule that matched here produces it       → not system-aligned   → incorrect
//   no rule matched at all (fallback)           → the system is SILENT → no verdict
//
// The last line is the important one. A rulebook with no agreement for a
// position has not been contradicted, and a coach that says "wrong" when its
// own rulebook has nothing to say is worse than a coach that says nothing.

import { analyzeSeat, createKbDecider } from "@bridge/engine";
import type { GameState, KbPlayerConfig } from "@bridge/engine";
import { partnerOf } from "@bridge/events";
import type { Call, Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { SeatConfig } from "@bridge/sessions";
import type {
  Correctness,
  EvaluationResult,
  Severity,
  VerdictSource,
} from "@laic/coach/core";

/** What the system said, kept beside the verdict so a note can cite it. */
export interface CallVerdict {
  evaluation: EvaluationResult;
  /** The call the system would have made. */
  systemCall: Call;
  /** The rule it would have acted on — the citation. */
  ruleLabel: string;
  ruleId?: string;
  /** Other rules that matched this position, for "reasonable alternative". */
  alternatives: { ruleId: string; title: string; action: Call }[];
  /**
   * The auction role — opening / responder / opener rebid / overcaller /
   * advancer. Lets a low-level hint name the AREA ("this is a response to
   * partner's opening") without naming the rule, whose title usually contains
   * the answer.
   */
  role: string;
}

/**
 * The skill an action exercises, from the position rather than the rule.
 *
 * Mastery is keyed per skill, and compiled KB rules carry no skill id — the
 * taxonomy exists (`@bridge/taxonomy`) but nothing links the two. Deriving the
 * skill from the auction ROLE, which the engine already computes to gate rules,
 * costs nothing and is right often enough to be useful. Attaching skill ids to
 * rules is the better long-run answer; it touches every knowledge item.
 */
const SKILL_BY_ROLE: Record<string, string> = {
  opening: "sk_opening_bid_selection",
  opener: "sk_opener_rebid",
  responder: "sk_response_selection",
  overcaller: "sk_competitive_bidding",
  advancer: "sk_competitive_bidding",
};

/** Every pack in the KB, at its defaults — the last resort (see below). */
const WHOLE_KB: KbPlayerConfig = {
  enabledPackIds: [],
  settingOverrides: {},
  decisionPolicyId: "first_match",
};

/**
 * Which system to hold the learner to.
 *
 * **Their partnership's, not the whole knowledge base.** Bidding agreements are
 * a property of a PARTNERSHIP: what 1♠ promises is whatever you and your
 * partner have agreed it promises. Judging against every pack the KB happens to
 * contain would cite rules your own partner does not play — telling a learner
 * "your system calls 1♥" when their partner would never read it that way.
 *
 * A human seat carries no configuration, so the partnership's system is read
 * off the seat that has one:
 *   1. partner, if partner is a KB player — the correct answer;
 *   2. any KB player at the table — an opponent's system is a poor proxy, but
 *      at a teaching table everyone is usually dealt the same deck, and it
 *      beats the whole KB;
 *   3. the whole KB — an all-human table, where nobody has declared a system.
 *
 * (The bid-meaning card beside the bidding grid still uses the whole KB. That
 * is right for it: it answers "what could this call mean", not "what should
 * YOU have called".)
 */
export function partnershipSystem(
  seats: Record<Seat, SeatConfig>,
  learnerSeat: Seat,
): KbPlayerConfig {
  const configOf = (seat: Seat): KbPlayerConfig | null => {
    const c = seats[seat];
    return c?.kind === "kb_player"
      ? {
          enabledPackIds: c.enabledPackIds,
          settingOverrides: c.settingOverrides,
          decisionPolicyId: c.decisionPolicyId,
          ...(c.levelOrdinal !== undefined ? { levelOrdinal: c.levelOrdinal } : {}),
        }
      : null;
  };

  const fromPartner = configOf(partnerOf(learnerSeat));
  if (fromPartner) return fromPartner;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    const c = configOf(seat);
    if (c) return c;
  }
  return WHOLE_KB;
}

/**
 * A verdict producer bound to one system (compiled KB + the packs and settings
 * in play). The surface is resolved once inside the decider, and the decider
 * memoizes partnership inference across turns, so asking about every call in an
 * auction is cheap.
 */
export function bridgeVerdicts({
  compiled,
  player = WHOLE_KB,
}: {
  compiled: CompiledKb;
  /** The partnership's system — see `partnershipSystem`. */
  player?: KbPlayerConfig;
}) {
  const decider = createKbDecider({ compiled, player });
  /** The rich verdict behind each EvaluationResult, for note-building. */
  const detail = new Map<string, CallVerdict>();

  /**
   * Judge `call`, made by `seat` at `stateBefore`. `null` means the system has
   * no opinion here and the coach should stay quiet.
   */
  async function forCall(
    stateBefore: GameState,
    seat: Seat,
    call: Call,
  ): Promise<CallVerdict | null> {
    const decision = await decider.decideBid(stateBefore, seat);
    // No rule matched: the safe default acted, not the rulebook. Nothing to
    // hold the learner to.
    if (decision.fallback) return null;

    const alternatives = (decision.matches ?? []).filter(
      (m) => m.ruleId !== decision.matchedRuleId,
    );
    const alternativeHere = alternatives.find((m) => m.action === call);

    let correctness: Correctness;
    let severity: Severity;
    let confidence: number;
    if (decision.action === call) {
      correctness = "correct";
      severity = "minor";
      confidence = 0.9;
    } else if (alternativeHere) {
      correctness = "acceptable";
      severity = "minor";
      confidence = 0.7;
    } else {
      correctness = "incorrect";
      // How wrong: a call the system considered but ranked below its choice is
      // a different mistake from one no matched rule produces at all.
      severity = decision.candidates.includes(call) ? "moderate" : "major";
      confidence = 0.75;
    }

    const role = analyzeSeat(stateBefore.auction, seat, stateBefore.vul).role;
    const skillId = SKILL_BY_ROLE[role];

    return {
      systemCall: decision.action,
      ruleLabel: alternativeHere?.title ?? decision.reason,
      ruleId: alternativeHere?.ruleId ?? decision.matchedRuleId,
      alternatives,
      role,
      evaluation: {
        correctness,
        confidence,
        severity,
        bestAction: decision.action,
        alternativeActions: decision.candidates,
        conceptIds: [],
        skillIds: skillId ? [skillId] : [],
        // Machine-readable, never shown to the learner — the note builds its
        // own phrasing from the citation.
        explanation: `system would call ${decision.action} (${decision.reason})`,
      },
    };
  }

  return {
    forCall,
    /**
     * The component's `VerdictSource` port — what the COACH consumes.
     *
     * It hands over only an `EvaluationResult`, which is all the engine needs
     * and all a domain-free engine should be given. The citation, the rule
     * label and the alternatives are richer than that contract, and they are
     * the HOST's material for writing the note; `detailFor` is how the host
     * gets them back. Keeping the split honest is what lets the coach move
     * out-of-process later without the note losing its provenance.
     */
    source: {
      async evaluate(event, state) {
        const action = (event as { action?: { kind?: string; call?: string; seat?: Seat } }).action;
        if (action?.kind !== "call" || !action.call || !action.seat) return null;
        const verdict = await forCall(state as GameState, action.seat, action.call);
        if (!verdict) return null;
        detail.set(event.eventId, verdict);
        return verdict.evaluation;
      },
    } satisfies VerdictSource,

    /** The full verdict behind the event's evaluation, once `evaluate` has run. */
    detailFor(eventId: string): CallVerdict | undefined {
      return detail.get(eventId);
    },
  };
}
