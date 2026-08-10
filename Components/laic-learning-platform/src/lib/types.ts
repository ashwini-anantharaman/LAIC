export type Role =
  | 'content-developer'
  | 'object-reviewer'
  | 'course-reviewer'
  | 'administrator'
  | 'coach'
  | 'student';

export type Program = 'bridge' | 'brain-bee' | 'mind-ai';

export type ObjectType =
  | 'course'
  | 'lesson'
  | 'tutorial'
  | 'tutorial-v2'
  | 'quiz'
  | 'flashcard-set'
  | 'concept-card'
  | 'summary'
  | 'reflection'
  | 'scenario'
  | 'assignment'
  | 'drill'
  | 'video-script';

export type ObjectStatus =
  | 'draft'
  | 'in-review'
  | 'changes-requested'
  | 'approved'
  | 'published'
  | 'archived';

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  program: Program;
}

export interface RichTextContent {
  text: string;
  /** Section title shown above the body (tutorial sections). */
  heading?: string;
  /** Optional subheads under the section title. */
  subheads?: string[];
}

/* ─── Tutorial templates + structured extract ───────────────────── */

export type ContentUnitKind =
  | 'Definition'
  | 'Key point'
  | 'Example'
  | 'Quote'
  | 'Fact'
  | 'Procedure';

export type SectionConnectionRule =
  | 'sequential'
  | 'standalone'
  | 'prerequisite_chain';

export type AssessmentPlacement =
  | 'after_each_section'
  | 'end_only'
  | 'none'
  | 'checkpoints_after_each';

/** @deprecated Flat recipe vocabulary for generation consumers; prefer RecipeItem. */
export type SectionRecipeBlockType =
  | 'section-heading'
  | 'explanation'
  | 'worked-example'
  | 'source-excerpt'
  | 'instruction'
  | 'try-it'
  | 'principle'
  | 'misconception'
  | 'correction'
  | 'scenario-advance'
  | 'knowledge-check'
  | 'media';

export interface MediaSlot {
  id: string;
  kind: 'image' | 'video' | 'either';
  required?: boolean;
  afterRecipeIndex: number;
  hint?: string;
}

/** @deprecated Flat recipe row; prefer AtomicBlockItem | EmbeddedObjectItem. */
export interface SectionBlockRecipeItem {
  type: SectionRecipeBlockType;
  preferKinds?: ContentUnitKind[];
  required?: boolean;
}

/** @deprecated Prefer SectionRecipe (RecipeItem[]). Kept for ObjectCreator / section plans. */
export type SectionBlockRecipe = SectionBlockRecipeItem[];

export type SectionConnection = SectionConnectionRule;

export type AtomicBlockType =
  | 'section-heading'
  | 'explanation'
  | 'worked-example'
  | 'source-excerpt'
  | 'instruction'
  | 'try-it'
  | 'principle'
  | 'misconception'
  | 'correction'
  | 'scenario-advance'
  | 'media';

export type EmbeddableObjectType =
  | 'quiz'
  | 'flashcard-set'
  | 'concept-card'
  | 'scenario'
  | 'assignment'
  | 'reflection'
  | 'reused-from-library';

export type EmbeddedObjectSourceMode =
  | 'generate'
  | 'pick_from_library'
  | 'prompt_on_author';

/**
 * Live pin to a library object version.
 * `objectId` → LearningObject.id; `versionId` → Version.id (not a copied versionNumber string).
 */
export interface VersionPin {
  objectId: string;
  versionId: string;
}

export interface MediaSlotConfig {
  kind: 'image' | 'video' | 'either';
  hint?: string;
}

/** When a recipe block should appear — defaults to always. */
export type BlockCondition =
  | { kind: 'always' }
  | { kind: 'if_source_kinds'; kinds: ContentUnitKind[] }
  | { kind: 'if_source_hint'; hint: string };

export interface AtomicBlockItem {
  kind: 'atomic';
  id: string;
  blockType: AtomicBlockType;
  required?: boolean;
  preferKinds?: ContentUnitKind[];
  media?: MediaSlotConfig;
  /** One-line steer for generation (like embedded authoringNote). */
  authoringNote?: string;
  /** Optional — skip when source doesn't justify the block. */
  condition?: BlockCondition;
}

/** Metadata for sourceMode=generate — steers AI (or blank scaffold) for any embed type. */
export interface EmbeddedGenerateMeta {
  title?: string;
  objective?: string;
  /** Quiz — count + scoring */
  questionCount?: number;
  /** When false, embedded quiz has no pass threshold (practice only). */
  passOn?: boolean;
  passMark?: string;
  /** Quiz — full define-style controls (inherit standalone quiz knobs). */
  qtypes?: string[];
  cog?: string[];
  diff?: string;
  wrong?: string;
  adaptive?: string;
  show?: string;
  perq?: boolean;
  /** Flashcard set */
  cardCount?: string | number;
  cc?: string[];
  pull?: string[];
  dir?: string;
  hooks?: boolean;
  /** Concept card */
  conceptFocus?: string;
  voi?: string;
  len?: string;
  /** Assignment */
  tt?: string;
  del?: string;
  el?: string;
  cite?: boolean;
  /** Freeform instructions beyond authoringNote */
  instructions?: string;
}

