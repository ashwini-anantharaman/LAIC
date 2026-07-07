import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import type { ContentMode } from "../types";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { blocksForConcept } from "../lib/content-blocks";
import {
  CONTENT_TO_OWLWISE,
  OWLWISE_TO_CONTENT,
  type OwlwiseMode,
} from "../constants/owlwiseTheme";
import { FloatingLessonChat } from "../components/FloatingLessonChat";
import { LessonShell } from "../components/student-lesson/LessonShell";
import { HookStep } from "../components/student-lesson/steps/HookStep";
import { deriveHookContent } from "../components/student-lesson/hookContent";
import { BuildIntuitionStep } from "../components/student-lesson/steps/BuildIntuitionStep";
import { StudyStep } from "../components/student-lesson/steps/StudyStep";
import { LessonQuizStep } from "../components/student-lesson/steps/LessonQuizStep";
import { LessonFlashcardsStep } from "../components/student-lesson/steps/LessonFlashcardsStep";
import { LessonReflectionStep } from "../components/student-lesson/steps/LessonReflectionStep";
import { LessonUnitTestStep } from "../components/student-lesson/steps/LessonUnitTestStep";
import { UnitCompleteModal } from "../components/student-lesson/UnitCompleteModal";
import {
  getLessonBlocks,
  mcqFromBlock,
  flashcardsFromBlock,
  testFromBlock,
} from "../components/student-lesson/lessonBlocks";
import {
  buildLessonStepPlan,
  LESSON_STEP_LABELS,
  type LessonStepId,
} from "../components/student-lesson/lessonSteps";
import {
  extractRawStudyTextFromBlocks,
  finalizeStudyBlocks,
  finalizeStudyBlocksFromRaw,
  type FormattedStudyBlock,
} from "../lib/study-format";
import { coerceStudyText } from "../lib/study-sections";
import { STUDENT_LESSON_NAV, type LessonNavigation } from "./preview/lessonNavigation";

type StudentConceptScreenProps = {
  lessonNav?: LessonNavigation;
};

