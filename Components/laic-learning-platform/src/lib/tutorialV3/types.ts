/**
 * Tutorial V3 Approach-2 types — section-by-section authoring.
 * Isolated from V1; only used by tutorial-v3 surfaces.
 */
import type {
  AssessmentPlacement,
  AssistantMessage,
  ContentUnit,
  EmbeddableObjectType,
  RecipeItem,
  SectionConnectionRule,
  VersionPin,
} from '../types';
import type { GeneratedPart } from '../api';

export type SectionStatus = 'not_started' | 'in_progress' | 'done';
export type SectionAuthorMode = 'empty' | 'written' | 'generated' | 'mixed';

export type V3SourceKind = 'pdf' | 'text' | 'web' | 'youtube' | 'library';

/** Tutorial-level source pool entry (shared; sections sub-select). */
export interface V3SourceRef {
  id: string;
  label: string;
  kind: V3SourceKind;
  sentences: { text: string; page: number }[];
  html?: string;
  sourceUrl?: string;
  /** Content images harvested from a website source (authoring image picker). */
  images?: { src: string; alt?: string; caption?: string }[];
  /** Original file / paste / URL meta for reopen. */
  meta?: Record<string, unknown>;
}

/** Editor part = GeneratedPart plus library-embed / image / video extras used in V1 editor. */
export type TutorialV3Part = Omit<GeneratedPart, 'type'> & {
  type: GeneratedPart['type'] | 'image' | 'video' | 'library-embed' | 'bridge-embed';
  url?: string;
  caption?: string;
  videoId?: string;
  startText?: string;
  endText?: string;
  libraryTitle?: string;
  objectType?: string;
  versionPin?: { objectId: string; versionId: string };
  snapshotBlocks?: unknown[];
  sources?: unknown[];
  hints?: string[];
  hint?: string;
  /** Which Bridge component a 'bridge-embed' block mounts. */
  embedKind?: string;
  /**
   * Its configuration — what the author chose on the block's Configure
   * panel. Mapped to and from published blocks by the helpers in
   * `bridgeEmbed.ts`; add a field there rather than here alone, or the
   * save/re-open round trip will silently drop it.
   */
  embedSeed?: number;
  embedSkin?: string;
  embedHumanSeat?: 'N' | 'E' | 'S' | 'W';
  embedDealer?: 'N' | 'E' | 'S' | 'W';
  embedVul?: 'none' | 'ns' | 'ew' | 'both';
  embedHandLayout?: 'row' | 'fan';
  embedBidPad?: 'grid' | 'columns';
  embedShowAllHands?: boolean;
  embedShowCoach?: boolean;
  embedRobotDelayMs?: number;
  /**
   * challenge mode: the authored challenge, exactly as @bridge/table-embed's
   * wizard produced it. Opaque here on purpose — the package owns the shape
   * and validates it on the way back in (see bridgeEmbed.ts).
   */
  embedChallenge?: unknown;
  /**
   * bidding mode: how many of the authored opening-bid hands to ask. The hands
   * ship inside the component, so only the length travels here.
   */
  embedBiddingHands?: number;
  /** From template media slot — steers the empty Start from scratch UI. */
  mediaKind?: 'image' | 'video' | 'either';
  mediaHint?: string;
  /** Hard learner page break before this part (from Structure page grouping). */
  pageBreakBefore?: boolean;
};

/**
 * Tutorial-level recipe slot shown on Structure (library pick or generate-later).
 * Separate from per-section recipe embeds when a Section block exists.
 */