export interface EmbeddedObjectItem {
  kind: 'embedded';
  id: string;
  objectType: EmbeddableObjectType;
  sourceMode: EmbeddedObjectSourceMode;
  required: boolean;
  authoringNote?: string;
  versionPin?: VersionPin;
  libraryTitle?: string;
  /** Used when sourceMode is generate — define the new object up front. */
  generateMeta?: EmbeddedGenerateMeta;
  condition?: BlockCondition;
}

export type RecipeItem = AtomicBlockItem | EmbeddedObjectItem;
export type SectionRecipe = RecipeItem[];

/**
 * Named section shape. Plan assigns an archetypeId per section;
 * undefined archetype → use template.recipe (the default).
 */
export interface SectionArchetype {
  id: string;
  name: string;
  description?: string;
  recipe: SectionRecipe;
}

/** Per-knob locks — opt-in. Unset/false = course developer may change. */
export interface TutorialKnobLocks {
  secs?: boolean;
  prog?: boolean;
  dpth?: boolean;
  end?: boolean;
  chks?: boolean;
  /** pass / hintsOn / hintN */
  scoring?: boolean;
}

export type TutorialDepth = 'Overview' | 'Standard' | 'In-depth';

export interface TutorialKnobDefaults {
  secs?: number;
  /**
   * @deprecated Retired — tutorial length follows curated units + depth (`dpth`).
   * Ignored at generate time; kept optional for old drafts/templates.
   */
  words?: number;
  prog?: string;
  dpth?: string;
  end?: string;
  chks?: number;
  excpts?: number;
  wex?: boolean;
  /** When false, MCQ checks show score only (no pass/fail). Default true. */
  passOn?: boolean;
  /** Pass mark across all tutorial checks combined, e.g. "70%". Ignored when passOn is false. */
  pass?: string;
  /** Whether progressive hints are offered after wrong answers. */
  hintsOn?: boolean;
  /** How many progressive hints per question (1–4). Ignored when hintsOn is false. */
  hintN?: number;
  /**
   * When true, generation may add bridging explanations / standard background
   * the model judges learners need, beyond marked-up source units.
   */
  aiExtra?: boolean;
}

export interface TutorialTemplate {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  /** Default per-section recipe (used when a Plan section has no archetypeId). */
  recipe: SectionRecipe;
  /**
   * Named section types the Plan step can assign. Opt-in overrides of `recipe`.
   * Empty/undefined → every section uses the default recipe.
   */
  archetypes?: SectionArchetype[];
  /**
   * Flat projection for legacy generation / scaffold consumers.
   * Derived from `recipe` on save; do not treat as independently authored.
   * @deprecated Prefer `recipe` / `TutorialSectionPlan.sectionRecipe` when `usesCompositeRecipe` is true.
   */
  sectionBlockRecipe: SectionBlockRecipe;
  /**
   * When true, ObjectCreator / generate read `recipe` (composite).
   * When false/undefined, generation uses the flat `sectionBlockRecipe` path unchanged (legacy).
   */
  usesCompositeRecipe?: boolean;
  /**
   * @deprecated Prefer granular `knobLocks`. When true and knobLocks unset,
   * all structure knobs are treated as locked (legacy builtin behavior).
   */
  structureLocked?: boolean;
  /** Opt-in per-knob locks. Defaults unlocked so developers keep control. */
  knobLocks?: TutorialKnobLocks;
  sectionConnection: SectionConnectionRule;
  assessmentPlacement: AssessmentPlacement;
  /** Derived from atomic media items in `recipe` on save. */
  mediaSlots: MediaSlot[];
  knobDefaults: TutorialKnobDefaults;
}

/**
 * Human-authored tutorial outline captured in Plan (define-first).
 * Drives Mark up scan targets, Extract clusters, and generation sections.
 */
export interface DefinedSection {
  id: string;
  title: string;
  /** One-line: what this section teaches. */
  intent: string;
  /**
   * Section archetype from the template (`undefined` / `''` = default recipe).
   * Kept for older drafts; Plan no longer assigns section types.
   */
  archetypeId?: string;
  /** @deprecated Plan no longer sets per-section depth; global template dpth applies. */
  depth?: TutorialDepth;
  /**
   * Which template recipe embed item ids are tagged to this section.
   * `undefined` = legacy (all recipe embeds). `[]` = none. Explicit list = only those.
   */
  attachedEmbedIds?: string[];
}

