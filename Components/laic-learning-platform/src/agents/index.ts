import type {
  AssistantContext,
  AssistantMessage,
  ContentMode,
  LearnerModel,
  MasteryLevel,
  PlannerRecommendation,
  PrerequisiteEdge,
  QuizResult,
  ReflectionResult,
  RAGSource,
} from "../types";
import { AgentAPI } from "../lib/api";

export const OrchestratorAgent = {
  async detectIntent(message: string) {
    return AgentAPI.assistantChat({ message, conceptId: "", conceptName: "", mode: "conversational", onQuiz: false });
  },
  async selectMode(learner: LearnerModel, _conceptId: string): Promise<ContentMode> {
    return learner.defaultMode;
  },
};

export const ConceptTutorAgent = {
  async queryRAG(_sources: RAGSource[], query: string, courseId: string) {
    return AgentAPI.queryRAG(courseId, query);
  },
  async draftCourseStructure(prompt: string, courseId: string) {
    return AgentAPI.draftCourse(courseId, prompt);
  },
  async getModeContent(courseId: string, conceptName: string, mode: ContentMode, subtitle?: string) {
    return AgentAPI.conceptContent(courseId, conceptName, mode, subtitle);
  },
  async generateMCQ(courseId: string, conceptName: string) {
    return AgentAPI.generateMCQ(courseId, conceptName);
  },
  async generateFlashcards(courseId: string, conceptName: string) {
    return AgentAPI.generateFlashcards(courseId, conceptName);
  },
  async generateTest(courseId: string, conceptName: string) {
    return AgentAPI.generateTest(courseId, conceptName);
  },
  async generateReflectionPrompt(courseId: string, conceptName: string) {
    return AgentAPI.generateReflectionPrompt(courseId, conceptName);
  },
  async generateModuleLesson(
    courseId: string,
    moduleName: string,
    opts?: { chapter?: string; subtitle?: string; prereqs?: string[] }
  ) {
    return AgentAPI.generateModuleLesson(courseId, moduleName, opts);
  },
};

export const QuizCoachAgent = {
  async submitAnswer(
    conceptId: string,
    questionId: string,
    selectedIndex: number,
    correctIndex: number,
    currentMastery: MasteryLevel,
    courseId: string,
    question: string,
    options: string[],
    hintsUsed = 0,
    bktScore = 0
  ): Promise<QuizResult> {
    return AgentAPI.evaluateQuiz({
      courseId,
      conceptId,
      questionId,
      selectedIndex,
      correctIndex,
      currentMastery,
      question,
      options,
      hintsUsed,
      bktScore,
    }) as Promise<QuizResult>;
  },
  async generateNext(
    courseId: string,
    conceptName: string,
    conceptId: string,
    masteryLevel: string,
    previousQuestions: string[]
  ) {
    return AgentAPI.generateAdaptiveMCQ({
      courseId,
      conceptName,
      conceptId,
      masteryLevel,
      previousQuestions,
    });
  },
  getHintLevel(level: number): string {
    return ["Nudge", "Concept", "Direction", "Explanation"][level] ?? "Explanation";
  },
};

export const ReflectionAgent = {
  async submitReflection(conceptId: string, answers: string[], courseId: string): Promise<ReflectionResult> {
    return AgentAPI.evaluateReflection({ conceptId, answers, isSession: false, courseId });
  },
  async submitSessionReflection(conceptId: string, answers: string[], courseId: string): Promise<ReflectionResult> {
    return AgentAPI.evaluateReflection({ conceptId, answers, isSession: true, courseId });
  },
};

export const PlannerAgent = {
  async getNextConcept(
    learner: LearnerModel,
    graph: PrerequisiteEdge[],
    concepts: { id: string; name: string }[],
    courseId: string
  ): Promise<PlannerRecommendation> {
    return AgentAPI.plannerNext({
      masteryJson: JSON.stringify(learner.conceptMastery),
      prerequisiteEdges: graph,
      concepts,
      defaultMode: learner.defaultMode,
      courseId,
    }) as Promise<PlannerRecommendation>;
  },
  async getPostReflectionRecommendation(
    completedConceptId: string,
    learner: LearnerModel,
    graph: PrerequisiteEdge[],
    concepts: { id: string; name: string }[],
    courseId: string
  ): Promise<PlannerRecommendation> {
    return AgentAPI.plannerNext({
      masteryJson: JSON.stringify(learner.conceptMastery),
      prerequisiteEdges: graph,
      concepts,
      defaultMode: learner.defaultMode,
      completedConceptId,
      courseId,
    }) as Promise<PlannerRecommendation>;
  },
  canAdvanceToConcept(learner: LearnerModel, targetConceptId: string, conceptOrder: string[]): boolean {
    const idx = conceptOrder.indexOf(targetConceptId);
    if (idx <= 0) return true;
    const prev = conceptOrder[idx - 1];
    return !!learner.completedReflectionForConcept[prev];
  },
};

export const StudentAssistantAgent = {
  async respond(message: string, context: AssistantContext, courseId: string, pastReflections?: string[]): Promise<AssistantMessage> {
    return AgentAPI.assistantChat({
      courseId,
      message,
      conceptId: context.conceptId,
      conceptName: context.conceptName,
      mode: context.mode,
      onQuiz: context.onQuiz,
      pastReflections,
    }) as Promise<AssistantMessage>;
  },
  async getGreeting(context: AssistantContext): Promise<string> {
    const res = await AgentAPI.assistantGreeting(context.conceptName, context.mode);
    return res.content;
  },
};

export const StudyFormatAgent = {
  async format(rawContent: string) {
    return AgentAPI.formatStudyContent(rawContent);
  },
};

export const AnimationAgent = {
  generate: AgentAPI.generateAnimation,
  generate3D: AgentAPI.generateScene3D,
};

export const Agents = {
  orchestrator: OrchestratorAgent,
  conceptTutor: ConceptTutorAgent,
  quizCoach: QuizCoachAgent,
  reflection: ReflectionAgent,
  planner: PlannerAgent,
  studentAssistant: StudentAssistantAgent,
  studyFormat: StudyFormatAgent,
  animation: AnimationAgent,
};
