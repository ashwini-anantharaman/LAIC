// The compiled artifact (spec §3): what a KB compiles to and what sessions
// pin. Immutable once written; the KB's liveCompileId only advances on a
// structurally valid compile (last-good protection). Stage B implements the
// compiler; the artifact shape is data model.

import type { SettingValue } from "@bridge/config";
import type {
  AuctionAction,
  AuctionContext,
  FallbackBehavior,
  HandCondition,
  LeadSpec,
  PlayRuleSpec,
  SettingSpec,
  SignalSpec,
} from "./language";
import type { KnowledgeType } from "./model";

/** A SettingSpec aggregated into the KB registry, with its declaring item. */
export interface CompiledSetting extends SettingSpec {
  itemId: string;
  itemTitle: string;
}

/** Provenance carried on every compiled rule (decision → item → citations). */
export interface RuleProvenance {
  itemId: string;
  itemVersion: number;
  itemTitle: string;
}

export interface CompiledAuctionRule {
  /** `${itemId}.${specKey}` — stable across compiles while the spec keeps its key. */
  ruleId: string;
  label: string;
  context: AuctionContext;
  conditions: HandCondition;
  action: AuctionAction;
  /**
   * Global order: band (by knowledgeType: exception < convention <
   * bidding_rule/agreement < fallback) then item priority. Lower fires first.
   */
  order: number;
  /** Enable-setting keys that must resolve truthy for the rule to be live. */
  settingGates: string[];
  provenance: RuleProvenance;
}

/** A compiled forcing situation — the pass-suppression pattern. */
export interface CompiledForcingRule {
  ruleId: string;
  label: string;
  context: AuctionContext;
  order: number;
  settingGates: string[];
  provenance: RuleProvenance;
}

export interface CompiledLeadRule {
  ruleId: string;
  label: string;
  lead: LeadSpec;
  order: number;
  settingGates: string[];
  provenance: RuleProvenance;
}

export interface CompiledPlayRule {
  ruleId: string;
  label: string;
  spec: PlayRuleSpec;
  order: number;
  settingGates: string[];
  provenance: RuleProvenance;
}

export interface CompiledFallback {
  ruleId: string;
  fallback: FallbackBehavior;
  provenance: RuleProvenance;
}

/** Per-item summary for pack filtering, traces, and the workspace. */
export interface CompiledItemSummary {
  itemId: string;
  version: number;
  title: string;
  knowledgeType: KnowledgeType;
  /** Enable-setting keys this item declared. */
  enableSettingKeys: string[];
}

export interface CompiledKb {
  compileId: string;
  kbId: string;
  /** Monotonic per KB. */
  version: number;
  compiledAt: string;
  /** Hash of the item/edge/pack snapshot that produced this compile. */
  inputHash: string;
  /** Aggregated registry from items' inline SettingSpecs (UI renders these). */
  settings: CompiledSetting[];
  defaults: Record<string, SettingValue>;
  auctionRules: CompiledAuctionRule[];
  forcingRules: CompiledForcingRule[];
  leadRules: CompiledLeadRule[];
  playRules: CompiledPlayRule[];
  signalDefaults: SignalSpec;
  fallbacks: CompiledFallback[];
  /** Confirmed conflicts_with pairs (bite at the player, spec decision 13). */
  conflicts: { aItemId: string; bItemId: string }[];
  /** requires edges (player validation + dependency gating). */
  requires: { itemId: string; requiresItemId: string }[];
  items: CompiledItemSummary[];
  /** Ladder snapshot: effective item sets with extends-chains flattened. */
  packs: CompiledPack[];
}

export interface CompiledPack {
  packId: string;
  name: string;
  levelId?: string;
  /** Ladder position (0-based) — level_capped compares against this. */
  ordinal: number;
  /** Effective item set (union up the extends chain). */
  itemIds: string[];
}

export interface CompileError {
  message: string;
  /** Item the error was traced to, when attributable. */
  itemId?: string;
}
