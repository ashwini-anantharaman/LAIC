/**
 * Onboarding — spec §11.3. Renders the config's question list, filtered by the
 * selected role, and posts answers through the injected platform client.
 */
import { useEffect, useMemo, useState } from "react";
import type { AppShellConfig, OnboardingQuestion, ShellPlatformClient } from "../types";

function visible(q: OnboardingQuestion, role: string): boolean {
  return !q.visibleForRoles || q.visibleForRoles.includes(role);
}

export function OnboardingRenderer({
  config,
  client,
  role,
  onDone,
}: {
  config: AppShellConfig;
  client: ShellPlatformClient;
  role: string;
  onDone: () => void;
}) {
  const questions = useMemo(
    () => config.onboarding.questions.filter((q) => visible(q, role)),
    [config, role],
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setAnswers((prev) => ({ ...prev, [k]: v }));

  // Nothing to ask this role — record the empty pass and continue through.
  useEffect(() => {
    if (questions.length === 0) {
      void client.submitOnboarding({ selectedRole: role, answers: {} }).then(onDone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    for (const q of questions) {
      const v = answers[q.key];
      if (q.required && (v === undefined || v === "" || (Array.isArray(v) && v.length === 0))) {
        setError(`"${q.label}" is required`);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await client.submitOnboarding({ selectedRole: role, answers });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  function renderQuestion(q: OnboardingQuestion) {
    const v = answers[q.key];
    switch (q.type) {
      case "single_select":
        return (
          <div className="choice-row">
            {(q.options || []).map((o) => (
              <button key={o.value} type="button" className={`choice${v === o.value ? " on" : ""}`} onClick={() => set(q.key, o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "multi_select": {
        const arr = Array.isArray(v) ? (v as string[]) : [];
        return (
          <div className="choice-row">
            {(q.options || []).map((o) => {
              const on = arr.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={`choice${on ? " on" : ""}`}
                  onClick={() => set(q.key, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "boolean":
        return (
          <div className="choice-row">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map((o) => (
              <button key={String(o.value)} type="button" className={`choice${v === o.value ? " on" : ""}`} onClick={() => set(q.key, o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "date":
        return <input type="date" value={(v as string) || ""} onChange={(e) => set(q.key, e.target.value)} />;
      case "email":
        return <input type="email" value={(v as string) || ""} onChange={(e) => set(q.key, e.target.value)} placeholder="you@example.com" />;
      default:
        return <input type="text" value={(v as string) || ""} onChange={(e) => set(q.key, e.target.value)} />;
    }
  }

  if (questions.length === 0) return <div className="loading-page">Setting up…</div>;

  return (
    <div className="panel-page">
      <h2 className="rise d1">A few quick questions</h2>
      <p className="panel-note rise d2">This helps {config.identity.shortName} set up the right experience for you.</p>
      <form onSubmit={submit}>
        {questions.map((q, i) => (
          <div key={q.key} className={`field rise d${Math.min(3 + i, 6)}`}>
            <label>
              {q.label}
              {q.required ? " *" : ""}
            </label>
            {renderQuestion(q)}
          </div>
        ))}
        <button className="btn-primary rise d6" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
