import { useState } from "react";
import type { ReactNode } from "react";
import type { AppShellConfig, OnboardingQuestion } from "../../types";
import { PAL, Icon, labelIcon } from "../kit";

function OptionRow({ label, on, accent, onClick, multi, icon }: { label: string; on: boolean; accent: string; onClick: () => void; multi?: boolean; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors"
      style={{ border: `1.5px solid ${on ? accent : PAL.hairline}`, background: on ? `${accent}18` : PAL.card }}
    >
      {multi && (
        <span className="grid flex-shrink-0 place-items-center rounded" style={{ width: 18, height: 18, background: on ? accent : "transparent", border: `1.5px solid ${on ? accent : PAL.muted}` }}>
          {on && <Icon name="check" size={11} color={PAL.surface} stroke={2} />}
        </span>
      )}
      {icon}
      <span className="flex-1 text-[15px] font-semibold" style={{ color: PAL.ink }}>{label}</span>
      {!multi && on && <Icon name="check" size={17} color="#C3CCDD" stroke={1.7} />}
    </button>
  );
}

function Field({ q, value, onChange, accent }: { q: OnboardingQuestion; value: string | string[]; onChange: (v: string | string[]) => void; accent: string }) {
  const single = typeof value === "string" ? value : "";
  const many = Array.isArray(value) ? value : [];

  if (q.type === "single-choice") {
    // Show a leading icon only when every option maps to a real one (mixed sets
    // stay clean, matching the design).
    const iconed = q.options.every((o) => labelIcon(o) !== "grid");
    return (
      <div className="space-y-2.5">
        {q.options.map((o) => (
          <OptionRow key={o} label={o} on={single === o} accent={accent} onClick={() => onChange(o)}
            icon={iconed ? <Icon name={labelIcon(o)} size={20} color={single === o ? accent : "#9AA6BF"} stroke={1.4} /> : undefined} />
        ))}
      </div>
    );
  }
  if (q.type === "multi-select")
    return (
      <div className="space-y-2.5">
        {q.options.map((o) => (
          <OptionRow key={o} label={o} on={many.includes(o)} accent={accent} multi
            onClick={() => onChange(many.includes(o) ? many.filter((x) => x !== o) : [...many, o])} />
        ))}
      </div>
    );
  if (q.type === "boolean")
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {["Yes", "No"].map((o) => (
          <button key={o} onClick={() => onChange(o)} className="rounded-xl py-3.5 text-[15px] font-semibold"
            style={{ border: `1.5px solid ${single === o ? accent : PAL.hairline}`, background: single === o ? `${accent}18` : PAL.card, color: PAL.ink }}>
            {o}
          </button>
        ))}
      </div>
    );
  const ph: Record<string, string> = { text: "Your answer…", email: "you@email.com", phone: "+1 (555) 000-0000", date: "MM / DD / YYYY" };
  return (
    <input value={single} onChange={(e) => onChange(e.target.value)} placeholder={ph[q.type] ?? "Your answer…"}
      className="w-full rounded-xl px-3.5 py-3 text-[14px] outline-none"
      style={{ background: PAL.card, border: `1px solid ${PAL.hairline}`, color: PAL.ink }} />
  );
}

export type OnboardingAnswers = Record<number, string | string[]>;

export function OnboardingScreen({
  config,
  onBack,
  onDone,
  initial,
  busy,
  error,
}: {
  config: AppShellConfig;
  onBack: () => void;
  onDone: (answers: OnboardingAnswers) => void;
  initial?: OnboardingAnswers;
  busy?: boolean;
  error?: string | null;
}) {
  const accent = config.accentColor;
  const questions = config.onboardingQuestions;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial ?? {});

  if (questions.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: PAL.surface }}>
        <p className="text-[15px] font-semibold" style={{ color: PAL.ink }}>No onboarding questions</p>
        <p className="text-[12px]" style={{ color: PAL.slate }}>Add questions in the Onboarding tab, or continue straight to home.</p>
        <button onClick={() => onDone(answers)} className="rounded-xl px-5 py-2.5 text-[14px] font-semibold" style={{ background: accent, color: config.accentForeground }}>Continue</button>
      </div>
    );

  const q = questions[Math.min(step, questions.length - 1)];
  const val = answers[step] ?? (q.type === "multi-select" ? [] : "");
  const answered = q.type === "multi-select" ? Array.isArray(val) && val.length > 0 : Boolean(val);
  const canContinue = !q.required || answered;
  const last = step === questions.length - 1;

  return (
    <div className="flex h-full flex-col px-6 pb-6 pt-3" style={{ background: PAL.surface }}>
      <div className="flex items-center gap-3.5">
        <button onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full" style={{ border: `1px solid ${PAL.hairline}` }}>
          <Icon name="chevronLeft" size={19} color={PAL.ink} />
        </button>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: PAL.muted }}>
          Step {step + 1} of {questions.length}{config.onboardingOptional ? " · Optional" : ""}
        </span>
        {config.onboardingOptional && (
          <button onClick={() => onDone(answers)} className="text-[14px] font-semibold" style={{ color: "#C3CCDD" }}>Skip</button>
        )}
      </div>

      <div className="mt-5 flex gap-1.5">
        {questions.map((_, i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? accent : PAL.hairline }} />)}
      </div>

      <h2 className="mt-7 text-[24px] font-semibold leading-tight tracking-tight" style={{ color: PAL.ink }}>{q.prompt}</h2>
      {q.helper && <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: PAL.slate }}>{q.helper}</p>}

      <div className="mt-6 flex-1 overflow-auto">
        <Field q={q} value={val} accent={accent} onChange={(v) => setAnswers((a) => ({ ...a, [step]: v }))} />
      </div>

      {error ? <p className="mt-2 text-[11px] leading-relaxed text-red-400">{error}</p> : null}
      <button
        onClick={() => (last ? onDone(answers) : setStep((s) => s + 1))}
        disabled={!canContinue || busy}
        className="mt-4 w-full rounded-full py-3.5 text-[15px] font-semibold transition-opacity"
        style={{ background: accent, color: config.accentForeground, opacity: canContinue && !busy ? 1 : 0.35 }}
      >
        {last ? (busy ? "Saving…" : "Continue") : "Next"}
      </button>
    </div>
  );
}
