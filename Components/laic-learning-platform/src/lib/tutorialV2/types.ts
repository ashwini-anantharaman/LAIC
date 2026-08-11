/**
 * Tutorial V2 Approach-2 types — section-by-section authoring.
 * Isolated from V1; only used by tutorial-v2 surfaces.
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

export type V2SourceKind = 'pdf' | 'text' | 'web' | 'youtube' | 'library';

/** Tutorial-level source pool entry (shared; sections sub-select). */
export interface V2SourceRef {
  id: string;
  label: string;
  kind: V2SourceKind;
  sentences: { text: string; page: number }[];
  html?: string;
  sourceUrl?: string;
  /** Content images harvested from a website source (authoring image picker). */
  images?: { src: string; alt?: string; caption?: string }[];
  /** Original file / paste / URL meta for reopen. */
  meta?: Record<string, unknown>;
}

/** Editor part = GeneratedPart plus library-embed / image / video extras used in V1 editor. */
export type TutorialV2Part = Omit<GeneratedPart, 'type'> & {
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
  /** Its configuration: the deal seed and the skin the author picked. */
  embedSeed?: number;
  embedSkin?: string;
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
export interface V2TopLevelSlot {
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
  part?: TutorialV2Part;
  /** All authored/generated parts for this slot (preferred over singular `part`). */
  parts?: TutorialV2Part[];
  /** Authoring state for top-level generate slots (pick → markup → generate). */
  pickedSourceIds?: string[];
  highlights?: any[];
  markupFlags?: any[];
  units?: ContentUnit[];
  done: boolean;
  /**
   * Student-preview page (1-based). Same number = same learner page.
   * Set on Structure; omitted means legacy auto word-budget pagination.
   */
  learnerPage?: number;
}

export interface V2Section {
  id: string;
  title: string;
  intent?: string;
  /** Per-section recipe shape (blocks + embed slots) from the chosen template. */
  recipe: RecipeItem[];
  parts: TutorialV2Part[];
  pickedSourceIds: string[];
  highlights: any[];
  units?: ContentUnit[];
  markupFlags?: any[];
  authorMode: SectionAuthorMode;
  done: boolean;
  required: boolean;
  /**
   * Student-preview page (1-based). Same number = same learner page.
   * Set on Structure; omitted means legacy auto word-budget pagination.
   */
  learnerPage?: number;
}

export interface TutorialV2Structure {
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

export interface TutorialV2Draft {
  id: string;
  type: 'tutorial-v2';
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
  structure: TutorialV2Structure;
  sections: V2Section[];
  /** Recipe embeds at tutorial level (library picks / top-level generate). */
  topLevelSlots?: V2TopLevelSlot[];
  sourcePool: V2SourceRef[];
  /** Hoot co-author chat on Review — survives reopen. */
  assistantMessages?: AssistantMessage[];
  /** Markup highlights used to ground refine / generate on Review. */
  refineHighlights?: any[];
  /**
   * Assembled reading-order parts for Review (edit + student preview).
   * When set, preferred over re-collecting from slots/sections.
   */
  assembledParts?: TutorialV2Part[];
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

export type TutorialV2Phase = NonNullable<TutorialV2Draft['phase']>;
