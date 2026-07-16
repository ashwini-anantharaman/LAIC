// The KB decider (Knowledge Rework §2): interprets a CompiledKb for one
// player configuration. Deterministic, fully traced — every decision is a
// rule, a fallback ITEM, or the engine floor, and says which (attribution
// honesty). The engine floor acts only when content provides nothing legal,
// and never counts as an agreement.

import type {
  Call,
  Card,
  CitedSetting,
  RuleEval,
  Seat,
} from "@bridge/events";
import type { SettingValue } from "@bridge/config";
import { callLabel, rankLabel } from "@bridge/events";
import type {
  CompiledAuctionRule,
  CompiledKb,
  CompiledLeadRule,
  CompiledPlayRule,
  DecisionPolicyId,
} from "@bridge/kb";
import { legalPlays } from "../apply";
import { hcp, shape } from "../hand";
import type { GameState } from "../state";
import { sideOf } from "../state";
import type { AsyncDecider } from "../game";
import type { Decision, MatchedRule } from "../decision";
import { analyzeSeat, matchContext, type SeatAuctionFacts } from "./auctionContext";
import { evalCondition, type ConditionEnv } from "./handConditions";
import { realizeAuctionAction, realizeLead, realizePlayBehavior } from "./actions";
import { mulberry32, seedFrom } from "./rng";

export interface KbPlayerConfig {
  /** Packs the player carries; effective items = union of their item sets. */
  enabledPackIds: string[];
  settingOverrides: Record<string, SettingValue>;
  decisionPolicyId: DecisionPolicyId;
  /** Ladder ordinal for level_capped (rules from higher packs are ignored). */
  levelOrdinal?: number;
}

export interface KbDeciderOptions {
  compiled: CompiledKb;
  player: KbPlayerConfig;
  /** Session-stable seed (weighted_random stays replayable). */
  seed?: string;
}

interface EffectiveSurface {
  values: Record<string, SettingValue>;
  auctionRules: CompiledAuctionRule[];
  leadRules: CompiledLeadRule[];
  playRules: CompiledPlayRule[];
  auctionFallbacks: CompiledKb["fallbacks"];
  /** itemId → lowest ladder ordinal of a carrying pack. */
  itemTier: Map<string, number>;
}

/** Resolve the player's effective decision surface once, up front. */
export function effectiveSurface(options: KbDeciderOptions): EffectiveSurface {
  const { compiled, player } = options;

  const enabled = new Set(
    player.enabledPackIds.length
      ? player.enabledPackIds
      : compiled.packs.map((p) => p.packId),
  );
  const allowed = new Set<string>();
  const itemTier = new Map<string, number>();
  for (const pack of compiled.packs) {
    if (!enabled.has(pack.packId)) continue;
    for (const itemId of pack.itemIds) {
      allowed.add(itemId);
      const tier = itemTier.get(itemId);
      if (tier === undefined || pack.ordinal < tier) itemTier.set(itemId, pack.ordinal);
    }
  }
  // A KB with no packs yet: every compiled item is in play.
  if (compiled.packs.length === 0) {
    for (const item of compiled.items) allowed.add(item.itemId);
  }

  const values: Record<string, SettingValue> = {
    ...compiled.defaults,
    ...player.settingOverrides,
  };

  const gatesOpen = (gates: string[]) => gates.every((key) => Boolean(values[key]));
  const live = <T extends { provenance: { itemId: string }; settingGates: string[] }>(
    rules: T[],
  ) => rules.filter((r) => allowed.has(r.provenance.itemId) && gatesOpen(r.settingGates));

  const tierCap = player.levelOrdinal;
  const capped = <T extends { provenance: { itemId: string } }>(rules: T[]) =>
    player.decisionPolicyId === "level_capped" && tierCap !== undefined
      ? rules.filter((r) => (itemTier.get(r.provenance.itemId) ?? 0) <= tierCap)
      : rules;

  return {
    values,
    auctionRules: capped(live(compiled.auctionRules)),
    leadRules: capped(live(compiled.leadRules)),
    playRules: capped(live(compiled.playRules)),
    auctionFallbacks: compiled.fallbacks.filter((f) => allowed.has(f.provenance.itemId)),
    itemTier,
  };
}