/**
 * Per-instance override for a template embed slot in THIS tutorial.
 * Keyed on TutorialDefinition.embedPlans by `${sectionId}:${recipeItemId}`.
 */
export interface EmbedPlanOverride {
  /** Author tweak of what this embed should achieve (seeds generator intent). */
  objective?: string;
  /** Extra instructions beyond template authoringNote / generateMeta.instructions. */
  instructions?: string;
  /**
   * For sourceMode=prompt_on_author: author chooses at Plan time.
   * Undefined = still unresolved.
   */
  resolvedMode?: 'generate' | 'pick_from_library';
  /** When resolvedMode is pick_from_library. */
  versionPin?: VersionPin;
  libraryTitle?: string;
}

export interface TutorialDefinition {
  objective: string;
  /** Ordered section outline (not the template per-section block recipe). */
  sections: DefinedSection[];
  /** Per-embed authoring overrides for this tutorial. Optional — old drafts omit. */
  embedPlans?: Record<string, EmbedPlanOverride>;
}

/** Holding cluster for units with no sectionId — never AI-homed, never dropped. */
export const UNASSIGNED_SECTION_ID = '__unassigned__';

export interface ContentUnit {
  id: string;
  kind: ContentUnitKind;
  text: string;
  from?: string;
  fromHl?: boolean;
  clusterId?: string;
  /** Ties unit to a DefinedSection (define-first). */
  sectionId?: string;
  structured?: { columns: string[]; rows: string[][] };
  sourceHighlightIds?: number[];
  /** Originating source label when known (PDF name, website, etc.). */
  sourceLabel?: string;
  /**
   * Author note from Markup on this passage. Generation must follow it
   * word-for-word for how this passage is used in the object.
   */
  authorNote?: string;
}

export interface ConceptCluster {
  id: string;
  name: string;
  unitIds: string[];
  covers?: string[];
  /** When set, cluster is the fixed bucket for that DefinedSection (or Unassigned). */
  sectionId?: string;
}

export interface CoverageGap {
  id: string;
  message: string;
  severity: 'warn' | 'error';
}

export interface ClusteredKnowledgeBase {
  units: ContentUnit[];
  clusters: ConceptCluster[];
  rawHighlightCount: number;
  mergedUnitCount: number;
  shapeIntent?: string;
  gaps?: CoverageGap[];
}

export interface TutorialSectionPlan {
  index: number;
  title: string;
  /** Human one-line intent from Plan (define-first). */
  intent?: string;
  subheads?: string[];
  clusterId: string;
  /** Resolved archetype for this section (`undefined` = default recipe). */
  archetypeId?: string;
  /** Per-section depth (`undefined` = template / config global dpth). */
  depth?: TutorialDepth | string;
  /**
   * Preferred when the template was authored as composite (`usesCompositeRecipe`).
   * Resolved from archetype override or template.recipe, then filtered by block conditions.
   */
  sectionRecipe?: SectionRecipe;
  /**
   * @deprecated Flat shadow for legacy templates / consumers not yet on composite.
   * Always populated for backward compatibility; generation prefers `sectionRecipe` when present.
   */
  recipe: SectionBlockRecipe;
  mediaPlacements: { slotId: string; mediaRef: string }[];
}
export type ConceptCardViewKey =
  | 'definition'
  | 'analogy'
  | 'example'
  | 'visual'
  | 'misconception'
  | 'meaning'
  | 'why'
  | 'core'
  | 'components'
  | 'nonExample'
  | 'mistake'
  | 'connection'
  | 'recall'
  | 'teachBack';

/** Full pedagogical concept-card template (matches the fixed UI sheet). */
export interface ConceptCardContent {
  term: string;
  /** ONE-SENTENCE MEANING */
  oneSentenceMeaning?: string;
  /** WHY IT MATTERS */
  whyItMatters?: string;
  /** CORE IDEA */
  coreIdea?: string;
  /** KEY COMPONENTS — bullet list */
  keyComponents?: string[];
  /** EXAMPLE */
  example?: string;
  /** NON-EXAMPLE */
  nonExample?: string;
  /** Free-text visual / formula description */
  visualOrFormula?: string;
  /** Left box in the visual flow diagram */
  visualChoice?: string;
  /** Right box in the visual flow diagram */
  visualAlternative?: string;
  /** Formula line under the diagram */
  visualFormula?: string;
  /** COMMON MISTAKE */
  commonMistake?: string;
  /** CONNECTION */
  connection?: string;
  /** RECALL QUESTION */
  recallQuestion?: string;
  /** TEACH-BACK */
  teachBack?: string;

  /** @deprecated Prefer oneSentenceMeaning — kept for older saved cards. */
  definition?: string;
  /** @deprecated Prefer whyItMatters / connection. */
  analogy?: string;
  /** @deprecated Prefer visualOrFormula. */
  visualSuggestion?: string;
  /** @deprecated Prefer commonMistake. */
  misconception?: string;

