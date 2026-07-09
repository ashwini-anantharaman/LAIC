import { useState } from "react";
import { Check, ClipboardCheck, RotateCcw, X } from "lucide-react";
import type { TestBlockContent } from "../types";

/**
 * Fixed-length module test. Unlike the adaptive quiz there are no hints and
 * no per-question feedback — answers are scored together at the end.
 */
export function TestSession({
  content,
  preview = false,
  onComplete,
}: {
  content: TestBlockContent;
  preview?: boolean;
  onComplete?: (scorePct: number, passed: boolean) => void;
}) {
  const questions = Array.isArray(content.questions) ? content.questions : [];
  const passPct = Number(content.passPct) || 80;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions.length) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 text-sm text-[#62748e]">
        This test has no questions — regenerate the block.
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.filter((q, i) => answers[i] === q.correct).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);
  const passed = scorePct >= passPct;

  const submit = () => {
    setSubmitted(true);
    onComplete?.(scorePct, scorePct >= passPct);
  };

  const retake = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardCheck className="w-4 h-4 text-[#602424]" />
        <h3 className="text-sm font-bold text-[#0f172b]">{content.title || "Module test"}</h3>
      </div>
      <p className="text-xs text-[#62748e] mb-4">
        {questions.length} questions · pass at {passPct}% · answers are scored at the end
        {preview ? " · instructor preview" : ""}
      </p>

      {submitted && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            passed
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          Score: {correctCount}/{questions.length} ({scorePct}%) — {passed ? "passed 🎉" : `below the ${passPct}% pass mark`}
        </div>
      )}

      <div className="space-y-5">
        {questions.map((q, qi) => (
          <div key={q.id ?? qi}>
            <p className="text-sm font-semibold text-[#314158] mb-2">
              {qi + 1}. {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const selected = answers[qi] === oi;
                const showCorrect = submitted && oi === q.correct;
                const showWrong = submitted && selected && oi !== q.correct;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                    className={`w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-xl border transition-all ${
                      showCorrect
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : showWrong
                          ? "border-red-300 bg-red-50 text-red-700"
                          : selected
                            ? "border-[#602424] bg-[#e8ddd6]/50 text-[#314158]"
                            : "border-[#e2e8f0] text-[#314158] hover:border-[#602424]"
                    } disabled:cursor-default`}
                  >
                    <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">
                      {showCorrect ? <Check className="w-3 h-3" /> : showWrong ? <X className="w-3 h-3" /> : String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-[#62748e]">
          {submitted ? "" : `${answeredCount}/${questions.length} answered`}
        </span>
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={answeredCount < questions.length}
            className="px-5 py-2 bg-[#602424] text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-all"
          >
            Submit test
          </button>
        ) : (
          <button
            type="button"
            onClick={retake}
            className="px-4 py-2 bg-white border border-[#e2e8f0] text-[#314158] text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-[#f8fafc]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retake
          </button>
        )}
      </div>
    </div>
  );
}
