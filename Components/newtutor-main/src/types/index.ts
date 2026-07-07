export type Role = "student" | "instructor";

export type Screen =
  | "landing"
  | "login"
  | "student-onboarding"
  | "instructor-onboarding"
  | "student-courses"
  | "student-sets"
  | "student-workspace"
  | "student-assistant"
  | "student-concept"
  | "student-reflection"
  | "student-mastery"
  | "student-challenge"
  | "student-tools"
  | "student-settings"
  | "instructor-home"
  | "instructor-course"
  | "instructor-preview"
  | "instructor-preview-concept"
  | "instructor-create"
  | "instructor-dashboard"
  | "instructor-challenge"
  | "instructor-settings";

export type MasteryLevel =
  | "not-seen"
  | "exposed"
  | "practiced"
  | "understood"
  | "mastered";

export type ContentMode = "real-world" | "conversational" | "textbook";

export type BlockType =
  | "Text"
  | "Animation"
  | "MCQ"
  | "Flashcard"
  | "Reflection"
  | "Video"
  | "Test";

export interface TestQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number;
  hints?: unknown;
}

export interface TestBlockContent {
  title: string;
  passPct: number;
  questions: TestQuestion[];
}

export type RAGSourceStatus = "indexing" | "transcribing" | "ready" | "error";

export interface RAGSource {
  id: string;
  name: string;
  type: string;
  status: RAGSourceStatus;
  detail: string;
}

export interface RagCourseStatus {
  chunkCount: number;
  sourceCount: number;
  readyCount: number;
  indexingCount: number;
  errorCount: number;
}

export interface PrerequisiteEdge {
  from: string;
  to: string;
}

export interface StudentCourseEnrollment {
  courseId: string;
  title: string;
  subject: string | null;
  instructorName: string;
}

export interface InstructorCourseSummary {
  id: string;
  title: string;
  published: boolean;
}

export interface CourseModule {
  id: string;
  name: string;
  chapter: string;
  chapterLabel: string;
  prereqs: string[];
  blocks: ContentBlock[];
  conceptId?: string;
}

export interface ContentBlock {
  id: string;
  type: BlockType;
  label: string;
  title?: string;
  content?: Record<string, unknown>;
}
export interface ConceptAvailability {
  modes: ContentMode[];
  hasInteractive: boolean;
}

export interface LearnerModel {
  name: string;
  email: string;
  age: string | null;
  goal: string | null;
  defaultMode: ContentMode;
  sessionLength: string | null;
  streak: number;
  conceptMastery: Record<string, MasteryLevel>;
  conceptBkt: Record<string, number>;
  reflections: StoredReflection[];
  modeSwitchLog: ModeSwitchEvent[];
  misconceptions: MisconceptionLog[];
  completedReflectionForConcept: Record<string, boolean>;
  lastSessionConcept: string | null;
}

export interface InstructorProfile {
  name: string;
  template: string | null;
  preferences: {
    autoGenerateModes: boolean;
    suggestPrereqGraph: boolean;
    recommendVideos: boolean;
    flagStrugglingStudents: boolean;
  };
  defaultModes: Record<ContentMode, boolean>;
}

export interface ModeSwitchEvent {
  conceptId: string;
  from: ContentMode;
  to: ContentMode;
  timestamp: number;
}

export interface MisconceptionLog {
  conceptId: string;
  questionId: string;
  wrongAnswer: string;
  timestamp: number;
}

export interface StoredReflection {
  conceptId: string;
  answers: string[];
  timestamp: number;
  shallow?: boolean;
}

export interface PlannerRecommendation {
  conceptId: string;
  conceptName: string;
  mode: ContentMode;
  estimatedMinutes: number;
  reason: string;
}

export interface QuizResult {
  correct: boolean;
  newMastery: MasteryLevel;
  message: string;
  moduleComplete?: boolean;
  shouldGenerateNext?: boolean;
  newBktScore?: number;
  misconception?: string;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  jumpTimestamp?: number;
}

export interface AssistantContext {
  conceptId: string;
  conceptName: string;
  mode: ContentMode;
  blockType?: BlockType;
  onQuiz: boolean;
}

export interface ReflectionResult {
  accepted: boolean;
  followUp?: string;
  message: string;
}

export interface CourseState {
  published: boolean;
  modules: CourseModule[];
  prerequisiteGraph: PrerequisiteEdge[];
  conceptAvailability: Record<string, ConceptAvailability>;
}