  /** Ordered categories for this card (from Define). Controls which panels show. */
  categories?: Array<{
    id: string;
    label: string;
    enabled: boolean;
    builtin?: boolean;
    tone?: string;
  }>;
  /** Author-added / custom category bodies. */
  extraSections?: Array<{ id: string; title: string; body: string }>;
  /** Optional media per category (keyed by category id, incl. custom ids). */
  categoryMedia?: Record<string, { url: string; kind: 'image' | 'video'; caption?: string }>;

  voice?: string;
  length?: string;
  /** Legacy Include chips — ignored by the fixed template UI. */
  includedViews?: ConceptCardViewKey[];
  citations?: Partial<Record<string, string>>;
}
export type QuestionType =
  | 'multiple-choice'
  | 'true-false'
  | 'multi-select'
  | 'short-answer'
  | 'scenario';

export interface QuestionContent {
  question: string;
  type: QuestionType | 'multiple-choice';
  options?: string[];
  /** Single correct option index (MC / T-F / scenario). */
  correct?: number;
  /** All correct option indices (multi-select). */
  correctIndices?: number[];
  /** Acceptable answer guidance for short-answer. */
  sampleAnswer?: string;
  explanation?: string;
  /** Optional learner hint (shown on request). */
  hint?: string;
  /** Progressive hints revealed after wrong attempts (length set in Define). */
  hints?: string[];
  /** Display label (e.g. "Question 3") — used when quizzes are split across tutorial blocks. */
  label?: string;
  cognitiveLevel?: string;
  difficulty?: string;
  /** Short grounded quotes shown after answer reveal ("FROM YOUR SOURCES"). */
  sources?: { quote: string; cite: string }[];
  /** Optional image shown under the question stem (data URL or https). */
  imageUrl?: string;
  /** Optional YouTube video shown under the question stem. */
  videoUrl?: string;
}
export interface QuizContent {
  questions: QuestionContent[];
  /**
   * When false, show score only — no pass/fail threshold.
   * Default true when omitted (legacy quizzes).
   */
  passRequired?: boolean;
  /** Pass threshold 0–100 from Define. Ignored when passRequired is false. */
  passMark?: number;
  /** When to reveal explanations: Immediately | After attempt | After completion | Never */
  showExplanations?: string;
  purpose?: string;
  /** When true, next question difficulty adapts to the previous answer. */
  adaptive?: boolean;
}
export interface FlashcardItem {
  front: string;
  back: string;
  /** Optional mnemonic / memory hook shown under the answer. */
  hook?: string;
  /** Optional learner hint shown on the prompt side. */
  hint?: string;
  /** Data URL or https URL for Image → label cards (shown on the front). */
  imageUrl?: string;
  /** Optional YouTube video shown on the prompt side. */
  videoUrl?: string;
}
export interface FlashcardSetContent {
  cards: FlashcardItem[];
  /** Review direction from Define: Front→back · Back→front · Both */
  direction?: string;
}
export interface BridgePlayContent {
  title: string;
  description: string;
  trump: string;
  north: string;
  east: string;
  south: string[];
  west: string;
  correctAnswer: string;
  explanation: string;
}
export interface BidItem {
  seat: 'N' | 'E' | 'S' | 'W';
  bid: string;
  explanation: string;
}
export interface BiddingSequenceContent {
  title: string;
  seats: string[];
  bids: BidItem[];
  finalContract: string;
}
export interface SourceExcerptContent {
  sourceTitle: string;
  excerpt: string;
  page?: number;
}
export interface ImageContent {
  url: string;
  caption?: string;
  alt?: string;
}
export interface VideoEmbedContent {
  provider: 'youtube';
  /** The original URL the content dev pasted. */
  url: string;
  /** Parsed YouTube video id. */
  videoId: string;
  /** Optional clip window, in seconds. */
  start?: number;
  end?: number;
  caption?: string;
}

/** Timed caption chunk for video-script transcript panel. */
export interface VideoScriptTranscriptSegment {
  id: string;
  start: number;
  end?: number;
  text: string;
}

/** Interactive pause point with a question (Edpuzzle-style). */
export interface VideoScriptCheckpoint {
  id: string;
  /** Pause the video at this time (seconds). */
  time: number;
  question: QuestionContent;
}

/** Interactive video lesson: video + checkpoints + optional transcript/chat. */
export interface VideoScriptContent {
  provider: 'youtube';
  videoUrl: string;
  videoId: string;
  title?: string;
  transcript: VideoScriptTranscriptSegment[];
  checkpoints: VideoScriptCheckpoint[];
  /** Show clickable transcript beside the video for learners. */
  showTranscript?: boolean;
  /** Show Ask-AI chatbot grounded on the video transcript. */
  enableChat?: boolean;
  /** Learner must submit an answer before playback continues. */
  requireAnswer?: boolean;
}

