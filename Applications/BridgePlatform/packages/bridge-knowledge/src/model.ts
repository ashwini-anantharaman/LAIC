// Knowledge base model (Bridge plan §12.4, §12.10 step 3, §12.11). The
// human-readable Bridge Knowledge Base is the SOURCE OF TRUTH: runtime rule
// packages are GENERATED from active items, and every generated artifact
// links back through items to registered sources — so a bid at the table
// resolves to a readable rule and the passage it came from.

import type { BidRuleEntry, ConfigPresetEntry, PlayRuleEntry, BridgeRulePackage } from "@bridge/engine";
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
  | "configuration_preset"
  | "example"
  | "expert_decision";

export interface Citation {
  sourceId: string;
  /**
   * Passage reference — prefer a page/section anchor into the source's
   * locator (e.g. 'SAYC booklet p.3: "…"'); prefix "paraphrase:" when the
   * text is neither quoted nor anchored.
   */
  passage: string;
  /** Anchor into an uploaded source document (SourcePassage.passageId). */
  passageId?: string;
}

// ---------------------------------------------------------------------------
// Uploaded source documents & passages (§12.4: locators resolve to real text)
// ---------------------------------------------------------------------------

export interface SourceDocument {
  sourceId: string;
  fileName: string;
  mediaType: string;
  charCount: number;
  uploadedAt: string;
  /** Full extracted text (PDF/markdown/plain text). */
  text: string;
}

/**
 * Deterministic chunk of a source document. Citations reference passages by
 * id so "where is this rule from?" resolves to the actual book text.
 */
export interface SourcePassage {
  passageId: string; // `${sourceId}#p${ordinal}`
  sourceId: string;
  ordinal: number;
  /** Human label, e.g. "¶12 (chars 8014–9382)". */
  anchor: string;
  text: string;
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
  /**
   * §13.5 skill / concept taxonomy tags (@bridge/taxonomy ids). Generation
   * copies them onto the produced rule entries so evaluator/progress derive
   * skills from the pinned package. Unknown ids are generation warnings.
   */
  relatedSkillIds?: string[];
  relatedConceptIds?: string[];
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
  /** §11.3 preset content changes (absent on pre-Phase-15 runs). */
  presets?: RuleDiffEntry[];
}

/**
 * §12.5: what an ingestion run is FOR — which outputs the coach wants and
 * which content areas to extract. Stamped on the job for review context and
 * fed to the LLM extractor to focus its pass. Human review is definitionally
 * required (extracted items are editable candidates, never truth).
 */
export interface BridgeIngestionIntent {
  intentId: string;
  sourceId: string;
  systemFamily: "SAYC" | "2_over_1" | "natural" | "custom";
  targetOutputs: Array<
    | "configuration_package"
    | "bidding_rule_package"
    | "play_rule_package"
    | "convention_card_package"
    | "validator_package"
    | "test_board_package"
  >;
  extractionGoals: Array<
    | "opening_bids"
    | "responses"
    | "rebids"
    | "competitive_bidding"
    | "slam_conventions"
    | "lead_rules"
    | "carding_rules"
    | "convention_dependencies"
    | "conflicts"
    | "examples"
    | "exceptions"
    | "ambiguities"
  >;
  humanReviewRequired: true;
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
  /** §12.5 intent this run was executing, when one was declared. */
  intent?: BridgeIngestionIntent;
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
  /**
   * §19.3 test-hand linkage, computed from the golden-board harness at
   * generation: rules no board exercises, and — for every rule added or
   * changed in this run — the boards that DO exercise it (the "affected
   * tests" a reviewer should re-check on the diff).
   */
  testCoverage?: {
    untestedRuleIds: string[];
    affectedTests: Array<{ ruleId: string; boards: string[] }>;
  };
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

// Payload helper types used by structuredFields. Skill/concept tags are NOT
// part of the payload: they live on the item (relatedSkillIds) and generation
// stamps them onto the rule entry — one authoring place, no drift.
export type BidRulePayload = Omit<
  BidRuleEntry,
  "provenance" | "explanationItemId" | "relatedSkillIds" | "relatedConceptIds"
>;
export type PlayRulePayload = Omit<
  PlayRuleEntry,
  "provenance" | "explanationItemId" | "relatedSkillIds" | "relatedConceptIds"
>;
export type SettingPayload = Setting;
/** structuredFields.preset for configuration_preset items (§11.3). */
export type PresetPayload = ConfigPresetEntry;