const cited = (
  compiled: CompiledKb,
  consulted: Set<string>,
  values: Record<string, SettingValue>,
): CitedSetting[] =>
  compiled.settings
    .filter((s) => consulted.has(s.key))
    .map((s) => ({
      key: s.key,
      label: s.label,
      value: values[s.key] as SettingValue,
      binds_to: s.role === "enable" ? "convention_rules" : "numeric_parameter",
      module: s.itemTitle,
      matched: true,
    }));

export function createKbDecider(options: KbDeciderOptions): AsyncDecider {
  const { compiled } = options;
  const surface = effectiveSurface(options);
  const random = mulberry32(seedFrom(options.seed ?? compiled.compileId));

  const pick = <A, R extends { order: number }>(
    matches: { rule: R; ruleId: string; label: string; action: A }[],
  ): { rule: R; ruleId: string; label: string; action: A } => {
    const first = matches[0]!;
    if (options.player.decisionPolicyId !== "weighted_random" || matches.length === 1)
      return first;
    const pool = matches.filter((m) => m.rule.order === first.rule.order);
    return pool[Math.floor(random() * pool.length)]!;
  };

  return {
    async decideBid(state: GameState, seat: Seat): Promise<Decision<Call>> {
      const facts = analyzeSeat(state.auction, seat);
      const hand = state.hands[seat];
      const consulted = new Set<string>();
      const env: ConditionEnv = { values: surface.values, facts, consulted };
      const trace: RuleEval[] = [];
      const matches: {
        rule: CompiledAuctionRule;
        ruleId: string;
        label: string;
        action: Call;
      }[] = [];

      for (const rule of surface.auctionRules) {
        if (!matchContext(rule.context, facts)) continue; // silent: wrong context
        const before = new Set(consulted);
        const condOk = evalCondition(rule.conditions, hand, env);
        const newKeys = new Set([...consulted].filter((k) => !before.has(k)));
        if (!condOk) {
          trace.push({
            ruleId: rule.ruleId,
            matched: false,
            settingsConsulted: cited(compiled, newKeys, surface.values),
            reason: "hand conditions not met",
          });
          continue;
        }
        const call = realizeAuctionAction(rule.action, state, seat, facts);
        if (call === null) {
          trace.push({
            ruleId: rule.ruleId,
            matched: false,
            settingsConsulted: cited(compiled, newKeys, surface.values),
            reason: "action not legal here",
          });
          continue;
        }
        trace.push({
          ruleId: rule.ruleId,
          matched: true,
          settingsConsulted: cited(compiled, newKeys, surface.values),
          reason: `matched — would ${callLabel(call)}`,
        });
        matches.push({ rule, ruleId: rule.ruleId, label: rule.label, action: call });
      }

      const facts_ = { hcp: hcp(hand), shape: shape(hand) };
      const matchList: MatchedRule<Call>[] = matches.map((m) => ({
        ruleId: m.ruleId,
        title: m.label,
        action: m.action,
      }));

      if (matches.length) {
        const chosen = pick(matches);
        return {
          action: chosen.action,
          candidates: matches.map((m) => m.action),
          trace,
          citedSettings: cited(compiled, consulted, surface.values),
          facts: facts_,
          reason: chosen.label,
          rejected: [],
          fallback: false,
          matches: matchList,
          matchedRuleId: chosen.ruleId,
        };
      }

      // No agreement matched: the pack's auction fallback item, else floor.
      const fb = surface.auctionFallbacks.find((f) => f.fallback.phase === "auction");
      return {
        action: "P",
        candidates: ["P"],
        trace,
        citedSettings: cited(compiled, consulted, surface.values),
        facts: facts_,
        reason: fb
          ? `no agreement applied — fallback: pass`
          : "ENGINE FLOOR: no knowledge covered this decision — pass",
        rejected: [],
        fallback: true,
        matchedRuleId: fb?.ruleId,
      };
    },

    async decidePlay(state: GameState, seat: Seat): Promise<Decision<Card>> {
      const hand = state.hands[seat];
      const consulted = new Set<string>();
      const facts = analyzeSeat(state.auction, seat);
      const env: ConditionEnv = { values: surface.values, facts, consulted };
      const trace: RuleEval[] = [];
      const legal = legalPlays(state, seat);
      const declarerSide =
        state.contract !== null && sideOf(seat) === sideOf(state.contract.declarer);

      // Opening lead: play phase, no card played yet anywhere.
      const isOpeningLead =
        state.tricks.length === 0 ||
        (state.tricks.length === 1 && state.tricks[0]!.plays.length === 0);

      if (isOpeningLead && !declarerSide) {
        const versus = state.contract?.strain === "N" ? "notrump" : "suit";
        for (const rule of surface.leadRules) {
          if (rule.lead.versus !== "any" && rule.lead.versus !== versus) continue;
          const card = realizeLead(rule.lead.style, hand);
          if (card) {
            trace.push({ ruleId: rule.ruleId, matched: true, settingsConsulted: [], reason: rule.label });
            return {
              action: card,
              candidates: [card],
              trace,
              citedSettings: cited(compiled, consulted, surface.values),
              facts: { hcp: hcp(hand) },
              reason: rule.label,
              rejected: [],
              fallback: false,
              matchedRuleId: rule.ruleId,
            };
          }
          trace.push({ ruleId: rule.ruleId, matched: false, settingsConsulted: [], reason: "no card fits the style" });
        }
      }

      const trick = state.tricks[state.tricks.length - 1];
      const inTrick = trick && trick.plays.length > 0 && trick.plays.length < 4;
      const position = !inTrick
        ? "lead"
        : (["second", "third", "fourth"] as const)[trick.plays.length - 1]!;

      const matches: { rule: CompiledPlayRule; ruleId: string; label: string; action: Card }[] = [];
      for (const rule of surface.playRules) {
        const spec = rule.spec;
        if (spec.position !== "any" && spec.position !== position) continue;
        if (spec.side && spec.side !== "any") {
          if (spec.side === "declarer" && !declarerSide) continue;
          if (spec.side === "defense" && declarerSide) continue;
        }
        if (spec.conditions && !evalCondition(spec.conditions, hand, env)) {
          trace.push({ ruleId: rule.ruleId, matched: false, settingsConsulted: [], reason: "conditions not met" });
          continue;
        }
        const card = realizePlayBehavior(spec.behavior, state, seat);
        if (card === null) {
          trace.push({ ruleId: rule.ruleId, matched: false, settingsConsulted: [], reason: "behavior not applicable" });
          continue;
        }
        trace.push({
          ruleId: rule.ruleId,
          matched: true,
          settingsConsulted: [],
          reason: `matched — would play ${rankLabel(card.rank)}${card.suit}`,
        });
        matches.push({ rule, ruleId: rule.ruleId, label: rule.label, action: card });
      }

      if (matches.length) {
        const chosen = pick(matches);
        return {
          action: chosen.action,
          candidates: matches.map((m) => m.action),
          trace,
          citedSettings: cited(compiled, consulted, surface.values),
          facts: { hcp: hcp(hand) },
          reason: chosen.label,
          rejected: [],
          fallback: false,
          matches: matches.map((m) => ({ ruleId: m.ruleId, title: m.label, action: m.action })),
          matchedRuleId: chosen.ruleId,
        };
      }

      // Fallback item (lowest legal), else engine floor — same card, honest label.
      const fb = surface.auctionFallbacks.find(
        (f) => f.fallback.phase === (isOpeningLead && !declarerSide ? "opening_lead" : "card_play"),
      );
      const floor = [...legal].sort((a, b) => a.rank - b.rank)[0]!;
      const fbCard = fb
        ? fb.fallback.phase === "opening_lead"
          ? realizeLead(fb.fallback.behavior, hand) ?? floor
          : realizePlayBehavior("lowest_legal", state, seat) ?? floor
        : floor;
      return {
        action: fbCard,
        candidates: [fbCard],
        trace,
        citedSettings: cited(compiled, consulted, surface.values),
        facts: { hcp: hcp(hand) },
        reason: fb
          ? "no technique applied — fallback: lowest legal card"
          : "ENGINE FLOOR: no knowledge covered this play — lowest legal card",
        rejected: [],
        fallback: true,
        matchedRuleId: fb?.ruleId,
      };
    },
  };
}
