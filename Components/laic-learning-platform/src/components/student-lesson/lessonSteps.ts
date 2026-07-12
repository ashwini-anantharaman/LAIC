export type LessonStepId =
  | "hook"
  | "build"
  | "study"
  | "quiz"
  | "flashcards"
  | "reflection"
  | "unit-test";

export const LESSON_STEP_LABELS: Record<LessonStepId, string> = {
  hook: "Hook",
  build: "Build intuition",
  study: "Study",
  quiz: "Quiz",
  flashcards: "Flashcards",
  reflection: "Reflection",
  "unit-test": "Unit test",
};

export function buildLessonStepPlan(input: {
  hasStudyContent: boolean;
  quizCount: number;
  flashcardCount: number;
  hasUnitTest: boolean;
}): LessonStepId[] {
  const steps: LessonStepId[] = ["hook", "build"];
  if (input.hasStudyContent) steps.push("study");
  if (input.quizCount > 0) steps.push("quiz");
  if (input.flashcardCount > 0) steps.push("flashcards");
  steps.push("reflection");
  if (input.hasUnitTest) steps.push("unit-test");
  return steps;
}