export interface SummaryContent {
  shape: string;
  length?: string;
  audience?: string;
  /** What was summarised (intent). */
  topic?: string;
  tldr?: string;
  keyPoints?: string[];
  body?: string;
}

export interface ReflectionPrompt {
  id: string;
  prompt: string;
  starters?: string[];
}

export interface ReflectionContent {
  goal: string;
  style: string;
  visibility: string;
  voice?: string;
  audience?: string;
  prompts: ReflectionPrompt[];
}

export interface RubricCriterion {
  criterion: string;
  description?: string;
  levels?: string[];
}

export interface AssignmentContent {
  objective: string;
  taskType: string;
  deliverable: string;
  expectedLength?: string;
  requireCitations?: boolean;
  prompt: string;
  requirements: string[];
  rubric: RubricCriterion[];
  audience?: string;
  level?: string;
}

/** Author Define — Recognition / Recall / Application. */
export type DrillCognitiveFormat = 'Recognition' | 'Recall' | 'Application';
export type DrillDifficultyMode = 'Flat' | 'Easy → hard';
export type DrillFeedbackTiming = 'Immediate' | 'End only';
export type DrillItemDifficulty = 'easy' | 'medium' | 'hard';

/** Learner mechanic — what the player renders. */
export type DrillInteractiveKind =
  | 'label_place'
  | 'order'
  | 'categorize'
  | 'match'
  | 'compute'
  | 'multi_step'
  | 'choice';

export interface DrillRegion {
  id: string;
  label?: string;
  /** Normalized 0–1 box relative to image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DrillInteractivePayload =
  | {
      kind: 'label_place';
      imageUrl: string;
      imageAlt?: string;
      regions: DrillRegion[];
      terms: { id: string; text: string }[];
      /** termId → regionId */
      mapping: Record<string, string>;
    }
  | {
      kind: 'order';
      steps: { id: string; text: string }[];
      correctOrder: string[];
    }
  | {
      kind: 'categorize';
      buckets: { id: string; label: string }[];
      items: { id: string; text: string }[];
      /** itemId → bucketId */
      assignments: Record<string, string>;
    }
  | {
      kind: 'match';
      left: { id: string; text: string }[];
      right: { id: string; text: string }[];
      /** leftId → rightId */
      pairs: Record<string, string>;
    }
  | {
      kind: 'compute';
      prompt: string;
      expected: string;
      tolerance?: number;
      unit?: string;
    }
  | {
      kind: 'multi_step';
      steps: {
        id: string;
        prompt: string;
        interaction: Extract<DrillInteractivePayload, { kind: 'compute' | 'choice' }>;
        whyCorrect?: string;
        corrections?: Record<string, string>;
      }[];
    }
  | {
      kind: 'choice';
      prompt: string;
      choices: { id: string; text: string; correct: boolean; correction?: string }[];
    };

export interface DrillItemResult {
  correct: boolean;
  wrongParts?: string[];
  committed: unknown;
  why?: string;
  correction?: string;
}

export interface DrillRuntimeRules {
  feedbackTiming: DrillFeedbackTiming;
  timed: boolean;
  secondsPerItem?: number;
  repeatUntilMastery: boolean;
  requeueOffset?: number;
}

export interface DrillTier {
  id: string;
  label: string;
  difficulty: DrillItemDifficulty | 'mixed';
  itemIds: string[];
}

export interface DrillItem {
  id: string;
  /**
   * Legacy stem — kept for storage compat. Runtime reads `interactive` only
   * (after normalizeDrillItem maps legacy → interactive).
   */
  prompt: string;
  /** Legacy canonical answer — mapped into interactive answer keys. */
  answer: string;
  /** Legacy Recognition options — mapped to interactive.kind = 'choice'. */
  choices?: string[];
  whyCorrect?: string;
  corrections?: Record<string, string>;
  hint?: string;
  difficulty?: DrillItemDifficulty;
  skillTag?: string;
  /** Canonical interactive mechanic + answer key (runtime source of truth). */
  interactive?: DrillInteractivePayload;
}

export interface DrillBlueprint {
  skill: string;
  level: string;
  cognitiveFormat: DrillCognitiveFormat | string;
  difficultyMode: DrillDifficultyMode | string;
  itemCount: number;
  items: DrillItem[];
  tiers: DrillTier[];
  runtime: DrillRuntimeRules;
  grounding?: { sourceCount: number; extractCount: number; clusterCount?: number };
}

export interface DrillContent {
  skill: string;
  format: string;
  difficultyCurve: string;
  feedback: string;
  timed?: boolean;
  secondsPerItem?: number;
  repeatUntilMastery?: boolean;
  requeueOffset?: number;
  level?: string;
  items: DrillItem[];
  /** Compiled blueprint when present; runtime prefers this over flat fields. */
  blueprint?: DrillBlueprint;
  tiers?: DrillTier[];
}

