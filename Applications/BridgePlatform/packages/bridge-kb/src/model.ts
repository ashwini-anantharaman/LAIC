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
  /**
   * Hidden everywhere (KB list, players, tables, arena) but never deleted —
   * data, releases, and existing sessions stay intact. Reversible from the
   * KB list's "Hidden knowledge bases" section.
   */
  archived?: boolean;
  /**
   * Set on a KB born as a source-augmentation DRAFT: a full copy of
   * `baseKbId` that a source is being merged into, reviewed on the
   * augmentation board (modified / new / conflicts), then kept or discarded.
   * The base KB is never touched by the augmentation.
   */
  augmentation?: KbAugmentation;
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
  /**
   * Highest published KB version number (contiguous 1,2,3…). Undefined until
   * the first publish. The draft (working head) is always ahead of this.
   */
  latestVersionNumber?: number;
  /**
   * The published version currently designated "main" — the one consumers
   * resolve against. Defaults to each newly published version, but can be
   * pointed back at an earlier release (rollback) or forward again without
   * re-publishing. Undefined until the first publish.
   */
  activeVersionId?: string;
  /**
   * Derivation lineage (master → limited). Set on a KB created by deriving
   * from a master; the parent link is what makes the hierarchy a tree.
   */
  derivedFromKbId?: string;
  /** The master KB version this KB branched from (upgrade-offer baseline). */
  derivedFromVersionId?: string;
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
  /** Head revision — bumps on every content edit (provenance/trace lineage). */
  version: number;
  /**
   * Highest committed version number (1,2,3…), or undefined when never
   * committed. Committed versions are immutable snapshots (KnowledgeItemVersion).
   */
  committedVersion?: number;
  /**
   * The committed version currently designated MAIN — the one the head
   * reflects and the workspace serves. Defaults to each newly committed
   * version, but can be pointed back at an earlier one ("make main") without
   * minting a new version. The head is "dirty" whenever its content diverges
   * from the snapshot at this number — see itemIsDirty(). Undefined until the
   * first commit.
   */
  mainVersion?: number;
  /** Copy-on-diverge lineage (spec decision 2). */
  forkedFromItemId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An immutable, retained snapshot of a knowledge item at one committed version.
 * This is the "version 1, version 2… of a knowledge item" the owner asked for:
 * frozen content that never changes, viewable and restorable, and the building
 * block a published KB version pins. Distinct from a FORK (new itemId, cross-KB
 * divergence) — a version is the same item evolving over time.
 */
export interface KnowledgeItemVersion {
  itemId: string;
  /** Contiguous committed number (1,2,3…). */
  versionNumber: number;
  /** The head `version` (revision) this snapshot froze — for trace lineage. */
  headVersion: number;
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeType;
  phase: KnowledgePhase;
  payload: ItemPayload;
  settings: SettingSpec[];
  sourceReferences: Citation[];
  supportedLevels: string[];
  status: ItemStatus;
  /** Content hash — cheap dirty-detection against the head. */
  contentHash: string;
  changeNote?: string;
  committedBy: string;
  committedAt: string;
}

/** An item may appear in several KBs while identical (fork on divergence). */
export interface KbMembership {
  kbId: string;
  itemId: string;
}

// ---------------------------------------------------------------------------
// KB versions (releases): the manifest layer over compiles
// ---------------------------------------------------------------------------

/** One member's pinned committed version inside a KB release manifest. */
export interface KbVersionItemRef {
  itemId: string;
  versionNumber: number;
}

/**
 * A published, immutable KB release. This is the "version 1, version 2… of the
 * knowledge base" — a named snapshot that PINS a specific committed version of
 * every member item (a lockfile), alongside the compiled artifact that serves
 * it. "KB v1 ≠ every item v1": the manifest mixes item versions freely.
 * Consumers (players, coaches, sessions) bind to a KB version, not to the
 * moving draft.
 */
