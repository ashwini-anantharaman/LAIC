import { useState } from "react";
import { Check, X } from "lucide-react";
import type { QuizResult } from "../types";
import { HINT_LABELS, MUTED_BTN } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";

function normalizeMcqHints(hints: unknown): { level: string; text: string }[] {
  if (Array.isArray(hints)) {
    return hints.map((h) =>
      typeof h === "string"
        ? { level: "Hint", text: h }
        : {
            level: String((h as { level?: string }).level ?? "Hint"),
            text: String((h as { text?: string }).text ?? ""),
          }
    );
  }
  if (hints && typeof hints === "object") {
    return Object.entries(hints as Record<string, string>).map(([level, text]) => ({
      level,
      text: String(text),
    }));
  }
  return [];
}

export function MCQBlock({
  conceptId,
  mcq,
  preview = false,
  onAnswered,
}: {
  conceptId: string;
  mcq: { id: string; question: string; options: string[]; correct: number; hints: unknown };
  preview?: boolean;
  onAnswered?: (result: QuizResult, question: string, hintsUsed: number) => void;
}) {
  const { learner, setLearnerMastery, courseId } = useApp();
  const hints = normalizeMcqHints(mcq.hints);
  const options = Array.isArray(mcq.options) ? mcq.options : [];
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [resultMsg, setResultMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const correct = submitted && selected === mcq.correct;
  const wrong = submitted && selected !== mcq.correct;

  const handleSubmit = async () => {
    if (selected === null) return;

    if (preview) {
      setSubmitted(true);
      const isCorrect = selected === mcq.correct;
      setResultMsg(
        isCorrect
          ? "Correct! (Preview — answers are not saved.)"
          : "Not quite — check the hints above. (Preview)"
      );
      return;
    }

    if (!courseId) return;
    setSubmitting(true);
    setSubmitted(true);
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
        options,
        hintsShown,
        bkt
      );
      setResultMsg(result.message);
      if (result.correct) {
        setLearnerMastery(conceptId, result.newMastery, result.newBktScore);
      }
      onAnswered?.(result, mcq.question, hintsShown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#eef2ff] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#eef2ff] bg-[#f8fafc]/60">
        <span className="text-xs font-bold text-[#f6339a] bg-[#eef2ff] px-2 py-0.5 rounded-full">MCQ</span>
        <span className="text-xs text-[#62748e]">
          Quiz Coach · {hints.length} hints · {preview ? "preview" : "adaptive"}
        </span>
      </div>
      <div className="p-5">
        <p className="text-[#314158] font-semibold text-sm mb-4 leading-relaxed">{mcq.question}</p>
        <div className="space-y-2 mb-4">
          {options.map((opt, i) => {
            let cls = "border-[#eef2ff] bg-white text-[#314158] hover:border-[#f6339a] hover:bg-[#eef2ff]/40";
            if (!submitted && selected === i) cls = "border-[#f6339a] bg-[#eef2ff] text-[#9d5b8a] ring-2 ring-[#f6339a]/10";
            if (submitted && i === mcq.correct) cls = "border-green-400 bg-green-50 text-green-800";
            if (submitted && i === selected && i !== mcq.correct) cls = "border-red-400 bg-red-50 text-red-700";
            return (
              <button
                key={i}
                type="button"
                disabled={submitted}
                onClick={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[14px] border text-sm text-left transition-all cursor-pointer ${cls} ${submitted ? "cursor-default" : ""}`}
              >
                <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center shrink-0 text-xs font-bold">
                  {submitted && i === mcq.correct ? (
                    <Check className="w-3 h-3" />
                  ) : submitted && i === selected ? (
                    <X className="w-3 h-3" />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {!correct && (
          <div className="mb-4 space-y-2">
            {hints.slice(0, hintsShown).map((hint, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5"
              >
                <div className="shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    {HINT_LABELS[i]}
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">{hint.text}</p>
              </div>
            ))}
            {hintsShown < hints.length && !submitted && (
              <button
                type="button"
                onClick={() => setHintsShown((h) => h + 1)}
                className="flex items-center gap-1.5 text-xs text-[#62748e] hover:text-[#f6339a] transition-colors"
              >
                <span className="opacity-60">⊘</span>
                {HINT_LABELS[hintsShown]} hint ({hintsShown + 1}/{hints.length})
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {!submitted ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selected === null || submitting}
              className={`px-4 py-2 bg-[#432dd7] text-[#312c85] text-sm rounded-full font-semibold hover:bg-[#432dd7] transition-all ${MUTED_BTN}`}
            >
              Submit answer
            </button>
          ) : (
            <div
              className={`flex items-center gap-2 text-sm font-semibold ${correct ? "text-green-700" : "text-red-600"}`}
            >
              {correct ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {resultMsg || (correct ? "Correct! Mastery updated ✨" : "Not quite — check the hints above.")}
            </div>
          )}
          {wrong && (
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setSelected(null);
                setResultMsg("");
              }}
              className="text-sm text-[#62748e] hover:text-[#62748e] transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