/** Pinned Activity object embedded inside a parent tutorial. */
export interface LibraryEmbedContent {
  libraryTitle: string;
  objectType: ObjectType;
  versionPin: VersionPin;
  /** Nested blocks snapshot (same shape as LearningObject.blocks). */
  snapshotBlocks: Array<{ id: string; type: string; content: any }>;
  authoringNote?: string;
  required?: boolean;
  label?: string;
  /** True when snapshot came from a per-type generator (not a library pin). */
  generated?: boolean;
}

export type BlockContent =
  | RichTextContent
  | ConceptCardContent
  | QuestionContent
  | QuizContent
  | FlashcardSetContent
  | BridgePlayContent
  | BiddingSequenceContent
  | SourceExcerptContent
  | ImageContent
  | VideoEmbedContent
  | VideoScriptContent
  | SummaryContent
  | ReflectionContent
  | AssignmentContent
  | DrillContent
  | LibraryEmbedContent;

/** A published Bridge table block: everything needed to mount the component. */
export interface BridgeTableContent {
  /** Which Bridge component (today: 'table'). */
  kind?: string;
  /** The deal, derived deterministically so every reader sees the same board. */
  seed?: number;
  skin?: string;
  showAllHands?: boolean;
  caption?: string;
}

export interface Block {
  id: string;
  type:
    | 'rich-text'
    | 'concept-card'
    | 'source-excerpt'
    | 'question'
    | 'quiz'
    | 'flashcard-set'
    | 'reflection'
    | 'summary'
    | 'scenario'
    | 'assignment'
    | 'drill'
    | 'image'
    | 'video-embed'
    | 'video-script'
    | 'bridge-play'
    /** A live Bridge Platform table, configured by the author. */
    | 'bridge-table'
    | 'bidding-sequence'
    /** Pinned Activity-library object embedded inside a tutorial. */
    | 'library-embed';
  content: BlockContent;
  /** Author-controlled hard page break before this block (Tutorial V2 Structure). */
  pageBreakBefore?: boolean;
}

/**
 * Document-level markup review group.
 * Prefer author scan-focus groups (freeform slug); legacy fixed kinds still accepted.
 */
export type MarkupFlagKind = string;
export type MarkupFlagStatus = 'pending' | 'accepted' | 'rejected' | 'adjusted';

export interface MarkupFlag {
  id: string;
  kind: MarkupFlagKind;
  /** Human label for the group (scan-focus derived). Falls back to kind. */
  groupLabel?: string;
  /** Short label for the review list. */
  title: string;
  rationale?: string;
  /** Inclusive sentence indices in the parsed document. */
  startIdx: number;
  endIdx: number;
  page?: number;
  excerpt: string;
  suggestedTag: 'Use' | 'Support' | 'Ignore' | 'Note';
  status: MarkupFlagStatus;
  /** Author override when adjusting before accept. */
  adjustedText?: string;
  /** Defined section this proposal supports (define-first scan). */
  sectionId?: string;
}

/**
 * Snapshot of the Sources → Mark up → Extract → Define wizard so an editor
 * can reopen the full process (not only the generated draft).
 */
export interface CreatorPipelineDraft {
  srcMode?: 'pdf' | 'text' | 'youtube' | 'web' | 'prompt' | 'manual';
  promptText?: string;
  pasteText?: string;
  ytUrl?: string;
  /** Website URL used when srcMode is 'web'. */
  webUrl?: string;
  doc?: {
    fileName: string;
    pageCount: number;
    sentences: { text: string; page: number }[];
    html?: string;
    sourceUrl?: string;
  } | null;
  highlights?: any[];
  /** AI document-level markup flags for Accept / Reject / Adjust review. */
  markupFlags?: MarkupFlag[];
  extracts?: any[];
  knowledgeBase?: ClusteredKnowledgeBase;
  templateId?: string;
  shapeIntent?: string;
  /** Define-first spine for tutorials (objective + named sections). */
  tutorialDefinition?: TutorialDefinition;
  fv?: Record<string, any>;
  scope?: string;
  media?: any[];
  sel?: string[];
  roles?: Record<string, string>;
  urlRefs?: string[];
  reached?: number;
  step?: number;
  /** Hoot co-author chat — survives Sources → Markup → Extract → Define → Editor. */
  assistantMessages?: AssistantMessage[];
}

