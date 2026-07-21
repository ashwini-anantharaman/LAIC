// The KB compiler (Knowledge Rework §3): active items + confirmed edges +
// packs → an immutable CompiledKb. Structural validation is the last-good
// gate — a KB whose latest save doesn't compile keeps serving its previous
// compile. Conflicts are RECORDED here and bite at the player (decision 13).

import type { SettingValue } from "@bridge/config";
import type {
  CompiledAuctionRule,
  CompiledForcingRule,
  CompiledFallback,
  CompiledItemSummary,
  CompiledKb,
  CompiledLeadRule,
  CompiledPack,
  CompiledPlayRule,
  CompiledSetting,
  CompileError,
} from "./compiled";
import { hashValue } from "./ids";
import type { HandCondition, NumParam, SignalSpec } from "./language";
import type { KbEdge, KbPack, KnowledgeItem, KnowledgeType } from "./model";

/**
 * Priority bands by knowledgeType (lower fires first): exceptions override
 * conventions, conventions override plain rules/agreements, fallbacks last.
 */
const BAND: Partial<Record<KnowledgeType, number>> = {
  exception: 0,
  convention: 1,
  bidding_rule: 2,
  agreement: 2,
  declarer_technique: 2,
  defensive_technique: 2,
  lead_agreement: 2,
  signal_agreement: 2,
  fallback_rule: 9,
};

const order = (type: KnowledgeType, priority: number) => (BAND[type] ?? 2) * 100_000 + priority;

/** Collect every $setting key referenced inside a condition tree. */
function settingRefs(cond: HandCondition, into: Set<string>): void {
  if ("all" in cond) return cond.all.forEach((c) => settingRefs(c, into));
  if ("any" in cond) return cond.any.forEach((c) => settingRefs(c, into));
  if ("not" in cond) return settingRefs(cond.not, into);
  for (const value of Object.values(cond)) {
    if (value && typeof value === "object") {
      for (const p of Object.values(value as Record<string, unknown>)) {
        const param = p as NumParam;
        if (param && typeof param === "object" && "$setting" in param)
          into.add(param.$setting);
      }
    }
  }
}

export interface CompileInput {
  kbId: string;
  version: number;
  compiledAt: string;
  items: KnowledgeItem[];
  edges: KbEdge[];
  packs: KbPack[];
}

export interface CompileResult {
  compiled?: CompiledKb;
  errors: CompileError[];
}

