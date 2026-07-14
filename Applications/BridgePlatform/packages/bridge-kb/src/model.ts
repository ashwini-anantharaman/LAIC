// Knowledge Rework data model (spec §1). A knowledge base (KB) is the unit of
// compilation and compatibility: items belong to KBs via memberships, packs
// ladder items into player capability sets, and every save recompiles the KB
// with last-good protection (spec decisions 1, 4, 5, 9).

import type { SettingValue } from "@bridge/config";
import type {
  AuctionRuleSpec,
  FallbackBehavior,
  LeadSpec,
  PlayRuleSpec,
  SettingSpec,
  SignalSpec,
} from "./language";

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export interface LevelDef {
  levelId: string;
  name: string;
  /** Position in the ladder, 0-based. */
  ordinal: number;
}

export interface KnowledgeBase {
  kbId: string;
  name: string;
  description?: string;
  /** Display label of the system this KB captures ("SAYC", "2/1"…). */
  systemLabel: string;
  levels: LevelDef[];
  /**
   * Last-good pointer (spec decision 5): the compile sessions resolve
   * against. Only advances on a structurally valid compile.
   */
  liveCompileId?: string;
  /** Most recent compile attempt, valid or not. */
  latestCompileId?: string;
  /** Set when the latest save failed structural validation. */
  lastCompileError?: { message: string; at: string };
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge items
// ---------------------------------------------------------------------------

export type KnowledgeType =
  | "concept"
  | "bidding_rule"
  | "convention"
  | "agreement"
  | "declarer_technique"
  | "defensive_technique"
  | "lead_agreement"
  | "signal_agreement"
  | "judgment_guideline"
  | "exception"
  | "fallback_rule";

export type KnowledgePhase =
  | "auction"
  | "opening_lead"
  | "declarer_play"
  | "defense"
  | "scoring";

/** Trust badge only — never a compile gate (spec decision 3). */
export type ItemStatus = "draft" | "reviewed" | "approved" | "deprecated";

export interface Citation {
  sourceId: string;
  passageId?: string;
  /** Short quoted anchor or paraphrase marker locating the claim. */
  anchor: string;
}

/**
 * Typed payload by knowledgeType. `concept` and `judgment_guideline` items
 * are teaching content and carry no machine payload; `scoring`-phase items
 * are always teaching content (engine scoring stays Law 77).
 */
export type ItemPayload =
  | { kind: "auction_rules"; rules: AuctionRuleSpec[] }
  | { kind: "lead_rules"; leads: LeadSpec[] }
  | { kind: "signals"; signals: SignalSpec }
  | { kind: "play_rules"; rules: PlayRuleSpec[] }
  | { kind: "fallback"; fallback: FallbackBehavior }
  | { kind: "none" };

export interface KnowledgeItem {
  itemId: string;
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeType;
  phase: KnowledgePhase;
  payload: ItemPayload;
  /** Controls this item exposes (spec §1: inline setting declarations). */
  settings: SettingSpec[];
  sourceReferences: Citation[];
  /** Advisory tags from extraction; ladder membership is authoritative. */
  supportedLevels: string[];
  status: ItemStatus;
  /** Bumps on every content edit. */
  version: number;
  /** Copy-on-diverge lineage (spec decision 2). */
  forkedFromItemId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** An item may appear in several KBs while identical (fork on divergence). */
export interface KbMembership {
  kbId: string;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Edges (spec §1): the relationship graph
// ---------------------------------------------------------------------------

export type EdgeType =
  | "requires"
  | "conflicts_with"
  | "teaches"
  | "exception_to"
  | "enabled_by";

export interface KbEdge {
  edgeId: string;
  fromItemId: string;
  edgeType: EdgeType;
  /** Exactly one target, by edge type: item, taxonomy concept, or setting key. */
  toItemId?: string;
  toConceptId?: string;
  toSettingKey?: string;
  origin: "extracted" | "fellow";
  /** Auto-true for now (owner decision 12); fellows correct after the fact. */
  confirmed: boolean;
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Packs & the ladder (spec §1)
// ---------------------------------------------------------------------------

/**
 * Dealing envelope for constrained environments (spec §5). Structural
 * pre-filters plus the closed-loop simulation gate; `derivedEnvelope` is
 * compiler-computed, `envelopeOverrides` is fellow tightening.
 */
export interface DealingEnvelope {
  /** Per-seat structural constraints applied before simulation. */
  seatConstraints?: {
    seats: "all" | "constrained";
    hcpMin?: number;
    hcpMax?: number;
    balancedOnly?: boolean;
  };
  /**
   * Closed loop: accept a deal only if simulating with the actual player
   * configs completes with zero engine-floor events (spec §5).
   */
  requireZeroFloorEvents: boolean;
  /** Human-readable summary the compiler emits alongside. */
  summary: string;
}

export interface KbPack {
  packId: string;
  kbId: string;
  name: string;
  description?: string;
  levelId?: string;
  /** Position within the ladder chain, 0-based. */
  ordinal: number;
  /** Ladder chain: effective item set = union up the extends chain. */
  extendsPackId?: string;
  itemIds: string[];
  derivedEnvelope?: DealingEnvelope;
  envelopeOverrides?: DealingEnvelope;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Players (spec §1, AIPlayerProfile v2) — consumed from Stage E, modeled now
// ---------------------------------------------------------------------------

export type DecisionPolicyId = "first_match" | "weighted_random" | "level_capped";

export type PlayerValidationStatus = "draft" | "valid" | "invalid" | "published";

export interface CapabilityResult {
  categoryId: string;
  ok: boolean;
  /** Item that satisfies the category (rule or explicit fallback). */
  satisfiedBy?: string[];
  explanation: string;
}

export interface SimulationReport {
  deals: number;
  seed: number;
  completed: number;
  engineFloorEvents: number;
  fallbackUsage: Record<string, number>;
  generatedAt: string;
}

export interface PlayerValidationReport {
  static: CapabilityResult[];
  conflicts: { aItemId: string; bItemId: string; explanation: string }[];
  missingRequires: { itemId: string; requiresItemId: string }[];
  simulation?: SimulationReport;
}

export interface KbPlayer {
  playerId: string;
  kbId: string;
  name: string;
  description?: string;
  levelId?: string;
  enabledPackIds: string[];
  settingOverrides: Record<string, SettingValue>;
  decisionPolicyId: DecisionPolicyId;
  /** Reserved: exactly one chain at launch (pack fallbacks → engine floor). */
  fallbackPolicyId: "standard";
  validationStatus: PlayerValidationStatus;
  validationReport?: PlayerValidationReport;
  ownerType: "system" | "program_org" | "coach" | "learner";
  ownerId?: string;
  programOrganizationId?: string;
  sandboxId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Sandboxes v2 (spec §6): a coach exposes packs + a setting subset. */
export interface KbSandbox {
  sandboxId: string;
  kbId: string;
  name: string;
  description?: string;
  /** Packs every sandbox player carries. */
  basePackIds: string[];
  /** Packs a learner may toggle on/off. */
  exposedPackIds: string[];
  baseOverrides: Record<string, SettingValue>;
  /** Setting keys a learner may change. */
  exposedSettingKeys: string[];
  ownerType: "system" | "program_org" | "coach";
  ownerId?: string;
  programOrganizationId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Suggestions (spec decision 22)
// ---------------------------------------------------------------------------

export interface KbSuggestion {
  suggestionId: string;
  kbId: string;
  itemId?: string;
  /** Set when flagged from the table: the session + decision it concerns. */
  sessionId?: string;
  decisionSeq?: number;
  text: string;
  status: "open" | "resolved";
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

// ---------------------------------------------------------------------------
// Sources v2 (spec §1: same proven design, new lineage)
// ---------------------------------------------------------------------------

export interface KbSource {
  sourceId: string;
  title: string;
  sourceType: "official_system_document" | "book" | "article" | "expert" | "model";
  rightsStatus: "licensed" | "public" | "owned" | "fair_use_excerpt";
  locator?: string;
  registeredBy: string;
  createdAt: string;
}

export interface KbSourceDocument {
  sourceId: string;
  fileName: string;
  mediaType: string;
  charCount: number;
  uploadedAt: string;
  text: string;
}

export interface KbSourcePassage {
  passageId: string;
  sourceId: string;
  ordinal: number;
  anchor: string;
  text: string;
}

/** Extraction job (spec §4): one-shot structured, chunked per section. */
export interface KbExtractionJob {
  jobId: string;
  kbId: string;
  sourceId: string;
  status: "pending" | "running" | "completed" | "failed";
  /** Passage ordinals covered by this job's section. */
  passageOrdinals: number[];
  createdItemIds: string[];
  /** Sections extraction couldn't structure — visible, hand-authorable. */
  failures: { anchor: string; reason: string }[];
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// The registered model source (fallbacks, prototype judgments): Claude is
// NAMED as the source when no external source exists (owner sourcing policy).
// ---------------------------------------------------------------------------

export const CLAUDE_SOURCE: KbSource = {
  sourceId: "src_claude",
  title: "Claude (Anthropic) — platform-authored judgments",
  sourceType: "model",
  rightsStatus: "owned",
  registeredBy: "system",
  createdAt: "2026-07-14T00:00:00.000Z",
};