export interface LearningObject {
  id: string;
  type: ObjectType;
  title: string;
  ownerId: string;
  ownerName: string;
  status: ObjectStatus;
  scope: 'bridge' | 'shared';
  reuseCount: number;
  description: string;
  estimatedTime: string;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  sourceIds: string[];
  /**
   * Object Library collections this object belongs to (user-named folders).
   * An object may appear in more than one collection.
   */
  collectionIds?: string[];
  /** @deprecated Prefer collectionIds — kept for older saved libraries. */
  collectionId?: string;
  /** Optional wizard state for reopening the full create/edit pipeline. */
  pipelineDraft?: CreatorPipelineDraft;
  /**
   * Tutorial V2 Approach-2 skeleton + per-section authoring state.
   * Only used when type === 'tutorial-v2'; ignored by V1 tutorial path.
   */
  tutorialV2Draft?: import('./tutorialV2/types').TutorialV2Draft;
  /**
   * Structured V2 authoring state (Plan → Structure → Author → Review) for
   * quiz / flashcard-set / concept-card / video-script objects.
   */
  structuredV2Draft?: import('./objectV2/structuredDraft').StructuredV2Draft;
}

export interface CourseLesson {
  id: string;
  title: string;
  objectId?: string;
  status: 'not-started' | 'in-progress' | 'completed';
  estimatedTime: string;
}

export interface CourseModule {
  id: string;
  title: string;
  lessons: CourseLesson[];
}

export interface Course {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  status: ObjectStatus;
  modules: CourseModule[];
  description: string;
  estimatedTotal: string;
  learnerCount: number;
  scope: 'bridge' | 'shared';
}

export interface Source {
  id: string;
  title: string;
  kind: 'pdf' | 'video-transcript' | 'slides' | 'audio' | 'link';
  pages?: number;
  duration?: string;
  domain: string;
  primary: boolean;
  addedBy: string;
  addedAt: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  blockId?: string;
  content: string;
  resolved: boolean;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  objectId?: string;
  courseId?: string;
  type: 'object' | 'course';
  title: string;
  objectType?: ObjectType;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'in-review' | 'approved' | 'changes-requested';
  comments: Comment[];
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  assignedCourses: string[];
}

/** Frozen content for a learning-object version (library history). */
export interface ObjectVersionSnapshot {
  title: string;
  description: string;
  estimatedTime: string;
  status: ObjectStatus;
  type: ObjectType;
  blocks: Block[];
  tags: string[];
  sourceIds: string[];
  pipelineDraft?: CreatorPipelineDraft;
  tutorialV2Draft?: import('./tutorialV2/types').TutorialV2Draft;
}

export interface Version {
  id: string;
  objectId: string;
  objectTitle: string;
  versionNumber: number;
  status: ObjectStatus;
  createdAt: string;
  createdBy: string;
  isLive: boolean;
  notes: string;
  /** Frozen — regular saves do not overwrite this version. */
  locked?: boolean;
  /** Content at the time this version was saved. */
  snapshot?: ObjectVersionSnapshot;
}

export interface LearnerProgress {
  learnerId: string;
  learnerName: string;
  courseId: string;
  completedLessons: string[];
  currentLessonId: string;
  quizScores: Record<string, number>;
  overallPercent: number;
  lastActive: string;
}

/* ────────────────────────────────────────────────────────────────
 * Course Wizard domain (typed API contract)
 *
 * These types back the RAG-driven Course learning-object workflow in
 * CourseWizard.tsx. They are the single source of truth for the backend
 * contract — every api.ts response is typed here. Added incrementally,
 * one wizard step at a time.
 * ──────────────────────────────────────────────────────────────── */

/* ─── Canonical block vocabulary (matches lp_block.block_type) ──── */
export type CourseBlockType =
  | 'rich_text'
  | 'summary'
  | 'concept_card'
  | 'source_excerpt'
  | 'single_question'
  | 'scenario'
  | 'reflection'
  | 'assignment'
  | 'video_script'
  | 'image'
  | 'quiz'
  | 'flashcard_set';

/* ─── Step 1 — Source ──────────────────────────────────────────── */
export type IngestionStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type WizardSourceKind =
  | 'pdf'
  | 'docx'
  | 'slides'
  | 'text'
  | 'video-transcript'
  | 'audio'
  | 'link';

export interface WizardSource {
  id: string;
  title: string;
  /** Original filename or mono metadata line source, e.g. "how-to-play-bridge.pdf". */
  filename: string;
  kind: WizardSourceKind;
  pages?: number;
  duration?: string;
  domain: string;
  /** Pre-selected in the wizard when it opens. */
  primary: boolean;
  /** Embedding/ingestion state — generation requires `ready`. */
  ingestionStatus: IngestionStatus;
  /** Optional human-readable reason when ingestionStatus === 'failed'. */
  ingestionError?: string;
  collectionId?: string;
}

export interface SourceCollection {
  id: string;
  name: string;
  sourceIds: string[];
}

/* ─── Course-dev Object Assistant ───────────────────────────────── */

/** Where the developer’s focus is inside the open object. */
export type ObjectSelection =
  | { kind: 'none' }
  | { kind: 'block'; blockId: string }
  | {
      kind: 'block_range';
      blockId: string;
      start: number;
      end: number;
      selectedText: string;
    }
  | { kind: 'multi_block'; blockIds: string[] };