export function compileKb(input: CompileInput): CompileResult {
  const errors: CompileError[] = [];
  const active = input.items.filter((i) => i.status !== "deprecated");
  const itemById = new Map(active.map((i) => [i.itemId, i]));

  // ---- settings registry (inline declarations, duplicate keys are errors) --
  const settings: CompiledSetting[] = [];
  const settingKeys = new Set<string>();
  const defaults: Record<string, SettingValue> = {};
  for (const item of active) {
    for (const spec of item.settings) {
      if (settingKeys.has(spec.key)) {
        errors.push({
          itemId: item.itemId,
          message: `duplicate setting key "${spec.key}" (settings are KB-global)`,
        });
        continue;
      }
      settingKeys.add(spec.key);
      settings.push({ ...spec, itemId: item.itemId, itemTitle: item.title });
      defaults[spec.key] = spec.default;
    }
  }

  // ---- rules -----------------------------------------------------------------
  const auctionRules: CompiledAuctionRule[] = [];
  const forcingRules: CompiledForcingRule[] = [];
  const leadRules: CompiledLeadRule[] = [];
  const playRules: CompiledPlayRule[] = [];
  const fallbacks: CompiledFallback[] = [];
  let signalDefaults: SignalSpec = { attitude: "standard", count: "standard", firstDiscard: "attitude" };

  for (const item of active) {
    const provenance = { itemId: item.itemId, itemVersion: item.version, itemTitle: item.title };
    const gates = item.settings.filter((s) => s.role === "enable").map((s) => s.key);
    const payload = item.payload;

    switch (payload.kind) {
      case "auction_rules": {
        const keys = new Set<string>();
        for (const spec of payload.rules) {
          if (keys.has(spec.key)) {
            errors.push({ itemId: item.itemId, message: `duplicate rule key "${spec.key}"` });
            continue;
          }
          keys.add(spec.key);
          const refs = new Set<string>();
          settingRefs(spec.conditions, refs);
          for (const ref of refs) {
            if (!settingKeys.has(ref))
              errors.push({
                itemId: item.itemId,
                message: `rule "${spec.key}" references unknown setting "${ref}"`,
              });
          }
          auctionRules.push({
            ruleId: `${item.itemId}.${spec.key}`,
            label: spec.label,
            context: spec.context,
            conditions: spec.conditions,
            action: spec.action,
            order: order(item.knowledgeType, spec.priority),
            settingGates: gates,
            provenance,
          });
        }
        break;
      }
      case "forcing_rules": {
        const fkeys = new Set<string>();
        for (const spec of payload.rules) {
          if (fkeys.has(spec.key)) {
            errors.push({ itemId: item.itemId, message: `duplicate forcing key "${spec.key}"` });
            continue;
          }
          fkeys.add(spec.key);
          forcingRules.push({
            ruleId: `${item.itemId}.${spec.key}`,
            label: spec.label,
            context: spec.context,
            order: order(item.knowledgeType, spec.priority),
            settingGates: gates,
            provenance,
          });
        }
        break;
      }
      case "lead_rules": {
        payload.leads.forEach((lead, i) => {
          leadRules.push({
            ruleId: `${item.itemId}.lead${i}`,
            label: item.title,
            lead,
            order: order(item.knowledgeType, i),
            settingGates: gates,
            provenance,
          });
        });
        break;
      }
      case "play_rules": {
        payload.rules.forEach((spec, i) => {
          playRules.push({
            ruleId: `${item.itemId}.play${i}`,
            label: item.title,
            spec,
            order: order(item.knowledgeType, spec.priority),
            settingGates: gates,
            provenance,
          });
        });
        break;
      }
      case "signals":
        signalDefaults = { ...signalDefaults, ...payload.signals };
        break;
      case "fallback":
        fallbacks.push({
          ruleId: `${item.itemId}.fallback`,
          fallback: payload.fallback,
          provenance,
        });
        break;
      case "none":
        break;
    }
  }

  auctionRules.sort((a, b) => a.order - b.order);
  forcingRules.sort((a, b) => a.order - b.order);
  leadRules.sort((a, b) => a.order - b.order);
  playRules.sort((a, b) => a.order - b.order);

  // ---- edges (confirmed only drive behavior) ---------------------------------
  const conflicts: { aItemId: string; bItemId: string }[] = [];
  const requires: { itemId: string; requiresItemId: string }[] = [];
  for (const edge of input.edges) {
    if (!edge.confirmed) continue;
    if (!itemById.has(edge.fromItemId)) continue; // edge to a non-member: inert
    if (edge.edgeType === "conflicts_with" && edge.toItemId && itemById.has(edge.toItemId)) {
      conflicts.push({ aItemId: edge.fromItemId, bItemId: edge.toItemId });
    }
    if (edge.edgeType === "requires" && edge.toItemId) {
      if (!itemById.has(edge.toItemId))
        errors.push({
          itemId: edge.fromItemId,
          message: `requires "${edge.toItemId}", which is not in this KB`,
        });
      else requires.push({ itemId: edge.fromItemId, requiresItemId: edge.toItemId });
    }
  }

  // ---- packs: flatten extends chains (cycles are errors) ----------------------
  const packById = new Map(input.packs.map((p) => [p.packId, p]));
  const packs: CompiledPack[] = [];
  for (const pack of input.packs) {
    const seen = new Set<string>();
    const items = new Set<string>();
    let cursor: KbPack | undefined = pack;
    let ok = true;
    while (cursor) {
      if (seen.has(cursor.packId)) {
        errors.push({ message: `pack "${pack.packId}" has a cyclic extends chain` });
        ok = false;
        break;
      }
      seen.add(cursor.packId);
      for (const id of cursor.itemIds) {
        if (!itemById.has(id)) {
          errors.push({
            message: `pack "${cursor.packId}" lists "${id}", which is not an active item in this KB`,
          });
        } else {
          items.add(id);
        }
      }
      cursor = cursor.extendsPackId ? packById.get(cursor.extendsPackId) : undefined;
    }
    if (ok)
      packs.push({
        packId: pack.packId,
        name: pack.name,
        levelId: pack.levelId,
        ordinal: pack.ordinal,
        itemIds: [...items],
      });
  }

  if (errors.length) return { errors };

  const items: CompiledItemSummary[] = active.map((i) => ({
    itemId: i.itemId,
    version: i.version,
    title: i.title,
    knowledgeType: i.knowledgeType,
    enableSettingKeys: i.settings.filter((s) => s.role === "enable").map((s) => s.key),
  }));

  const inputHash = hashValue({
    items: active.map((i) => [i.itemId, i.version]),
    edges: input.edges.map((e) => e.edgeId).sort(),
    packs: input.packs.map((p) => [p.packId, p.itemIds, p.extendsPackId ?? null, p.ordinal]),
  });

  return {
    errors: [],
    compiled: {
      compileId: `cmp_${input.kbId}_${input.version}_${inputHash}`,
      kbId: input.kbId,
      version: input.version,
      compiledAt: input.compiledAt,
      inputHash,
      settings,
      defaults,
      auctionRules,
      forcingRules,
      leadRules,
      playRules,
      signalDefaults,
      fallbacks,
      conflicts,
      requires,
      items,
      packs,
    },
  };
}
