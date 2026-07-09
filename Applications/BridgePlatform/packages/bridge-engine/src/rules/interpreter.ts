// The rule interpreter: evaluates a BridgeRulePackage against a position and
// produces a Decision with the same trace richness the prototype's hardcoded
// rule chains emitted (every rule considered, matched or skipped, with
// reasons; cited settings; facts; explicit fallback flag). Attribution
// honesty: a fallback is never presented as a rule-supported decision.

import type { Setting, SettingValue } from "@bridge/config";
import {
  callLabel,
  cardId,
  isContractBid,
  isMajor,
  isMinor,
  partnerOf,
  SUIT_RANK,
  type Call,
  type Card,
  type CitedSetting,
  type RuleEval,
  type Seat,
  type Suit,
} from "@bridge/events";
import { legalPlays } from "../apply";
import { legalCalls } from "../auction";
import type { Decision } from "../decision";
import { hcp, longestSuits, shape, suitCounts } from "../hand";
import type { GameState } from "../state";
import { matchesAuctionPattern } from "./auctionPattern";
import { evalConstraint, hcpRangeWidth, type PredicateContext } from "./predicates";
import { selectMatch, type SelectableMatch, type SelectionPolicy } from "./policies";
import type {
  BidRuleAction,
  BridgeRulePackage,
  PlayRuleAction,
  SettingGate,
} from "./schema";

export interface InterpreterOptions {
  pkg: BridgeRulePackage;
  /** Resolved configuration values (from @bridge/config resolveAll). */
  values: Record<string, SettingValue>;
  policy?: SelectionPolicy;
  /** Seeded RNG for the "random" policy (determinism unless explicitly random). */
  rng?: () => number;
}

interface Match<A> extends SelectableMatch<A> {
  cited: CitedSetting[];
}

// ---------------------------------------------------------------------------
// Setting gates
// ---------------------------------------------------------------------------

