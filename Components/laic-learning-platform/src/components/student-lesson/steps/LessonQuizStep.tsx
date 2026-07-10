import { useState } from "react";
import { Check, Lightbulb, Sparkles, X } from "lucide-react";
import { useApp } from "../../../store/AppContext";
import { Agents } from "../../../agents";

function normalizeHints(hints: unknown): string[] {
  if (Array.isArray(hints)) {
    return hints.map((h) => (typeof h === "string" ? h : String((h as { text?: string }).text ?? ""))).filter(Boolean);
  }
  if (hints && typeof hints === "object") {
    return Object.values(hints as Record<string, string>).map(String).filter(Boolean);
  }
  return [];
}

export type LessonMcq = {
  id: string;
  question: string;
  options: string[];
  correct: number;
  hints: unknown;
  explanation?: string;
};

export function LessonQuizStep({
  mcqs,
  conceptId,
  conceptName,
  onComplete,
}: {
  mcqs: LessonMcq[];
  conceptId: string;
  conceptName: string;
  onComplete: (firstTryCorrect: number) => void;
}) {
  const { courseId, learner, setLearnerMastery } = useApp();
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [attemptsOnQuestion, setAttemptsOnQuestion] = useState(0);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mcq = mcqs[qIndex];
  const hints = normalizeHints(mcq?.hints);
  const total = mcqs.length;
  const correct = submitted && selected === mcq?.correct;
  const wrong = submitted && selected !== null && selected !== mcq?.correct;

  if (!mcq) {
    return <p className="text-zinc-500 text-sm">No quiz questions for this lesson yet.</p>;
  }

  if (done) {
    return (
      <div className="w-full max-w-xl mx-auto text-center">
        <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center mx-auto mb-6">
          <Sparkles size={18} className="text-white" />
        </div>
        <h2
          className="text-[28px] sm:text-[34px] font-bold text-white mb-4"
          style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
        >
          Quiz complete
        </h2>
        <p className="text-[15px] text-zinc-400 leading-relaxed mb-2">
          You nailed <strong className="text-white font-semibold">{firstTryCorrect} of {total}</strong> on the
          first try. Every retry still counts as learning — nicely done.
        </p>
        <p className="text-sm text-zinc-500">Hit Continue below to keep going.</p>
      </div>
    );
  }

  const submit = async () => {
    if (selected === null || !courseId) return;
    setSubmitting(true);
    setSubmitted(true);
    const isCorrect = selected === mcq.correct;
    if (isCorrect && attemptsOnQuestion === 0) {
      setFirstTryCorrect((n) => n + 1);
    }
    setAttemptsOnQuestion((n) => n + 1);

    try {
      const currentMastery = learner.conceptMastery[conceptId] ?? "not-seen";
      const bkt = learner.conceptBkt[conceptId] ?? 0;
      const result = await Agents.quizCoach.submitAnswer(
        conceptId,
        mcq.id,
        selected,
        mcq.correct,
        currentMastery,
        courseId,
        mcq.question,
        mcq.options,
        hintsShown,
        bkt
      );
      setFeedback(result.message);
      if (result.correct) {
        setLearnerMastery(conceptId, result.newMastery, result.newBktScore);
        setTimeout(() => {
          if (qIndex + 1 >= total) {
            setDone(true);
            onComplete(firstTryCorrect + (attemptsOnQuestion === 0 ? 1 : 0));
          } else {
            setQIndex((i) => i + 1);
            setSelected(null);
            setSubmitted(false);
            setHintsShown(0);
            setAttemptsOnQuestion(0);
            setFeedback("");
          }
        }, 800);
      } else {
        setFeedback(
          mcq.explanation ||
            "That's not quite right — use the hints below and try again."
        );
      }
    } catch {
      if (isCorrect) {
        if (qIndex + 1 >= total) {
          setDone(true);
          onComplete(firstTryCorrect + (attemptsOnQuestion === 0 ? 1 : 0));
        } else {
          setQIndex((i) => i + 1);
          setSelected(null);
          setSubmitted(false);
          setHintsShown(0);
          setAttemptsOnQuestion(0);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setSubmitted(false);
    setSelected(null);
    setFeedback("");
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <Sparkles size={14} className="text-zinc-400" />
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-zinc-500">Quiz</p>
        </div>
        <p className="text-[11px] tracking-[0.15em] uppercase text-zinc-500 mb-3">
          Question {qIndex + 1} of {total}
        </p>
        <div className="flex justify-center gap-1.5 mb-6">
          {mcqs.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === qIndex ? "bg-white" : i < qIndex ? "bg-zinc-500" : "bg-zinc-700"}`}
            />
          ))}
        </div>
        <h2
          className="text-[22px] sm:text-[26px] font-bold text-white leading-snug"
          style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
        >
          {mcq.question}
        </h2>
      </div>

      <div className="space-y-2.5 mb-4">
        {mcq.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrectOpt = submitted && i === mcq.correct;
          const isWrongOpt = submitted && isSelected && i !== mcq.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={submitted && correct}
              onClick={() => !submitted && setSelected(i)}
              className={`w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-full border text-[15px] transition-all ${
                isCorrectOpt
                  ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                  : isWrongOpt
                    ? "border-red-500 text-red-400 bg-red-500/10"
                    : isSelected
                      ? "border-zinc-500 text-white bg-zinc-900"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              <span>{opt}</span>
              {isCorrectOpt && <Check size={18} className="text-emerald-500 shrink-0" />}
              {isWrongOpt && <X size={18} className="text-red-500 shrink-0" />}
            </button>
          );
        })}
      </div>

      {wrong && feedback && (
        <p className="text-sm text-red-400/90 bg-red-950/40 border border-red-900/50 rounded-2xl px-4 py-3 mb-4 text-center">
          {feedback}
        </p>
      )}

      {wrong && hints.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 mb-4">
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-3">
            <Lightbulb size={16} className="text-zinc-500" />
            Hints ({hintsShown}/{hints.length})
          </div>
          {hints.slice(0, hintsShown).map((h, i) => (
            <p key={i} className="text-sm text-zinc-400 bg-zinc-950/60 rounded-xl px-3 py-2 mb-2">
              {i + 1}. {h}
            </p>
          ))}
          {hintsShown < hints.length && (
            <button
              type="button"
              onClick={() => setHintsShown((n) => n + 1)}
              className="text-xs text-zinc-500 border border-zinc-700 rounded-full px-3 py-1.5 hover:text-zinc-300"
            >
              Reveal hint {hintsShown + 1}
            </button>
          )}
          <p className="text-[11px] text-zinc-600 mt-3">Take another shot when you&apos;re ready — pick again above.</p>
        </div>
      )}

      <div className="flex justify-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={selected === null || submitting}
            className="px-6 py-2.5 rounded-full bg-zinc-200 text-black text-sm font-semibold disabled:opacity-40"
          >
            Check answer
          </button>
        ) : wrong ? (
          <button
            type="button"
            onClick={retry}
            className="px-6 py-2.5 rounded-full border border-zinc-600 text-zinc-300 text-sm font-semibold"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
