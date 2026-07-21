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

export interface SectionBlockRecipeItem {
  type: SectionRecipeBlockType;
  preferKinds?: ContentUnitKind[];
  required?: boolean;
}

export type SectionBlockRecipe = SectionBlockRecipeItem[];

export interface TutorialKnobDefaults {
  secs?: number;
  prog?: string;
  dpth?: string;
  end?: string;
  chks?: number;
  excpts?: number;
  wex?: boolean;
  /** Pass mark across all tutorial checks combined, e.g. "70%". */
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
  sectionBlockRecipe: SectionBlockRecipe;
  sectionConnection: SectionConnectionRule;
  assessmentPlacement: AssessmentPlacement;
  mediaSlots: MediaSlot[];
  knobDefaults: TutorialKnobDefaults;
}

export interface ContentUnit {
  id: string;
  kind: ContentUnitKind;
  text: string;
  from?: string;
  fromHl?: boolean;
  clusterId?: string;
  structured?: { columns: string[]; rows: string[][] };
  sourceHighlightIds?: number[];
}

export interface ConceptCluster {
  id: string;
  name: string;
  unitIds: string[];
  covers?: string[];
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
  subheads?: string[];
  clusterId: string;
  recipe: SectionBlockRecipe;
  mediaPlacements: { slotId: string; mediaRef: string }[];
}
export type ConceptCardViewKey =
  | 'definition'
  | 'analogy'
  | 'example'
  | 'visual'
  | 'misconception';

export interface ConceptCardContent {
  term: string;
  /** Formal / plain definition. */
  definition: string;
  /** Worked example or concrete case. */
  example?: string;
  /** Everyday analogy. */
  analogy?: string;
  /** Suggestion for a diagram / visual. */
  visualSuggestion?: string;
  /** Common misconception to correct. */
  misconception?: string;
  voice?: string;
  length?: string;
  /** Views selected in Define (controls tabs — not content emptiness). */
  includedViews?: ConceptCardViewKey[];
  /** Per-view citation back to the source chunk. */
  citations?: Partial<Record<ConceptCardViewKey, string>>;
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
}
export interface QuizContent {
  questions: QuestionContent[];
  /** Pass threshold 0–100 from Define. */
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

export interface DrillItem {
  id: string;
  prompt: string;
  answer: string;
  choices?: string[];
  hint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface DrillContent {
  skill: string;
  format: string;
  difficultyCurve: string;
  feedback: string;
  timed?: boolean;
  repeatUntilMastery?: boolean;
  level?: string;
  items: DrillItem[];
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
  | SummaryContent
  | ReflectionContent
  | AssignmentContent
  | DrillContent;

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
    | 'bridge-play'
    | 'bidding-sequence';
  content: BlockContent;
}

/** Document-level markup review item (not per-sentence popups). */
export type MarkupFlagKind = 'core' | 'confusion' | 'diagram' | 'out_of_scope';
export type MarkupFlagStatus = 'pending' | 'accepted' | 'rejected' | 'adjusted';

export interface MarkupFlag {
  id: string;
  kind: MarkupFlagKind;
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
  doc?: { fileName: string; pageCount: number; sentences: { text: string; page: number }[] } | null;
  highlights?: any[];
  /** AI document-level markup flags for Accept / Reject / Adjust review. */
  markupFlags?: MarkupFlag[];
  extracts?: any[];
  knowledgeBase?: ClusteredKnowledgeBase;
  templateId?: string;
  shapeIntent?: string;
  fv?: Record<string, any>;
  scope?: string;
  media?: any[];
  sel?: string[];
  roles?: Record<string, string>;
  urlRefs?: string[];
  reached?: number;
  step?: number;
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
  /** Optional wizard state for reopening the full create/edit pipeline. */
  pipelineDraft?: CreatorPipelineDraft;
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

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  at: number;
  citations?: AssistantCitation[];
  proposalIds?: string[];
  streaming?: boolean;
  error?: string;
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
}

export interface EditorHistoryEntry {
  id: string;
  label: string;
  inverse: EditAction[];
  forward: EditAction[];
  at: number;
  source: 'manual' | 'assistant';
}
