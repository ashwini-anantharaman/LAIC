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

/**
 * Snapshot of the Sources → Mark up → Extract → Define wizard so an editor
 * can reopen the full process (not only the generated draft).
 */
export interface CreatorPipelineDraft {
  srcMode?: 'pdf' | 'text' | 'youtube' | 'prompt';
  promptText?: string;
  pasteText?: string;
  ytUrl?: string;
  doc?: { fileName: string; pageCount: number; sentences: { text: string; page: number }[] } | null;
  highlights?: any[];
  extracts?: any[];
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