export interface AssistantContextBlock {
  id: string;
  index: number;
  type: Block['type'] | string;
  label?: string;
  content: Record<string, unknown>;
  sourceRefs?: string[];
}

/** Live snapshot always sent with assistant turns. */
export interface AssistantContext {
  objectId: string;
  objectType: ObjectType;
  title: string;
  status: ObjectStatus;
  scope?: string;
  metadata: {
    objective?: string;
    audience?: string;
    level?: string;
    voice?: string;
    topic?: string;
    teachingApproach?: string;
    templateId?: string;
    extras?: Record<string, unknown>;
  };
  provenance: {
    srcMode?: CreatorPipelineDraft['srcMode'];
    sourceCount: number;
    highlightCount: number;
    extractCount: number;
    highlights?: CreatorPipelineDraft['highlights'];
    extracts?: CreatorPipelineDraft['extracts'];
    knowledgeBase?: ClusteredKnowledgeBase;
    mediaSummary?: { id: string; kind: string; caption?: string }[];
  };
  blocks: AssistantContextBlock[];
  selection: ObjectSelection;
}

export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export interface AssistantCitation {
  kind: 'block' | 'extract' | 'highlight' | 'cluster';
  id: string;
  label?: string;
}

/** Image attached in Hoot for placement / vision-grounded co-authoring. */
export interface AssistantAttachedImage {
  id: string;
  /** data: or https URL — used as the image block url on Accept. */
  url: string;
  name?: string;
  caption?: string;
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  at: number;
  citations?: AssistantCitation[];
  proposalIds?: string[];
  streaming?: boolean;
  error?: string;
  /** User-attached images on this turn (shown in chat; sent to the assistant). */
  attachments?: AssistantAttachedImage[];
}

export type EditAction =
  | { type: 'update_block'; blockId: string; patch: Record<string, unknown>; reason?: string }
  | {
      type: 'update_block_range';
      blockId: string;
      start: number;
      end: number;
      replacement: string;
      field?: string;
      reason?: string;
    }
  | {
      type: 'add_block';
      atIndex: number;
      blockType: string;
      content: Record<string, unknown>;
      label?: string;
      reason?: string;
    }
  | { type: 'delete_block'; blockId: string; reason?: string }
  | { type: 'reorder_blocks'; order: string[]; reason?: string }
  | { type: 'split_block'; blockId: string; atOffset: number; reason?: string }
  | { type: 'merge_blocks'; blockIds: [string, string]; reason?: string }
  | {
      type: 'convert_block';
      blockId: string;
      toType: string;
      content: Record<string, unknown>;
      reason?: string;
    }
  | {
      type: 'update_metadata';
      patch: Partial<{
        title: string;
        objective: string;
        audience: string;
        level: string;
        voice: string;
        fv: Record<string, unknown>;
      }>;
      reason?: string;
    }
  | { type: 'batch'; actions: EditAction[]; reason?: string };

export type EditDiffKind = 'text' | 'structural' | 'metadata' | 'batch_item';

export interface EditDiff {
  id: string;
  kind: EditDiffKind;
  summary: string;
  beforeText?: string;
  afterText?: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  blockId?: string;
  action: EditAction;
}

export type ProposedEditStatus = 'pending' | 'accepted' | 'rejected' | 'edited_accepted';

export interface ProposedEdit {
  id: string;
  messageId: string;
  status: ProposedEditStatus;
  title: string;
  diffs: EditDiff[];
  createdAt: number;
}

export type AssistantActionResult =
  | { ok: true; kind: 'answer'; message: AssistantMessage }
  | { ok: true; kind: 'proposal'; message: AssistantMessage; proposal: ProposedEdit }
  | { ok: true; kind: 'clarify'; message: AssistantMessage }
  | { ok: false; code: string; message: string };

export interface AssistantChangeLogEntry {
  id: string;
  at: number;
  summary: string;
  blockIds: string[];
  proposalId?: string;
}

export interface AssistantSessionState {
  objectId: string;
  messages: AssistantMessage[];
  proposals: ProposedEdit[];
  changeLog: AssistantChangeLogEntry[];
  busy: boolean;
  error: string | null;
}

export type AssistantQuickActionId =
  | 'improve_block'
  | 'make_simpler'
  | 'shorten'
  | 'add_example'
  | 'write_check'
  | 'fix_grounding'
  | 'coverage_check'
  | 'summarize';

export interface AssistantTurnRequest {
  context: AssistantContext;
  selection: ObjectSelection;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  quickAction?: AssistantQuickActionId;
  /** Images the author attached in Hoot this turn — place via add_block image. */
  attachedImages?: AssistantAttachedImage[];
}

export interface EditorHistoryEntry {
  id: string;
  label: string;
  inverse: EditAction[];
  forward: EditAction[];
  at: number;
  source: 'manual' | 'assistant';
}