export function StudentConceptScreen({ lessonNav = STUDENT_LESSON_NAV }: StudentConceptScreenProps) {
  const {
    activeConceptId,
    setActiveConceptId,
    setScreen,
    learner,
    logModeSwitch,
    concepts,
    courseId,
    modules,
    conceptAvailability,
    updateLearner,
    completeReflection,
  } = useApp();

  const concept = concepts.find((c) => c.id === activeConceptId) ?? concepts[0];
  const conceptId = concept?.id ?? "";
  const availability = conceptAvailability[conceptId] ?? { modes: [], hasInteractive: false };

  const availableOwlModes = useMemo(() => {
    const modes = availability.modes.map((m) => CONTENT_TO_OWLWISE[m]);
    return modes.length ? modes : (["interactive", "summary", "narrative"] as OwlwiseMode[]);
  }, [availability.modes]);

  const initialMode = CONTENT_TO_OWLWISE[learner.defaultMode] ?? "interactive";
  const [owlMode, setOwlMode] = useState<OwlwiseMode>(
    availableOwlModes.includes(initialMode) ? initialMode : availableOwlModes[0] ?? "interactive"
  );
  const [modeSwitched, setModeSwitched] = useState(false);
  const contentMode: ContentMode = OWLWISE_TO_CONTENT[owlMode];

  const [modeContent, setModeContent] = useState<{
    heading: string;
    body: string[];
    citation?: string;
  } | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [studyBlocks, setStudyBlocks] = useState<FormattedStudyBlock[]>([]);
  const [studyFormatLoading, setStudyFormatLoading] = useState(false);

  const conceptIndex = concepts.findIndex((c) => c.id === conceptId);

  const conceptBlocks = useMemo(
    () => (concept ? blocksForConcept(modules, conceptId, concept.name, conceptIndex) : []),
    [modules, conceptId, concept, conceptIndex]
  );

  const textBlocks = conceptBlocks.filter((b) => b.type === "Text");
  const hasTextBlock = textBlocks.length > 0;
  const lessonBlocks = useMemo(() => getLessonBlocks(conceptBlocks), [conceptBlocks]);
  const seedMcqs = useMemo(
    () => lessonBlocks.mcqs.map(mcqFromBlock).filter((m): m is NonNullable<typeof m> => m !== null),
    [lessonBlocks.mcqs]
  );
  const flashcards = useMemo(() => flashcardsFromBlock(lessonBlocks.flashcard), [lessonBlocks.flashcard]);
  const testContent = useMemo(() => testFromBlock(lessonBlocks.test), [lessonBlocks.test]);

  useEffect(() => {
    if (!courseId || !concept) return;
    if (hasTextBlock && !modeSwitched) {
      setModeContent(null);
      return;
    }
    setModeLoading(true);
    Agents.conceptTutor
      .getModeContent(courseId, concept.name, contentMode, concept.subtitle)
      .then((c) => setModeContent(c as { heading: string; body: string[]; citation?: string }))
      .catch(console.error)
      .finally(() => setModeLoading(false));
  }, [courseId, conceptId, contentMode, concept?.name, concept?.subtitle, hasTextBlock, modeSwitched]);

  const [lessonStep, setLessonStep] = useState(0);
  const [studyDone, setStudyDone] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [unitTestDone, setUnitTestDone] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setModeSwitched(false);
    setModeContent(null);
    setMessages([]);
    setChatOpen(false);
    setLessonStep(0);
    setQuizDone(false);
    setStudyDone(false);
    setUnitTestDone(false);
    setReflectionText("");
    setShowCompleteModal(false);
    setStudyBlocks([]);
  }, [conceptId]);

  const rawStudyText = useMemo(() => {
    if (textBlocks.length) {
      return extractRawStudyTextFromBlocks(textBlocks);
    }
    return coerceStudyText(concept?.subtitle ?? "");
  }, [textBlocks, concept?.subtitle]);

  /** Every generated module has a Text block — always show Study when one exists. */
  const hasStudyContent = textBlocks.length > 0 || rawStudyText.trim().length > 0;
  const stepPlan = useMemo(
    () =>
      buildLessonStepPlan({
        hasStudyContent,
        quizCount: seedMcqs.length,
        flashcardCount: flashcards.length,
        hasUnitTest: testContent !== null,
      }),
    [hasStudyContent, seedMcqs.length, flashcards.length, testContent]
  );
  const currentStepId: LessonStepId = stepPlan[lessonStep] ?? stepPlan[0] ?? "hook";

  useEffect(() => {
    if (lessonStep >= stepPlan.length) {
      setLessonStep(Math.max(0, stepPlan.length - 1));
    }
  }, [lessonStep, stepPlan.length]);

  useEffect(() => {
    if (!rawStudyText.trim()) {
      setStudyBlocks([]);
      setStudyFormatLoading(false);
      return;
    }
    let cancelled = false;
    setStudyBlocks([]);
    setStudyDone(false);
    setStudyFormatLoading(true);
    Agents.studyFormat
      .format(rawStudyText)
      .then((res) => {
        if (cancelled) return;
        const formatted = finalizeStudyBlocks(res.blocks ?? []);
        setStudyBlocks(formatted.length ? formatted : finalizeStudyBlocksFromRaw(rawStudyText));
      })
      .catch(() => {
        if (!cancelled) setStudyBlocks(finalizeStudyBlocksFromRaw(rawStudyText));
      })
      .finally(() => {
        if (!cancelled) setStudyFormatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conceptId, rawStudyText]);

  const nextConcept = concepts[conceptIndex + 1];

  const studyHeading = useMemo(() => {
    for (const block of textBlocks) {
      const c = block.content as Record<string, unknown>;
      const heading = typeof c.heading === "string" ? c.heading.trim() : "";
      if (heading) return coerceStudyText(heading);
      if (typeof block.title === "string" && block.title.trim()) return coerceStudyText(block.title.trim());
    }
    return concept?.name ?? "Lesson";
  }, [textBlocks, concept?.name]);

  const textContent = useMemo(() => {
    if (modeContent && (modeSwitched || !hasTextBlock)) {
      return {
        heading: modeContent.heading,
        body: modeContent.body,
      };
    }
    if (hasTextBlock && textBlocks[0]) {
      const c = textBlocks[0].content as Record<string, unknown>;
      const body = Array.isArray(c.body)
        ? (c.body as unknown[]).map((p) => coerceStudyText(p))
        : [coerceStudyText(c.body ?? "")].filter(Boolean);
      return {
        heading: (c.heading as string) ?? concept?.name ?? "Lesson",
        body,
      };
    }
    return {
      heading: concept?.name ?? "Lesson",
      body: [concept?.subtitle ?? "Loading lesson content…"],
    };
  }, [hasTextBlock, textBlocks, modeContent, modeSwitched, concept]);

  const switchMode = (m: OwlwiseMode) => {
    if (!availableOwlModes.includes(m) || m === owlMode) return;
    logModeSwitch(conceptId, contentMode, OWLWISE_TO_CONTENT[m]);
    setModeSwitched(true);
    setOwlMode(m);
  };

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatBusy || !courseId || !concept) return;
    setChatInput("");
    setMessages((m) => [...m, { from: "user", text: q }]);
    if (!chatOpen) setChatOpen(true);
    setChatBusy(true);
    try {
      const res = await Agents.studentAssistant.respond(
        q,
        { conceptId, conceptName: concept.name, mode: contentMode, onQuiz: false },
        courseId
      );
      setMessages((m) => [...m, { from: "ai", text: res.content }]);
    } catch {
      setMessages((m) => [...m, { from: "ai", text: "Sorry, I couldn't reach the tutor right now." }]);
    } finally {
      setChatBusy(false);
    }
  };

  const saveReflection = useCallback(
    async (text: string) => {
      if (!courseId || !conceptId || !text.trim()) return;
      try {
        await Agents.reflection.submitSessionReflection(conceptId, [text], courseId);
        completeReflection(conceptId);
      } catch {
        /* keep local text */
      }
    },
    [courseId, conceptId, completeReflection]
  );

  const finishUnit = () => {
    updateLearner({ lastSessionConcept: conceptId });
    setShowCompleteModal(false);
    if (nextConcept) {
      setActiveConceptId(nextConcept.id);
    } else {
      setScreen(lessonNav.workspaceScreen);
    }
  };

  const handleContinue = () => {
    if (currentStepId === "reflection" && reflectionText.trim()) {
      void saveReflection(reflectionText);
    }
    const isLast = lessonStep >= stepPlan.length - 1;
    if (isLast) {
      if (currentStepId === "unit-test" && !unitTestDone) return;
      setShowCompleteModal(true);
      return;
    }
    setLessonStep((s) => s + 1);
  };

  const handleBack = () => {
    if (lessonStep === 0) {
      setScreen(lessonNav.workspaceScreen);
      return;
    }
    setLessonStep((s) => s - 1);
  };

  const backLabel = lessonStep === 0 ? "Exit lesson" : "Back";

  if (!concept) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-zinc-400 mb-4">This course has no lessons yet.</p>
          <button
            type="button"
            onClick={() => setScreen(lessonNav.workspaceScreen)}
            className="px-6 py-3 bg-zinc-200 text-black rounded-full text-sm font-semibold"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  const conceptNav = useMemo(
    () =>
      concepts.map((c) => {
        const mastery = learner.conceptMastery[c.id];
        const done = mastery === "mastered" || mastery === "understood";
        return {
          id: c.id,
          name: c.name,
          status:
            c.id === conceptId ? ("current" as const) : done ? ("completed" as const) : ("upcoming" as const),
        };
      }),
    [concepts, conceptId, learner.conceptMastery]
  );

  const hookContent = useMemo(() => {
    const hookBody = studyBlocks[0]?.text
      ? [studyBlocks[0].text]
      : textContent.body;
    return deriveHookContent({
      conceptName: concept?.name ?? "this topic",
      subtitle: concept?.subtitle,
      heading: studyHeading,
      body: hookBody,
    });
  }, [studyBlocks, textContent.body, studyHeading, concept]);

  const animationContent = lessonBlocks.animation?.content as Record<string, unknown> | undefined;
  const buildTitle =
    (typeof animationContent?.description === "string" && animationContent.description) ||
    `Watch how ${concept.name.toLowerCase()} works`;
  const buildBody =
    studyBlocks[0]?.text ||
    coerceStudyText(textContent.body[0] ?? "") ||
    concept.subtitle ||
    "See the core idea in action before we dive deeper.";

  const stepTag = LESSON_STEP_LABELS[currentStepId] ?? "Lesson";
  const footerHint =
    currentStepId === "study" && studyBlocks.length > 0 && !studyDone
      ? "Work through each study section to continue"
      : currentStepId === "quiz" && !quizDone
        ? "Finish the quiz to continue"
        : currentStepId === "unit-test" && !unitTestDone
          ? "Complete the unit test to continue"
          : "Ready when you are";
  const continueDisabled =
    (currentStepId === "study" && studyBlocks.length > 0 && !studyDone) ||
    (currentStepId === "quiz" && !quizDone) ||
    (currentStepId === "unit-test" && !unitTestDone);

  const chat = (
    <FloatingLessonChat
      open={chatOpen}
      onOpenChange={setChatOpen}
      messages={messages}
      input={chatInput}
      onInputChange={setChatInput}
      onSend={() => void sendChat()}
      busy={chatBusy}
      conceptName={concept.name}
    />
  );

  let stepContent: ReactNode;
  switch (currentStepId) {
    case "hook":
      stepContent = <HookStep headline={hookContent.headline} subtext={hookContent.subtext} />;
      break;
    case "build":
      stepContent = (
        <BuildIntuitionStep
          title={buildTitle}
          body={buildBody}
          animationBlock={lessonBlocks.animation}
        />
      );
      break;
    case "study":
      stepContent = (
        <StudyStep
          conceptName={concept.name}
          heading={studyHeading}
          blocks={studyBlocks}
          loading={studyFormatLoading}
          mode={owlMode}
          availableModes={availableOwlModes}
          onModeChange={switchMode}
          onAllSectionsComplete={() => setStudyDone(true)}
        />
      );
      break;
    case "quiz":
      stepContent = (
        <LessonQuizStep
          mcqs={seedMcqs}
          conceptId={conceptId}
          conceptName={concept.name}
          onComplete={() => setQuizDone(true)}
        />
      );
      break;
    case "flashcards":
      stepContent = <LessonFlashcardsStep cards={flashcards} />;
      break;
    case "reflection":
      stepContent = (
        <LessonReflectionStep
          value={reflectionText}
          onChange={setReflectionText}
          onSave={(t) => void saveReflection(t)}
        />
      );
      break;
    case "unit-test":
      stepContent = (
        <LessonUnitTestStep
          content={testContent!}
          onSubmitted={() => setUnitTestDone(true)}
        />
      );
      break;
    default:
      stepContent = null;
  }

  useEffect(() => {
    if (
      currentStepId === "study" &&
      !studyBlocks.length &&
      !studyFormatLoading &&
      !hasStudyContent
    ) {
      setStudyDone(true);
    }
  }, [currentStepId, studyBlocks.length, studyFormatLoading, hasStudyContent]);

  return (
    <>
      <LessonShell
        concepts={conceptNav}
        stepIndex={lessonStep}
        totalSteps={stepPlan.length}
        stepTag={stepTag}
        footerHint={footerHint}
        onContinue={handleContinue}
        continueDisabled={continueDisabled}
        onBack={handleBack}
        backLabel={backLabel}
        onChatOpen={() => setChatOpen(true)}
        mainClassName={
          currentStepId === "study"
            ? "flex-1 flex flex-col px-6 sm:px-10 py-6 min-h-0 overflow-y-auto"
            : undefined
        }
      >
        {stepContent}
      </LessonShell>
      {chat}
      {showCompleteModal && (
        <UnitCompleteModal
          conceptName={concept.name}
          nextConceptName={nextConcept?.name}
          onContinue={finishUnit}
        />
      )}
    </>
  );
}
