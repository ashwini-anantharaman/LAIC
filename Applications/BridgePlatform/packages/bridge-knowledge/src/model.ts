// Knowledge base model (Bridge plan §12.4, §12.10 step 3, §12.11). The
// human-readable Bridge Knowledge Base is the SOURCE OF TRUTH: runtime rule
// packages are GENERATED from active items, and every generated artifact
// links back through items to registered sources — so a bid at the table
// resolves to a readable rule and the passage it came from.

import type { BidRuleEntry, PlayRuleEntry, BridgeRulePackage } from "@bridge/engine";
import type { Setting } from "@bridge/config";

export type SystemFamily = "SAYC" | "2_over_1" | "natural" | "custom";

// ---------------------------------------------------------------------------
// Sources (§12.4)
// ---------------------------------------------------------------------------

export interface BridgeKnowledgeSource {
  sourceId: string;
  title: string;
  sourceType:
    | "standard_doc"
    | "book"
    | "expert_notes"
    | "website"
    | "conversation"
    | "code"
    | "manual_entry";
  systemFamily?: SystemFamily;
  rightsStatus: "owned" | "licensed" | "public_reference" | "fair_use_reference" | "unknown";
  uploadedBy: string;
  uploadedAt: string;
  status: "registered" | "ingested" | "reviewed" | "deprecated";
  /** URL / ISBN / file reference / repo path. */
  locator?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Readable knowledge items (§12.10 step 3)
// ---------------------------------------------------------------------------

export type KnowledgeItemType =
  | "system"
  | "convention"
  | "bidding_rule"
  | "play_rule"
  | "defense_rule"
  | "lead_rule"
  | "carding_rule"
  | "dependency_rule"
  | "conflict_rule"
  | "visibility_rule"
  | "teaching_scope"
  | "setting_definition"
  | "example"
  | "expert_decision";

export interface Citation {
  sourceId: string;
  /** Passage reference. Prefix "paraphrase:" when not an exact quote. */
  passage: string;
}

export interface BridgeReadableKnowledgeItem {
  itemId: string;
  systemFamily: SystemFamily;
  itemType: KnowledgeItemType;
  title: string;
  /** The reviewed, human-readable statement of the rule/decision. */
  humanReadableRule: string;
  /**
   * Machine payload generation consumes, keyed by itemType:
   *  - bidding_rule: { rule: BidRuleEntry minus provenance/explanationItemId }
   *  - play_rule / lead_rule: { rule: PlayRuleEntry minus same }
   *  - setting_definition: { setting: Setting }
   *  - system: { packageId: string }
   */
  structuredFields: Record<string, unknown>;
  sourceIds: string[];
  citations: Citation[];
  /** Expert decisions / related items informing this one. */
  relatedItemIds?: string[];
  gapIds: string[];
  reviewerNotes?: string;
  /**
   * active items feed generation; deprecated items are kept for provenance
   * (sessions pinned to old package versions still resolve them) but are
   * excluded from new packages. Uncited items are badged, never blocked
   * (revised decision 3).
   */
  status: "active" | "deprecated";
  version: string;
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Gap registry (§12.6)
// ---------------------------------------------------------------------------

export interface BridgeKnowledgeGap {
  gapId: string;
  systemFamily: SystemFamily;
  area: "bidding" | "play" | "defense" | "convention_card" | "configuration" | "citation";
  description: string;
  detectedFrom: string[];
  severity: "minor" | "important" | "blocking";
  resolutionStatus: "open" | "expert_decision_needed" | "resolved" | "deferred";
  expertResolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Generation runs, artifacts, generated packages (§12.10 steps 7-8, §12.11)
// ---------------------------------------------------------------------------

export interface BridgeGeneratedArtifact {
  artifactId: string;
  artifactType:
    | "setting_registry_entry"
    | "bidding_rule"
    | "play_rule"
    | "validator_rule"
    | "convention_card_mapping"
    | "test_board_reference"
    | "ai_player_default";
  generatedFromKnowledgeItemIds: string[];
  generatedFromSourceIds: string[];
  packageId: string;
  version: string;
  status: "active" | "deprecated";
  artifactPayload: unknown;
}

export interface RuleDiffEntry {
  id: string;
  change: "added" | "removed" | "changed";
}

export interface GenerationDiff {
  previousVersion: string | null;
  bidRules: RuleDiffEntry[];
  playRules: RuleDiffEntry[];
  settings: RuleDiffEntry[];
}

export interface BridgeIngestionJob {
  jobId: string;
  sourceId: string;
  extractor: "prototype_registry" | "llm";
  systemFamily: SystemFamily;
  requestedBy: string;
  createdAt: string;
  status: "completed" | "failed";
  stats: { parsedEntries: number; candidatesCreated: number; skipped: number };
  candidateItemIds: string[];
  errors: string[];
}

export interface BridgeGenerationRun {
  runId: string;
  systemFamily: SystemFamily;
  requestedBy: string;
  createdAt: string;
  status: "completed" | "failed";
  /** Snapshot of exactly which item versions went in. */
  inputItems: Array<{ itemId: string; version: string }>;
  diff: GenerationDiff | null;
  errors: string[];
  /** §19.3 quality warnings (non-blocking): unreferenced settings, etc. */
  warnings?: string[];
  /** Set when status is completed. */
  resultPackageId?: string;
  resultVersion?: string;
}

/**
 * A generated package version. The pkg content is IMMUTABLE once written —
 * generation always bumps to a new version — so sessions pinned to a version
 * stay truthful. Artifacts may be appended (e.g. test boards) and status may
 * flip to deprecated; the rules themselves never change in place.
 */
export interface RulePackageRecord {
  packageId: string;
  version: string;
  status: "active" | "deprecated";
  createdAt: string;
  pkg: BridgeRulePackage;
  artifacts: BridgeGeneratedArtifact[];
  /** Golden-board fallback baseline measured at generation (§19.3). */
  baseline?: { boards: number; bidFallbackRate: number; playFallbackRate: number };
}

/** @deprecated legacy alias from the pre-revamp publish workflow. */
export type PublishedPackageRecord = RulePackageRecord;

// Payload helper types used by structuredFields
export type BidRulePayload = Omit<BidRuleEntry, "provenance" | "explanationItemId">;
export type PlayRulePayload = Omit<PlayRuleEntry, "provenance" | "explanationItemId">;
export type SettingPayload = Setting;
