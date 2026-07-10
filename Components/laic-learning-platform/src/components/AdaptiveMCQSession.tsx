import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Sparkles, Trophy } from "lucide-react";
import type { ContentBlock, MasteryLevel, QuizResult } from "../types";
import { MASTERY } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { MCQBlock } from "./MCQBlock";

function mcqFromBlock(block: ContentBlock) {
  const c = block.content ?? {};
  const question = c.question ?? block.title;
  const rawOptions = c.options;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(String)
    : rawOptions && typeof rawOptions === "object"
      ? Object.values(rawOptions as Record<string, string>).map(String)
      : [];
  if (!question || !options.length) return null;
  const correctRaw = c.correct;
  const correct =
    typeof correctRaw === "number"
      ? correctRaw
      : typeof correctRaw === "string"
        ? parseInt(correctRaw, 10)
        : 0;
  return {
    id: String(c.id ?? block.id),
    question: String(question),
    options,
    correct: Number.isFinite(correct) && correct >= 0 && correct < options.length ? correct : 0,
    hints: c.hints,
  };
}

function isMasteredLevel(level: MasteryLevel, bkt: number) {
  return level === "mastered" || bkt >= 0.88;
}

export function AdaptiveMCQSession({
  conceptId,
  conceptName,
  initialBlocks = [],
  preview = false,
}: {
  conceptId: string;
  conceptName: string;
  initialBlocks?: ContentBlock[];
  preview?: boolean;
}) {
  const { learner, courseId } = useApp();
  const mastery = learner.conceptMastery[conceptId] ?? "not-seen";
  const bkt = learner.conceptBkt[conceptId] ?? 0;

  const seedMcqs = useMemo(
    () =>
      initialBlocks
        .map(mcqFromBlock)
        .filter((m): m is NonNullable<typeof m> => m !== null),
    [initialBlocks]
  );

  const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [currentMcq, setCurrentMcq] = useState<(typeof seedMcqs)[0] | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [completeMessage, setCompleteMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [questionKey, setQuestionKey] = useState(0);

  const alreadyMastered = isMasteredLevel(mastery, bkt);

  const loadNextQuestion = useCallback(async (prevQuestions: string[]) => {
    if (!courseId || preview) return;
    setLoadingNext(true);
    setError(null);
    try {
      const res = await Agents.quizCoach.generateNext(
        courseId,
        conceptName,
        conceptId,
        learner.conceptMastery[conceptId] ?? "not-seen",
        prevQuestions
      );
      if (res.done) {
        setSessionComplete(true);
        setCompleteMessage("You've mastered this module — great work!");
        setCurrentMcq(null);
        return;
      }
      if (res.mcq) {
        setCurrentMcq(res.mcq);
        setQuestionKey((k) => k + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load next question");
    } finally {
      setLoadingNext(false);
    }
  }, [courseId, preview, conceptName, conceptId, learner.conceptMastery]);

  useEffect(() => {
    setAnsweredQuestions([]);
    setCorrectCount(0);
    setCurrentMcq(null);
    setSessionComplete(false);
    setPracticeMode(false);
    setCompleteMessage("");
    setError(null);
    setQuestionKey(0);
  }, [conceptId]);

  useEffect(() => {
    if (preview) {
      setCurrentMcq(seedMcqs[0] ?? null);
      return;
    }
    if (alreadyMastered && !practiceMode) {
      setSessionComplete(true);
      setCompleteMessage("You've already mastered this module.");
      return;
    }
    if (seedMcqs.length) {
      setCurrentMcq(seedMcqs[0]);
    } else if (courseId) {
      loadNextQuestion([]);
    }
  }, [conceptId, preview, alreadyMastered, practiceMode, seedMcqs, courseId, loadNextQuestion]);

  const startPractice = () => {
    setPracticeMode(true);
    setSessionComplete(false);
    setAnsweredQuestions([]);
    setCorrectCount(0);
    setError(null);
    if (seedMcqs.length) {
      setCurrentMcq(seedMcqs[0]);
      setQuestionKey((k) => k + 1);
    } else if (courseId) {
      loadNextQuestion([]);
    }
  };

  const handleAnswered = async (result: QuizResult, question: string) => {
    if (preview) return;

    setAnsweredQuestions((prev) => [...prev, question]);
    if (result.correct) setCorrectCount((n) => n + 1);

    if (result.moduleComplete) {
      setSessionComplete(true);
      setCompleteMessage(result.message);
      setCurrentMcq(null);
      return;
    }

    if (result.correct && result.shouldGenerateNext) {
      const nextPrev = [...answeredQuestions, question];
      const unusedSeed = seedMcqs.find(
        (m) => m.question === question ? false : !nextPrev.includes(m.question)
      );
      if (unusedSeed && !nextPrev.includes(unusedSeed.question)) {
        setCurrentMcq(unusedSeed);
        setQuestionKey((k) => k + 1);
      } else {
        await loadNextQuestion(nextPrev);
      }
    }
  };

  if (sessionComplete && !preview) {
    const level = learner.conceptMastery[conceptId] ?? mastery;
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-[#eef2ff] border border-emerald-200 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
          <Trophy className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-emerald-800 mb-1">Module mastered</p>
        <p className="text-sm text-[#62748e] mb-3">{completeMessage}</p>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
          style={{
            backgroundColor: MASTERY[level].color + "28",
            color: MASTERY[level].color,
          }}
        >
          <Sparkles className="w-3 h-3" />
          {MASTERY[level].label}
          {correctCount > 0 && ` · ${correctCount} correct this session`}
        </span>
        {alreadyMastered && (
          <button
            type="button"
            onClick={startPractice}
            className="block mx-auto px-4 py-2 bg-white border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl hover:bg-emerald-50 transition-colors"
          >
            Practice quiz anyway
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Adaptive quiz</p>
          <p className="text-[11px] text-[#62748e]">
            {preview
              ? `Interactive preview — ${seedMcqs.length} question${seedMcqs.length === 1 ? "" : "s"} in this module`
              : seedMcqs.length > 1
                ? `${seedMcqs.length} starter questions, then adaptive follow-ups until mastery`
                : "Questions adapt to your mastery until you master this module"}
          </p>
        </div>
        {!preview && (
          <div className="text-right">
            <p className="text-[10px] text-[#62748e] uppercase tracking-wide">Mastery</p>
            <p className="text-xs font-semibold text-[#314158]">{MASTERY[mastery].label}</p>
          </div>
        )}
      </div>

      {!preview && seedMcqs.length > 1 && !sessionComplete && (
        <p className="text-[10px] text-[#62748e] px-1">
          Question {Math.min(answeredQuestions.length + 1, seedMcqs.length)} of {seedMcqs.length} starter
          {answeredQuestions.length >= seedMcqs.length ? " · generating more…" : ""}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {loadingNext && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#62748e]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#f6339a]" />
          Generating your next question…
        </div>
      )}

      {!loadingNext && currentMcq && (
        <MCQBlock
          key={questionKey}
          conceptId={conceptId}
          mcq={currentMcq}
          preview={preview}
          onAnswered={handleAnswered}
        />
      )}

      {!loadingNext && !currentMcq && !sessionComplete && (
        <div className="text-center py-8 text-sm text-[#62748e]">
          <Check className="w-5 h-5 mx-auto mb-2 text-emerald-500" />
          Loading quiz…
        </div>
      )}
    </div>
  );
}