export interface V3TopLevelSlot {
  id: string;
  kind: 'library' | 'generate';
  objectType: EmbeddableObjectType | string;
  authoringNote?: string;
  required: boolean;
  recipeIndex: number;
  versionPin?: VersionPin;
  libraryTitle?: string;
  /** Generate-mode knobs from the template recipe (steers AI). */
  generateMeta?: import('../types').EmbeddedGenerateMeta;
  /** Filled after library pick or generate. */
  part?: TutorialV3Part;
  /** All authored/generated parts for this slot (preferred over singular `part`). */
  parts?: TutorialV3Part[];
  /** Authoring state for top-level generate slots (pick → markup → generate). */
  pickedSourceIds?: string[];
  highlights?: any[];
  markupFlags?: any[];
  units?: ContentUnit[];
  done: boolean;
  /**
   * Position in the tutorial's one true running order, shared by sections and
   * top-level slots. Seeded from where the block sits in the template recipe,
   * then rewritten whenever the author drags a row on Structure. Absent on
   * drafts made before ordering existed — those fall back to slots-then-sections.
   */
  order?: number;
  /**
   * Student-preview page (1-based). Same number = same learner page.
   * Set on Structure; omitted means legacy auto word-budget pagination.
   */
  learnerPage?: number;
}

export interface V3Section {
  id: string;
  title: string;
  intent?: string;
  /** Per-section recipe shape (blocks + embed slots) from the chosen template. */
  recipe: RecipeItem[];
  parts: TutorialV3Part[];
  pickedSourceIds: string[];
  highlights: any[];
  units?: ContentUnit[];
  markupFlags?: any[];
  authorMode: SectionAuthorMode;
  done: boolean;
  required: boolean;
  /**
   * Position in the tutorial's one true running order, shared by sections and
   * top-level slots. Seeded from where the block sits in the template recipe,
   * then rewritten whenever the author drags a row on Structure. Absent on
   * drafts made before ordering existed — those fall back to slots-then-sections.
   */
  order?: number;
  /**
   * Student-preview page (1-based). Same number = same learner page.
   * Set on Structure; omitted means legacy auto word-budget pagination.
   */
  learnerPage?: number;
}

export interface TutorialV3Structure {
  connection: SectionConnectionRule;
  assessment: AssessmentPlacement;
  depth: string;
  endWith: string;
  sectionsCount: number;
  checksPerSection: number;
  progression: string;
  pass?: string;
  hintsOn?: boolean;
  hintN?: number;
}

export interface TutorialV3Draft {
  id: string;
  type: 'tutorial-v3';
  title: string;
  /** Free-form start metadata (audience, level, notes, objective). */
  metadata: {
    objective?: string;
    audience?: string;
    level?: string;
    notes?: string;
    [key: string]: unknown;
  };
  templateId: string;
  structure: TutorialV3Structure;
  sections: V3Section[];
  /** Recipe embeds at tutorial level (library picks / top-level generate). */
  topLevelSlots?: V3TopLevelSlot[];
  sourcePool: V3SourceRef[];
  /** Hoot co-author chat on Review — survives reopen. */
  assistantMessages?: AssistantMessage[];
  /** Markup highlights used to ground refine / generate on Review. */
  refineHighlights?: any[];
  /**
   * Assembled reading-order parts for Review (edit + student preview).
   * When set, preferred over re-collecting from slots/sections.
   */
  assembledParts?: TutorialV3Part[];
  /**
   * True once the author reassigned block pages on Review — from then on the
   * per-part pageBreakBefore flags are authoritative and Structure-level
   * learnerPage stamping is skipped.
   */
  manualPageBreaks?: boolean;
  /** Legacy Plan definition (kept for reopen compatibility). */
  tutorialDefinition?: import('../types').TutorialDefinition;
  status: 'draft' | 'ready' | 'submitted';
  /** Top-level UI phase to restore on reopen. */
  phase?: 'path' | 'start' | 'structure' | 'sources' | 'navigator' | 'section' | 'slot' | 'review';
  /** Active section id when phase === 'section'. */
  activeSectionId?: string | null;
  /** Active top-level generate slot id when phase === 'slot'. */
  activeSlotId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type TutorialV3Phase = NonNullable<TutorialV3Draft['phase']>;