export interface KbVersion {
  versionId: string;
  kbId: string;
  /** Contiguous release number (1,2,3…). */
  versionNumber: number;
  /** Optional human label ("SAYC core", "adds Jacoby"…). */
  label?: string;
  notes?: string;
  /** The compiled artifact this release serves (immutable, pinned). */
  compileId: string;
  /** Frozen manifest of member items at their committed versions. */
  items: KbVersionItemRef[];
  publishedBy: string;
  publishedAt: string;
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
  /** Legacy ladder position — retired from the UI; kept for back-compat. */
  ordinal: number;
  /** Optional "Includes": effective item set = union up this chain. */
  extendsPackId?: string;
  itemIds: string[];
  /**
   * Fellow declaration: only when true does the UI run/show the 17-category
   * completeness checklist for this set. Unchecked sets are "building" —
   * no completeness nagging.
   */
  intendedComplete?: boolean;
  derivedEnvelope?: DealingEnvelope;
  envelopeOverrides?: DealingEnvelope;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An immutable auto-snapshot of a knowledge set (pack) at one save. Unlike
 * item versions (explicit commit), EVERY set save writes one — deduped when
 * identical to the latest. Restore overlays a snapshot's content onto the
 * head and saves, which mints the next snapshot (history is append-only).
 * Deliberately excludes `ordinal`/`levelId` (retired) and `derivedEnvelope`
 * (compiler-recomputed after every good compile — it would mint noise).
 */
export interface KbPackVersion {
  packId: string;
  kbId: string;
  /** Contiguous number (1,2,3…). */
  versionNumber: number;
  name: string;
  description?: string;
  extendsPackId?: string;
  /** Canonical (sorted) — picker order must never dirty a snapshot. */
  itemIds: string[];
  intendedComplete?: boolean;
  envelopeOverrides?: DealingEnvelope;
  /** Content hash — cheap dedupe against the previous snapshot. */
  contentHash: string;
  savedBy: string;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Players (spec §1, AIPlayerProfile v2) — consumed from Stage E, modeled now
// ---------------------------------------------------------------------------

export type DecisionPolicyId = "first_match" | "weighted_random" | "level_capped";

/**
 * How a consumer tracks its KB (spec: two-level versioning propagation).
 *  - pinned: frozen to one published KB version until explicitly upgraded
 *            (the safe default — a KB edit never silently changes a deployed
 *            player/coach mid-stream).
 *  - track_latest: auto-adopts each newly published version.
 *  - draft: resolves against the moving working head (authoring/test only).
 */
export type KbVersionBinding =
  | { kind: "pinned"; versionId: string }
  | { kind: "track_latest" }
  | { kind: "draft" };

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
  /**
   * KB version this player resolves against. Defaults to pinned-to-latest at
   * save time (or draft when the KB has no published version yet). Optional so
   * pre-versioning players keep working (treated as draft/live).
   */
  kbVersionBinding?: KbVersionBinding;
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

/**
 * Board context frozen AT FLAG TIME. Deliberately denormalized (plain
 * strings, render-ready): the session it came from may be undone past this
 * decision, re-pinned, or continued — the flag must keep showing the exact
 * position the fellow saw.
 */
export interface SuggestionBoard {
  name: string;
  dealer: string;
  vul: string;
  /** seat -> "♠KQ4 ♥A87 ♦T92 ♣QJ53" (the initial deal). */
  hands: Record<string, string>;
  /** Auction up to (not including) the flagged decision. */
  calls: { seat: string; label: string }[];
  /** Cards played up to (not including) the flagged decision. */
  plays: { seat: string; label: string }[];
  flagged: { seat: string; label: string; reason: string };
}

export interface KbSuggestion {
  suggestionId: string;
  kbId: string;
  itemId?: string;
  /** Set when flagged from the table: the session + decision it concerns. */
  sessionId?: string;
  decisionSeq?: number;
  /** Frozen position at flag time (see SuggestionBoard). */
  board?: SuggestionBoard;
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
  /**
   * The KB this source was registered from. The registry itself stays global
   * (one rights record per document), but a source only SURFACES in its own
   * KB. Absent on platform-global sources (src_claude) and on legacy rows —
   * those surface wherever a KB's items or extraction runs reference them.
   */
  kbId?: string;
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

/** A source-augmentation draft's review state (lives on the draft KB). */
export interface KbAugmentation {
  baseKbId: string;
  baseKbName: string;
  sourceId: string;
  status: "review" | "kept";
  /** Items the augmentation created (draft KB ids). */
  newItemIds: string[];
  /** Items the augmentation modified, with the extractor's stated reason. */
  modified: { itemId: string; reason: string }[];
  startedAt: string;
  finishedAt?: string;
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
  /** Existing items an AUGMENTATION job modified (absent on plain extraction). */
  modifiedItemIds?: string[];
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
