// ── Domain types ────────────────────────────────────────────────────────────
// These interfaces mirror the LAIC platform's shared services (Learner, Session,
// Claude proxy, RAG, Auth). The v1 app talks only to the mock implementations in
// `mock.ts`, but the shapes are designed so a real FastAPI/Supabase backend can
// drop in behind the same `api` object with no UI changes.

export type Role = "student" | "teacher";

// The three explanation modes. Labels are surfaced in the UI; ids stay stable so
// they can be sent straight to the Claude proxy as prompt keys.
export type Mode = "conversational" | "summary" | "narrative";

export interface ModeMeta {
  id: Mode;
  label: string;
  // Short blurb used on the onboarding "how do you learn best?" step.
  desc: string;
}

// ── Content model ───────────────────────────────────────────────────────────
export interface Figure {
  image: string;
  caption: string;
}

export interface Bubble {
  text?: string;
  image?: string;
  caption?: string;
}

export interface ConversationalContent {
  question: string;
  bubbles: Bubble[];
}

export interface ArticleContent {
  title: string;
  lead?: string;
  paragraphs: string[];
  figure?: Figure;
}

// A single unit's fully-generated content across every mode. `availableModes`
// and `hasInteractive` come from what the instructor chose to generate; the UI
// grays out anything not present here.
export interface UnitContent {
  unitId: string;
  moduleLabel: string;
  concept: string;
  progress: number;
  availableModes: Mode[];
  hasInteractive: boolean;
  conversational: ConversationalContent;
  summary: ArticleContent;
  narrative: ArticleContent;
  // Canned assistant reply per mode (stands in for the Claude proxy response).
  assistantReply: Record<Mode, string>;
}

// ── Course model ────────────────────────────────────────────────────────────
export interface CourseUnit {
  id: string;
  moduleLabel: string;
  concept: string;
  position?: number;
}

export interface Course {
  id: string;
  subject: string;
  unitTitle: string;
  teacher: string;
  units: number;
  progress: number;
  joinCode?: string;
  grade?: string;
  unitList?: CourseUnit[];
}

export interface CreatedCourse {
  courseId: string;
  joinCode: string;
  subject: string;
  unitTitle: string;
  teacher: string;
  units: CourseUnit[];
  ingestJobId?: string;
}

export interface IngestJobStatus {
  status: string;
  stage: string;
  current: number;
  total: number;
  error?: string;
}

export interface TeacherMeta {
  goals: string;
  grade: string;
  subject: string;
  teacherName: string;
  orgId?: string;
}

export interface UploadResult {
  uploadId: string;
  filename: string;
  textLength: number;
}

// ── Auth model ──────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
}

// ── Teacher-side models ─────────────────────────────────────────────────────
export interface StudentRecord {
  id: string;
  name: string;
  mastery: number;
  understanding: number;
  progress: number;
  status: "on-track" | "at-risk" | "ahead";
}

export type BlockType = "Text" | "Flashcards" | "Animation" | "Quiz";

export interface Block {
  type: BlockType;
  content: string;
}

// ── Module structure (chapter screen learning) ──────────────────────────────
export interface VoiceParagraphs {
  paragraphs: string[];
}

export interface ScreenBeat {
  conceptId: string;
  conversational: VoiceParagraphs;
  summary: VoiceParagraphs;
  narrative: VoiceParagraphs;
  figure?: Figure;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
}

export interface MCQItem {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

export type ModuleStep =
  | { type: "screen"; chapterLabel: string; sectionTitle?: string; beat: ScreenBeat }
  | { type: "flashcard_check"; cards: FlashcardItem[]; source: "standard" | "teacher" }
  | { type: "mcq"; questions: MCQItem[]; source: "standard" | "teacher" };

export interface ChapterModule {
  chapterId: string;
  label: string;
  title: string;
  steps: ModuleStep[];
}

export type TeacherBlockType = "FlashcardSet" | "MCQQuiz" | "Flashcard";

export interface TeacherBlock {
  type: TeacherBlockType;
  chapterIndex: number;
  position: number;
  cards?: FlashcardItem[];
  questions?: MCQItem[];
}

export interface ModuleStructure {
  unitId: string;
  chapters: ChapterModule[];
  teacherBlocks: TeacherBlock[];
}

export interface ItemMastery {
  itemId: string;
  alpha: number;
  beta: number;
  wrongCount: number;
  lastResult?: "correct" | "incorrect";
}

export interface AttemptResponse {
  mastery: ItemMastery;
  shouldResurface: boolean;
}
