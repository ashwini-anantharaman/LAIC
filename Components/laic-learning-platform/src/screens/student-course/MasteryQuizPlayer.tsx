import { useEffect, useMemo, useState } from "react";
import type { QuizConcept, StudioBlock } from "../../learning/types";

type QuizBlock = Extract<StudioBlock, { type: "quiz" }>;

type ConceptState = {
  id: string;
  name: string;
  pool: QuizConcept["pool"];
  poolIdx: number;
  attempts: number;
  mastered: boolean;
};

type QuizState = {
  ci: number;
  concepts: ConceptState[];
  phase: "ask" | "feedback";
  selected: number | null;
  lastCorrect: boolean;
  pending: "advance" | "retry" | "fresh" | null;
};

function initQuizState(block: QuizBlock): QuizState {
  return {
    ci: 0,
    concepts: block.concepts.map((c) => ({
      id: c.id,
      name: c.name,
      pool: c.pool,
      poolIdx: 0,
      attempts: 0,
      mastered: false,
    })),
    phase: "ask",
    selected: null,
    lastCorrect: false,
    pending: null,
  };
}

export function MasteryQuizPlayer({
  block,
  pageTitle,
  onAllMastered,
}: {
  block: QuizBlock;
  pageTitle: string;
  onAllMastered: (done: boolean) => void;
}) {
  const [state, setState] = useState<QuizState>(() => initQuizState(block));

  useEffect(() => {
    setState(initQuizState(block));
  }, [block.id]);

  const done = state.concepts.filter((c) => c.mastered).length;
  const total = state.concepts.length;
  const allDone = done === total;
  const concept = state.concepts[state.ci];
  const question = concept?.pool[concept.poolIdx % concept.pool.length];

  useEffect(() => {
    onAllMastered(allDone);
  }, [allDone, onAllMastered]);

  if (!concept || !question) {
    return <p className="studio-empty">No quiz questions in this block.</p>;
  }

  const select = (index: number) => {
    if (state.phase === "feedback") return;
    const correct = index === question.ans;
    setState((prev) => {
      const concepts = prev.concepts.map((c, i) => {
        if (i !== prev.ci) return c;
        if (correct) return { ...c, mastered: true };
        const attempts = c.attempts + 1;
        return { ...c, attempts };
      });
      const pending: QuizState["pending"] = correct
        ? "advance"
        : concepts[prev.ci].attempts >= 2
          ? "fresh"
          : "retry";
      return {
        ...prev,
        concepts,
        phase: "feedback",
        selected: index,
        lastCorrect: correct,
        pending,
      };
    });
  };

  const next = () => {
    setState((prev) => {
      const concepts = [...prev.concepts];
      const c = concepts[prev.ci];
      if (prev.pending === "advance") {
        const nextIdx = concepts.findIndex((cc) => !cc.mastered);
        if (nextIdx > -1) {
          return {
            ...prev,
            concepts,
            ci: nextIdx,
            phase: "ask",
            selected: null,
            pending: null,
          };
        }
      } else if (prev.pending === "fresh") {
        concepts[prev.ci] = { ...c, poolIdx: c.poolIdx + 1, attempts: 0 };
      }
      return {
        ...prev,
        concepts,
        phase: "ask",
        selected: null,
        pending: null,
      };
    });
  };

  const masterbar = state.concepts.map((c, i) => (
    <i key={c.id} className={c.mastered ? "got" : ""} style={i === state.ci && !c.mastered ? { opacity: 0.9 } : undefined} />
  ));

  return (
    <>
      <div className="studio-center" style={{ marginBottom: 18 }}>
        <div className="studio-kick">Prove it · mastery loop</div>
        <h2 className="studio-mid">{pageTitle}</h2>
      </div>
      <div className="studio-qbox">
        <div className="studio-qmeta">
          <span className="concept">
            Concept {state.ci + 1}/{total} · {concept.name}
          </span>
          <span className="tries">
            Mastered {done}/{total}
          </span>
        </div>
        <div className="studio-masterbar">{masterbar}</div>
        <div className="studio-qstem">{question.stem}</div>
        {question.opts.map((option, index) => {
          let cls = "studio-opt";
          if (state.phase === "feedback") {
            if (index === question.ans) cls += " correct";
            else if (index === state.selected && !state.lastCorrect) cls += " wrong";
          } else if (state.selected === index) {
            cls += " sel";
          }
          return (
            <button
              key={`${option}-${index}`}
              type="button"
              className={cls}
              disabled={state.phase === "feedback"}
              onClick={() => select(index)}
            >
              <span className="k">{String.fromCharCode(65 + index)}</span>
              {option}
            </button>
          );
        })}
        {state.phase === "feedback" && (
          <>
            <div
              className={`studio-feedback show ${
                state.lastCorrect ? "good" : state.pending === "retry" ? "retry" : "moved"
              }`}
              style={{ display: "block" }}
            >
              {state.lastCorrect ? `✓ Correct. ${question.exp}` : state.pending === "retry" ? "Not quite — read it once more, then try again." : "Let's reinforce this with a fresh question on the same concept."}
            </div>
            {!allDone || !state.lastCorrect ? (
              <button type="button" className="sc-btn ghost" style={{ marginTop: 14 }} onClick={next}>
                {state.lastCorrect ? (allDone ? "Finish — all concepts mastered" : "Next concept →") : state.pending === "retry" ? "Try this question again" : "New question →"}
              </button>
            ) : null}
          </>
        )}
      </div>
      <p className="studio-center" style={{ color: "var(--dim)", fontSize: 13, marginTop: 14 }}>
        Get a concept right and it locks in (green). Miss it and you&apos;ll get another try, then a fresh question on the same idea.
      </p>
    </>
  );
}
