import { useState } from "react";
import type { AppShellConfig, OnboardingQuestion } from "../../types";

function Field({
  q,
  value,
  onChange,
  accent,
}: {
  q: OnboardingQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  accent: string;
}) {
  const single = typeof value === "string" ? value : "";
  const many = Array.isArray(value) ? value : [];

  if (q.type === "single-choice") {
    return (
      <div className="space-y-1.5">
        {q.options.map((o) => {
          const on = single === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className="w-full rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors"
              style={{ borderColor: on ? accent : "#e5e7eb", background: on ? `${accent}14` : "#fff", color: "#374151" }}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "multi-select") {
    return (
      <div className="space-y-1.5">
        {q.options.map((o) => {
          const on = many.includes(o);
          return (
            <button
              key={o}
              onClick={() => onChange(on ? many.filter((x) => x !== o) : [...many, o])}
              className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors"
              style={{ borderColor: on ? accent : "#e5e7eb", background: on ? `${accent}14` : "#fff", color: "#374151" }}
            >
              <span
                className="grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded"
                style={{ background: on ? accent : "#fff", border: `1px solid ${on ? accent : "#d1d5db"}`, color: "#fff", fontSize: 9 }}
              >
                {on ? "✓" : ""}
              </span>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Yes", "No"].map((o) => {
          const on = single === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className="rounded-xl border py-3 text-xs font-semibold transition-colors"
              style={{ borderColor: on ? accent : "#e5e7eb", background: on ? `${accent}14` : "#fff", color: "#374151" }}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  const ph: Record<string, string> = { text: "Your answer…", email: "you@email.com", phone: "+1 (555) 000-0000", date: "MM / DD / YYYY" };
  return (
    <input
      value={single}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ph[q.type] ?? "Your answer…"}
      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700 placeholder-gray-300 outline-none"
    />
  );
}

export function OnboardingScreen({
  config,
  onBack,
  onDone,
}: {
  config: AppShellConfig;
  onBack: () => void;
  onDone: () => void;
}) {
  const questions = config.onboardingQuestions;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});

  if (questions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-sm font-semibold text-gray-800">No onboarding questions</p>
        <p className="text-[11px] text-gray-400">Add questions in the Onboarding tab, or continue straight to home.</p>
        <button onClick={onDone} className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: config.accentColor, color: config.accentForeground }}>
          Continue
        </button>
      </div>
    );
  }

  const q = questions[Math.min(step, questions.length - 1)];
  const val = answers[step] ?? (q.type === "multi-select" ? [] : "");
  const answered = q.type === "multi-select" ? Array.isArray(val) && val.length > 0 : Boolean(val);
  const canContinue = !q.required || answered;
  const last = step === questions.length - 1;

  return (
    <div className="flex h-full flex-col px-5 pb-5 pt-3">
      <button
        onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}
        className="mb-4 flex items-center gap-1 self-start text-[10px] text-gray-400 hover:text-gray-600"
      >
        ‹ Back
      </button>

      <div className="mb-4 flex gap-1">
        {questions.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 rounded-full" style={{ background: i <= step ? config.accentColor : "#e5e7eb" }} />
        ))}
      </div>

      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="flex-1 pr-2 text-[13px] font-bold leading-snug text-gray-900">{q.prompt}</h2>
        {!q.required && <span className="mt-0.5 flex-shrink-0 text-[8px] font-semibold uppercase tracking-wider text-gray-400">Optional</span>}
      </div>

      <div className="flex-1 overflow-auto">
        <Field q={q} value={val} accent={config.accentColor} onChange={(v) => setAnswers((a) => ({ ...a, [step]: v }))} />
      </div>

      <button
        onClick={() => (last ? onDone() : setStep((s) => s + 1))}
        disabled={!canContinue}
        className="mt-3 w-full rounded-xl py-2.5 text-xs font-semibold transition-opacity"
        style={{ background: config.accentColor, color: config.accentForeground, opacity: canContinue ? 1 : 0.35 }}
      >
        {last ? "Continue" : "Next"}
      </button>
      {config.onboardingOptional && (
        <button onClick={onDone} className="mt-2 w-full text-center text-[10px] text-gray-400">
          Skip for now
        </button>
      )}
    </div>
  );
}
