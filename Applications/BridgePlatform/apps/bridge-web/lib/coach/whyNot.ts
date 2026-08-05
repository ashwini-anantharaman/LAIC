// "Why not the call I made?" — answered exactly, from evidence already computed.
//
// The best question in bridge coaching, and it needs no model. Every `decideBid`
// already returns a `trace`: every rule it considered, matched or not, with its
// reason — and for a hand that fell short, the near-miss spelled out ("needed
// 15–17 HCP, held 12"). The assessors were taking `decision.reason` and dropping
// the whole trace on the floor.
//
// What the trace cannot do alone is say WHICH CALL a failed rule would have made:
// a rule that fails its hand conditions never gets as far as realizing an action,
// so the trace records the failure without the call. So this walks the same
// surface the decider walked, realizes each context-matching rule to see what it
// would have produced, and joins that back to the trace by rule id.
//
// The cost is one extra pass over the rule surface. The bid-meaning card beside
// the bidding box already does exactly this pass on every render, so it is a
// proven price.

import {
  analyzeSeat,
  effectiveSurface,
  inferPartnership,
  matchContext,
  realizeAuctionAction,
  realizePlayBehavior,
} from "@bridge/engine";
import type { GameState, KbPlayerConfig } from "@bridge/engine";
import { sameSide } from "@bridge/events";
import type { Call, Card, Seat } from "@bridge/events";

import { cardCode } from "./tableEvents";
import type { RuleEval } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";

/** One rule that could have produced the call, and what stopped it. */
export interface Blocker {
  ruleId: string;
  label: string;
  /** The decider's own words for why it did not fire. */
  reason: string;
  /** Needed-vs-held detail, when the rule failed on hand conditions. */
  needed?: readonly string[];
}

export interface WhyNot {
  /** The call or card the learner made, in the engine's own notation. */
  call: Call | string;
  /** Rules whose agreement covers this call here, each with its blocker. */
  blocked: Blocker[];
  /**
   * True when NO rule in this system produces the call at this position — a
   * different answer from "you didn't qualify", and the honest one when the
   * system simply has no agreement that leads there.
   */
  noAgreement: boolean;
}

/**
 * Why the system did not make `call` at this position.
 *
 * `trace` comes from the same `decideBid` whose verdict is being explained, so
 * the two can never disagree — recomputing the decision here would risk exactly
 * that.
 */
export function whyNotCall({
  compiled,
  player,
  state,
  seat,
  call,
  trace,
}: {
  compiled: CompiledKb;
  player: KbPlayerConfig;
  state: GameState;
  seat: Seat;
  call: Call;
  trace: readonly RuleEval[];
}): WhyNot {
  const surface = effectiveSurface({ compiled, player });
  const facts = analyzeSeat(state.auction, seat, state.vul);
  // Context gating and action realization both read partnership state, so fill
  // it exactly as the decider does or the answers diverge from the verdict.
  facts.inference = inferPartnership(state.auction, seat, state.vul, {
    auctionRules: surface.auctionRules,
  });

  const byRuleId = new Map(trace.map((t) => [t.ruleId, t]));
  const blocked: Blocker[] = [];

  for (const rule of surface.auctionRules) {
    if (!matchContext(rule.context, facts)) continue; // the rule isn't about this position
    let would: Call | null;
    try {
      would = realizeAuctionAction(rule.action, state, seat, facts);
    } catch {
      continue; // a rule whose action cannot resolve here has nothing to say
    }
    if (would !== call) continue;

    const entry = byRuleId.get(rule.ruleId);
    // Absent from the trace, or matched: either way it is not a blocker. A rule
    // that MATCHED and produced this call means the call was available and the
    // selection policy chose another — that is `alternatives`, not a refusal.
    if (!entry || entry.matched) continue;

    blocked.push({
      ruleId: rule.ruleId,
      label: rule.label,
      reason: entry.reason,
      ...(entry.failedChecks?.length ? { needed: entry.failedChecks } : {}),
    });
  }

  return { call, blocked, noAgreement: blocked.length === 0 };
}

/**
 * The answer as a learner reads it.
 *
 * Leads with what the hand was short of, because that is the teachable part —
 * "needed five-plus spades, held one" is a lesson; "conditions not met" is not.
 */
export function whyNotText(
  why: WhyNot,
  shownAs: string,
  kind: "call" | "card",
): string {
  // Told, not sniffed. An earlier version guessed from the presence of a suit
  // glyph — but "1♦" is a CALL and has one, so every bid came out as "would
  // plays 1♦". The caller knows which it is; asking the string was never going
  // to work.
  const verb = kind === "card" ? "plays" : "bids";
  if (why.noAgreement) {
    return `Nothing in your system ${verb} ${shownAs} at this point — no agreement leads there.`;
  }
  return why.blocked
    .map((b) => {
      const short = b.needed?.length ? b.needed.join("; ") : b.reason;
      return `"${b.label}" would ${verb} ${shownAs}, but ${short}.`;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// The same question, for a card.
// ---------------------------------------------------------------------------

/**
 * Why the system did not play `card` at this position.
 *
 * `decidePlay` produces the same kind of trace as `decideBid`, so the same join
 * works — the only difference is how a rule is gated (position in the trick and
 * side, rather than auction role) and how its action is realized.
 *
 * Card play had "Why?" and no "Why not?", which left the more useful half of the
 * pair missing on two thirds of a board.
 */
export function whyNotCard({
  compiled,
  player,
  state,
  seat,
  card,
  trace,
}: {
  compiled: CompiledKb;
  player: KbPlayerConfig;
  state: GameState;
  seat: Seat;
  /** In the engine's notation — see `cardCode`. */
  card: string;
  trace: readonly RuleEval[];
}): WhyNot {
  const surface = effectiveSurface({ compiled, player });
  const byRuleId = new Map(trace.map((t) => [t.ruleId, t]));
  const blocked: Blocker[] = [];

  const trick = state.tricks[state.tricks.length - 1];
  const inTrick = trick && trick.plays.length > 0 && trick.plays.length < 4;
  const position = !inTrick
    ? "lead"
    : (["second", "third", "fourth"] as const)[trick.plays.length - 1]!;
  const declarerSide = Boolean(state.contract && sameSide(seat, state.contract.declarer));

  for (const rule of surface.playRules) {
    const spec = rule.spec;
    // Gated exactly as the decider gates it — a rule excluded by position or
    // side was never a candidate, so it is not a blocker and saying otherwise
    // would list every rule in the book.
    if (spec.position !== "any" && spec.position !== position) continue;
    if (spec.side && spec.side !== "any") {
      if (spec.side === "declarer" && !declarerSide) continue;
      if (spec.side === "defense" && declarerSide) continue;
    }

    let would: Card | null;
    try {
      would = realizePlayBehavior(spec.behavior, state, seat);
    } catch {
      continue;
    }
    if (!would || cardCode(would) !== card) continue;

    const entry = byRuleId.get(rule.ruleId);
    if (!entry || entry.matched) continue;

    blocked.push({
      ruleId: rule.ruleId,
      label: rule.label,
      reason: entry.reason,
      ...(entry.failedChecks?.length ? { needed: entry.failedChecks } : {}),
    });
  }

  return { call: card, blocked, noAgreement: blocked.length === 0 };
}