const sameValue = (a: SettingValue | undefined, b: SettingValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

function checkGates(
  gates: SettingGate[],
  values: Record<string, SettingValue>,
  settingsByKey: Map<string, Setting>,
): { passed: boolean; cited: CitedSetting[]; failedKey?: string } {
  const cited: CitedSetting[] = [];
  let failedKey: string | undefined;
  for (const gate of gates) {
    const value = values[gate.key];
    const ok = gate.equals !== undefined ? sameValue(value, gate.equals) : Boolean(value);
    const setting = settingsByKey.get(gate.key);
    cited.push({
      key: gate.key,
      label: setting?.label ?? gate.key,
      value: value ?? false,
      binds_to: setting?.binds_to ?? "convention_rules",
      module: setting?.module ?? "unknown",
      matched: ok,
    });
    if (!ok && failedKey === undefined) failedKey = gate.key;
  }
  return { passed: failedKey === undefined, cited, failedKey };
}

// ---------------------------------------------------------------------------
// Action templates -> concrete actions
// ---------------------------------------------------------------------------

function resolveBidAction(
  action: BidRuleAction,
  ctx: PredicateContext,
  legal: Set<Call>,
): Call | null {
  switch (action.kind) {
    case "call":
      return action.call;
    case "pass":
      return "P";
    case "openLongest": {
      const tieBreak = action.tieBreak ?? "higher";
      const counts = suitCounts(ctx.hand);
      const suits = (Object.keys(counts) as Suit[]).filter((s) =>
        action.among === "majors" ? isMajor(s) : action.among === "minors" ? isMinor(s) : true,
      );
      let best: Suit | null = null;
      for (const s of suits) {
        if (!best) {
          best = s;
          continue;
        }
        if (counts[s] > counts[best]) best = s;
        else if (counts[s] === counts[best]) {
          const higher = SUIT_RANK[s] > SUIT_RANK[best];
          if (tieBreak === "higher" ? higher : !higher) best = s;
        }
      }
      return best ? `${action.level}${best}` : null;
    }
    case "raisePartner": {
      // Raise partner's most recent contract bid strain to the target level.
      const partner = partnerOf(ctx.seat);
      for (let i = ctx.auction.length - 1; i >= 0; i--) {
        const c = ctx.auction[i]!;
        if (c.seat === partner && isContractBid(c.call))
          return `${action.toLevel}${c.call[1]}`;
      }
      return null;
    }
    case "newSuitAtLevel": {
      // Longest suit of at least minLength, skipping suits partner has bid;
      // equal lengths bid the cheaper suit; must be legal at that level.
      const partner = partnerOf(ctx.seat);
      const partnerSuits = new Set(
        ctx.auction
          .filter((c) => c.seat === partner && isContractBid(c.call) && c.call[1] !== "N")
          .map((c) => c.call[1] as Suit),
      );
      const counts = suitCounts(ctx.hand);
      const candidates = (Object.keys(counts) as Suit[])
        .filter((s) => counts[s] >= action.minLength && !partnerSuits.has(s))
        .sort((a, b) => counts[b] - counts[a] || SUIT_RANK[a] - SUIT_RANK[b]);
      for (const s of candidates) {
        const call = `${action.level}${s}`;
        if (legal.has(call)) return call;
      }
      return null;
    }
  }
}

const byRankAsc = (a: Card, b: Card) => a.rank - b.rank || SUIT_RANK[a.suit] - SUIT_RANK[b.suit];

function resolvePlayAction(
  action: PlayRuleAction,
  legal: Card[],
  hand: Card[],
  onLead: boolean,
): Card | null {
  switch (action.kind) {
    case "lowestFollowing":
      if (onLead) return null;
      return [...legal].sort(byRankAsc)[0] ?? null;
    case "highestFollowing":
      if (onLead) return null;
      return [...legal].sort(byRankAsc).at(-1) ?? null;
    case "lowestLegal":
      return [...legal].sort(byRankAsc)[0] ?? null;
    case "topOfLongestSuit": {
      if (!onLead) return null;
      const longest = longestSuits(hand)[0];
      if (!longest) return null;
      const inSuit = legal.filter((c) => c.suit === longest.suit);
      return [...inSuit].sort(byRankAsc).at(-1) ?? null;
    }
  }
}

// ---------------------------------------------------------------------------
// Bid interpretation
// ---------------------------------------------------------------------------

export function interpretBid(
  state: GameState,
  seat: Seat,
  opts: InterpreterOptions,
): Decision<Call> {
  const { pkg, values, policy = "first_match", rng } = opts;
  const settingsByKey = new Map(pkg.settings.map((s) => [s.key, s]));
  const legal = legalCalls(state.auction, seat);
  const hand = state.hands[seat];
  const ctx: PredicateContext = { hand, auction: state.auction, seat, values };
  const facts = { hcp: hcp(hand), shape: shape(hand) };

  const trace: RuleEval[] = [];
  const matches: Match<Call>[] = [];

  const rules = [...pkg.bidRules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    const gates = checkGates(rule.settingGates, values, settingsByKey);
    const record = (matched: boolean, reason: string) =>
      trace.push({ ruleId: rule.ruleId, matched, settingsConsulted: gates.cited, reason });

    if (!gates.passed) {
      record(false, `setting gate failed: ${gates.failedKey}`);
      continue;
    }
    if (rule.complexPrimitive) {
      record(false, `complex primitive "${rule.complexPrimitive}" has no executable binding yet`);
      continue;
    }
    const auctionMatch = matchesAuctionPattern(rule.auctionContext, state.auction, seat);
    if (!auctionMatch.ok) {
      record(false, auctionMatch.reason);
      continue;
    }
    if (!evalConstraint(rule.handConditions, ctx)) {
      record(false, "hand conditions not met");
      continue;
    }
    const resolved = resolveBidAction(rule.action, ctx, legal);
    if (resolved === null) {
      record(false, "action template did not resolve to a call");
      continue;
    }
    if (!legal.has(resolved)) {
      record(false, `resolved call ${resolved} is not legal here`);
      continue;
    }
    record(true, `matched → ${callLabel(resolved)}`);
    matches.push({
      ruleId: rule.ruleId,
      title: rule.title,
      action: resolved,
      hcpWidth: hcpRangeWidth(rule.handConditions),
      cited: gates.cited,
    });
  }

  const candidates = [...legal];
  if (!matches.length) {
    return {
      action: "P",
      candidates,
      trace,
      citedSettings: [],
      facts,
      reason: "No rule matched — safe default: Pass",
      rejected: [],
      fallback: true,
    };
  }

  const chosen = selectMatch(matches, policy, rng);
  return {
    action: chosen.action,
    candidates,
    trace,
    citedSettings: chosen.cited,
    facts,
    reason: `${chosen.title} (${chosen.ruleId})`,
    rejected: matches
      .filter((m) => m.ruleId !== chosen.ruleId)
      .map((m) => ({
        action: callLabel(m.action),
        why: `matched "${m.title}" but the ${policy} policy selected ${chosen.ruleId}`,
      })),
    fallback: false,
    matches: matches.map(({ ruleId, title, action }) => ({ ruleId, title, action })),
    matchedRuleId: chosen.ruleId,
  };
}

// ---------------------------------------------------------------------------
// Play interpretation
// ---------------------------------------------------------------------------

export function interpretPlay(
  state: GameState,
  seat: Seat,
  opts: InterpreterOptions,
): Decision<Card> {
  const { pkg, values, policy = "first_match", rng } = opts;
  const settingsByKey = new Map(pkg.settings.map((s) => [s.key, s]));
  const legal = legalPlays(state, seat);
  const hand = state.hands[seat];
  const trick = state.tricks[state.tricks.length - 1];
  const onLead = !trick || trick.plays.length === 0 || trick.plays.length === 4;
  const facts = { hcp: hcp(hand), shape: shape(hand) };

  const trace: RuleEval[] = [];
  const matches: Match<Card>[] = [];

  const rules = [...pkg.playRules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    const gates = checkGates(rule.settingGates, values, settingsByKey);
    const record = (matched: boolean, reason: string) =>
      trace.push({ ruleId: rule.ruleId, matched, settingsConsulted: gates.cited, reason });

    if (!gates.passed) {
      record(false, `setting gate failed: ${gates.failedKey}`);
      continue;
    }
    const role = onLead ? "lead" : "follow";
    if (rule.when.role !== "any" && rule.when.role !== role) {
      record(false, `position is ${role}, rule wants ${rule.when.role}`);
      continue;
    }
    const resolved = resolvePlayAction(rule.action, legal, hand, onLead);
    if (resolved === null) {
      record(false, "action template did not resolve to a card");
      continue;
    }
    if (!legal.some((c) => cardId(c) === cardId(resolved))) {
      record(false, `resolved card ${cardId(resolved)} is not legal here`);
      continue;
    }
    record(true, `matched → ${cardId(resolved)}`);
    matches.push({
      ruleId: rule.ruleId,
      title: rule.title,
      action: resolved,
      hcpWidth: null,
      cited: gates.cited,
    });
  }

  if (!matches.length) {
    const safe = [...legal].sort(byRankAsc)[0]!;
    return {
      action: safe,
      candidates: legal,
      trace,
      citedSettings: [],
      facts,
      reason: "No rule matched — safe default: lowest legal card",
      rejected: [],
      fallback: true,
    };
  }

  const chosen = selectMatch(matches, policy, rng);
  return {
    action: chosen.action,
    candidates: legal,
    trace,
    citedSettings: chosen.cited,
    facts,
    reason: `${chosen.title} (${chosen.ruleId})`,
    rejected: matches
      .filter((m) => m.ruleId !== chosen.ruleId)
      .map((m) => ({
        action: cardId(m.action),
        why: `matched "${m.title}" but the ${policy} policy selected ${chosen.ruleId}`,
      })),
    fallback: false,
    matches: matches.map(({ ruleId, title, action }) => ({ ruleId, title, action })),
    matchedRuleId: chosen.ruleId,
  };
}
