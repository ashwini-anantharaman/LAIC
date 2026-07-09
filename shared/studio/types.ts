/** Shared Brain Bee studio model (client + server). */

export type ContentPolicy = "strict" | "generate" | "open";

export type ModuleImportance = "core" | "featured" | "optional";

export type StudioBlockType =
  | "hook"
  | "study"
  | "check"
  | "quiz"
  | "case"
  | "animation"
  | "flashcards"
  | "reflection"
  | "image";

export type InlineCheck = {
  concept: string;
  stem: string;
  opts: string[];
  ans: number;
  exp: string;
};

export type StudySource = {
  cite: string;
  quote?: string;
  page?: number;
};

export type QuizPoolItem = {
  stem: string;
  opts: string[];
  ans: number;
  exp: string;
};

export type QuizConcept = {
  id: string;
  name: string;
  pool: QuizPoolItem[];
};

export type AnimationStep = {
  region: string;
  head: string;
  text: string;
};

export type StudioBlock =
  | { id: string; type: "hook"; q: string; sub: string }
  | {
      id: string;
      type: "study";
      kind: string;
      title: string;
      html: string;
      src: StudySource;
      check: InlineCheck | null;
    }
  | { id: string; type: "check"; concept: string; stem: string; opts: string[]; ans: number; exp: string }
  | { id: string; type: "quiz"; concepts: QuizConcept[] }
  | {
      id: string;
      type: "case";
      name: string;
      tag: string;
      color: string;
      rows: [string, string][];
      lesson: string;
    }
  | { id: string; type: "animation"; title: string; steps: AnimationStep[] }
  | { id: string; type: "flashcards"; cards: [string, string][] }
  | { id: string; type: "reflection"; prompt: string }
  | { id: string; type: "image"; src: string | null; caption: string; alt: string };

export type StudioPage = {
  id: string;
  moduleId?: string;
  title: string;
  importance: ModuleImportance;
  blocks: StudioBlock[];
};

export type StudioToolKind = "cases" | "cards" | "vocab" | "custom";

export type StudioTool = {
  id: string;
  kind: StudioToolKind;
  name: string;
  items: unknown[];
};

export type StudioCourseData = {
  policy: ContentPolicy;
  pages: StudioPage[];
  tools: StudioTool[];
  vocab: [string, string, number][];
  cards: [string, string][];
};

export type GeneratedStudioModule = {
  hook: { q: string; sub: string };
  lessons: {
    kind: string;
    title: string;
    html: string;
    src: StudySource;
    check: InlineCheck;
  }[];
  cases: {
    name: string;
    tag: string;
    color: string;
    rows: [string, string][];
    lesson: string;
  }[];
  animation: { title: string; steps: AnimationStep[] };
  quiz: { concepts: QuizConcept[] };
  vocab: [string, string][];
  cards: [string, string][];
  importance?: ModuleImportance;
};
