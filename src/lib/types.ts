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
export interface ConceptCardContent {
  term: string;
  definition: string;
  example?: string;
}
export interface QuestionContent {
  question: string;
  type: 'multiple-choice';
  options: string[];
  correct: number;
  explanation: string;
}
export interface QuizContent {
  questions: QuestionContent[];
}
export interface FlashcardItem {
  front: string;
  back: string;
  /** Optional mnemonic / memory hook shown under the answer. */
  hook?: string;
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
  | VideoEmbedContent;

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
    | 'image'
    | 'video-embed'
    | 'bridge-play'
    | 'bidding-sequence';
  content: BlockContent;
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
