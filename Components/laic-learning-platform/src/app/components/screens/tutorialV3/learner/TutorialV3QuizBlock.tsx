/**
 * Tutorial V3 quiz.
 *
 * Everything the reader's quiz already does is kept as it is — multi-select,
 * adaptive ordering, the pass mark, the author's explanation policy, the
 * progressive hints capped by the tutorial's hintN, question media, the score
 * banner and cumulative pooling. The explanation policy stays an author
 * setting; there is deliberately no learner-facing toggle for it.
 *
 * Four things are new:
 *   · self-marking for short answer, replacing substring grading
 *   · FROM YOUR SOURCES, which the reader collected but never rendered
 *   · review-wrong mode after completion
 *   · a per-question progress strip
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { QuestionContent, QuizContent } from '../../../../../lib/types';
import { QuestionMedia } from '../../QuestionMedia';
import { hintsForQuestion } from '../../../../../lib/questionHints.js';
import type { QuizResolveStatus } from '../../McqClusterExperience';
import { useLearnerProgress } from './LearnerProgressContext';

/** How the learner judged their own free-text answer. */
type SelfMark = 'correct' | 'partial' | 'missed';

/**
 * A grounded quote under a question. The reader's own questions carry `cite`;
 * the Figma export emits `citation`. Both are accepted rather than forcing one
 * side to migrate, because generated content already exists in both shapes.
 */
interface QuizSource { quote: string; cite?: string; citation?: string }

function sourcesOf(q: QuestionContent): QuizSource[] {
  const raw = (q as { sources?: QuizSource[] }).sources;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s.quote === 'string' && s.quote.trim().length > 0);
}

function citeOf(s: QuizSource): string {
  return String(s.cite || s.citation || '').trim();
}

function hasAnswer(a: unknown): boolean {
  if (typeof a === 'string') return a.trim().length > 0;
  if (Array.isArray(a)) return a.length > 0;
  return a !== undefined;
}

/**
 * Correctness for the auto-marked types only. Short answer is deliberately
 * absent: V3 does not guess at free text, the learner marks it.
 */
function isObjectivelyCorrect(q: QuestionContent, answer: unknown): boolean {
  if (q.type === 'multi-select') {
    const chosen = Array.isArray(answer) ? [...answer].map(Number).sort((a, b) => a - b) : [];
    const need = [...(q.correctIndices || [])].map(Number).sort((a, b) => a - b);
    return chosen.length === need.length && chosen.every((v, i) => v === need[i]);
  }
  return Number(answer) === Number(q.correct);
}

function shouldShowExplanation(
  show: string | undefined,
  { submitted, answered }: { submitted: boolean; answered: boolean },
): boolean {
  const mode = show || 'After attempt';
  if (mode === 'Never') return false;
  if (mode === 'Immediately') return answered;
  return submitted;
}

function diffRank(d?: string): number {
  const x = String(d || 'medium').toLowerCase();
  if (x === 'easy') return 0;
  if (x === 'hard') return 2;
  return 1;
}

function pickAdaptiveStart(questions: QuestionContent[]): number {
  const mid = questions.findIndex((q) => diffRank(q.difficulty) === 1);
  if (mid >= 0) return mid;
  const easy = questions.findIndex((q) => diffRank(q.difficulty) === 0);
  return easy >= 0 ? easy : 0;
}

function pickAdaptiveNext(
  questions: QuestionContent[],
  used: Set<number>,
  lastCorrect: boolean,
  lastDiff: number,
): number | null {
  const unused = questions.map((_, i) => i).filter((i) => !used.has(i));
  if (!unused.length) return null;
  const target = lastCorrect ? Math.min(2, lastDiff + 1) : Math.max(0, lastDiff - 1);
  unused.sort((a, b) => Math.abs(diffRank(questions[a].difficulty) - target) - Math.abs(diffRank(questions[b].difficulty) - target));
  return unused[0];
}

/* ── FROM YOUR SOURCES ────────────────────────────────────────── */

function SourcesPanel({ sources }: { sources: QuizSource[] }) {
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.09)', background: 'rgba(0,0,0,0.02)' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: '#6B7280', fontWeight: 700 }}>
          FROM YOUR SOURCES
        </span>
      </div>
      <div>
        {sources.map((s, i) => (
          <div key={i} style={{ padding: '11px 14px', borderTop: i ? '1px solid rgba(0,0,0,0.05)' : undefined }}>
            <p style={{ fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 1.55, marginBottom: 4 }}>
              “{s.quote}”
            </p>
            {citeOf(s) && (
              <p style={{ fontSize: 10.5, color: '#9AA3AF' }}>{citeOf(s)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── the block ────────────────────────────────────────────────── */

export function TutorialV3QuizBlock({
  content,
  blockId,
  deferPassScore = false,
  maxHints: maxHintsProp,
  hintsEnabled: hintsEnabledProp,
  onResolvedChange,
  resultKeyPrefix = '',
}: {
  content: QuizContent;
  /** Reported to the learner-progress channel when every question is resolved. */
  blockId: string;
  deferPassScore?: boolean;
  maxHints?: number;
  hintsEnabled?: boolean;
  onResolvedChange?: (info: {
    keyPrefix: string;
    byIndex: Record<number, QuizResolveStatus>;
    correct: number;
    total: number;
    allDone: boolean;
  }) => void;
  resultKeyPrefix?: string;
}) {
  const questions = content.questions || [];
  const adaptive = !!content.adaptive;
  const passRequired = content.passRequired !== false;
  const passMark = typeof content.passMark === 'number' ? content.passMark : 70;
  const showMode = content.showExplanations || 'After attempt';
  const hintsEnabled = hintsEnabledProp !== false;
  const maxHints = !hintsEnabled
    ? 0
    : typeof maxHintsProp === 'number'
      ? Math.max(0, maxHintsProp)
      : Math.max(0, ...questions.map((q) => (Array.isArray(q.hints) ? q.hints.length : 0)), 4);

  const [answers, setAnswers] = useState<Record<number, number | number[] | string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [path, setPath] = useState<number[]>(() => (adaptive && questions.length ? [pickAdaptiveStart(questions)] : []));
  const [hintsShown, setHintsShown] = useState<Record<number, number>>({});
  const [resolved, setResolved] = useState<Record<number, QuizResolveStatus>>({});
  const [flashWrong, setFlashWrong] = useState<Record<number, boolean>>({});
  const [wrongTries, setWrongTries] = useState<Record<number, number>>({});
  /** Short answer only — the learner's own verdict on their text. */
  const [selfMarks, setSelfMarks] = useState<Record<number, SelfMark>>({});
  /** Which questions have their sources panel open. */
  const [sourcesOpen, setSourcesOpen] = useState<Record<number, boolean>>({});
  /** After completion: show only the ones that were missed. */
  const [reviewWrong, setReviewWrong] = useState(false);

  const { markBlockDone, markBlockUndone } = useLearnerProgress();

  const currentQi = adaptive ? path[path.length - 1] : -1;

  /** A question counts as right when it was auto-marked right, or self-marked right. */
  const isRight = (qi: number): boolean => {
    const q = questions[qi];
    if (!q) return false;
    if (q.type === 'short-answer') return selfMarks[qi] === 'correct';
    return resolved[qi] === 'correct';
  };

  const resolvedCount = Object.keys(resolved).length;
  const correctCount = questions.reduce((n, _q, qi) => n + (isRight(qi) ? 1 : 0), 0);
  const attempted = submitted
    ? (adaptive ? path.length : questions.length)
    : Math.max(resolvedCount, Object.keys(answers).filter((k) => hasAnswer(answers[Number(k)])).length);
  const scoreBase = submitted ? (adaptive ? path.length : questions.length) : Math.max(resolvedCount, 1);
  const pct = submitted && scoreBase
    ? Math.round((correctCount / scoreBase) * 100)
    : resolvedCount
      ? Math.round((correctCount / resolvedCount) * 100)
      : 0;
  const passed = pct >= passMark;

  /** Short answer is only finished once the learner has judged it. */
  const isFinished = (qi: number): boolean => {
    const q = questions[qi];
    if (!q) return false;
    if (!resolved[qi]) return false;
    if (q.type === 'short-answer') return selfMarks[qi] != null;
    return true;
  };
  const allDone = questions.length > 0 && questions.every((_q, qi) => isFinished(qi));

  const wrongIndices = useMemo(
    () => questions.map((_q, qi) => qi).filter((qi) => isFinished(qi) && !isRight(qi)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved, selfMarks, questions.length],
  );

  useEffect(() => {
    onResolvedChange?.({
      keyPrefix: resultKeyPrefix,
      byIndex: resolved,
      correct: correctCount,
      total: questions.length,
      allDone,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, selfMarks, resultKeyPrefix, questions.length]);

  // The sidebar's dot for this section turns on nothing but this.
  useEffect(() => {
    if (allDone) markBlockDone(blockId);
    else markBlockUndone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, blockId]);

  const toggleMulti = (qi: number, oi: number) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qi]) ? [...(prev[qi] as number[])] : [];
      const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi];
      return { ...prev, [qi]: next };
    });
    setFlashWrong((p) => ({ ...p, [qi]: false }));
  };

  const checkAnswer = (qi: number) => {
    const q = questions[qi];
    if (!q || resolved[qi] || !hasAnswer(answers[qi])) return;

    // Free text is never auto-graded — submitting hands it to the learner to mark.
    if (q.type === 'short-answer') {
      setResolved((p) => ({ ...p, [qi]: 'revealed' }));
      setFlashWrong((p) => ({ ...p, [qi]: false }));
      return;
    }

    if (isObjectivelyCorrect(q, answers[qi])) {
      setResolved((p) => ({ ...p, [qi]: 'correct' }));
      setFlashWrong((p) => ({ ...p, [qi]: false }));
      return;
    }
    setWrongTries((p) => ({ ...p, [qi]: (p[qi] || 0) + 1 }));
    if (maxHints > 0) {
      const nextShown = Math.min(maxHints, (hintsShown[qi] || 0) + 1);
      setHintsShown((p) => ({ ...p, [qi]: nextShown }));
    }
    setFlashWrong((p) => ({ ...p, [qi]: true }));
    setAnswers((prev) => {
      const n = { ...prev };
      delete n[qi];
      return n;
    });
  };

  const revealAndLock = (qi: number) => {
    if (maxHints > 0) setHintsShown((p) => ({ ...p, [qi]: maxHints }));
    setResolved((p) => ({ ...p, [qi]: 'revealed' }));
    setFlashWrong((p) => ({ ...p, [qi]: false }));
    const q = questions[qi];
    if (!q) return;
    if (q.type === 'multi-select') setAnswers((p) => ({ ...p, [qi]: [...(q.correctIndices || [])] }));
    else if (q.type !== 'short-answer') setAnswers((p) => ({ ...p, [qi]: q.correct ?? 0 }));
  };

  const renderQuestion = (q: QuestionContent, qi: number, opts: {
    reveal: boolean;
    showExp: boolean;
    disabled: boolean;
    label: string;
    showCheck?: boolean;
  }) => {
    const options = q.options || [];
    const hints = maxHints > 0
      ? hintsForQuestion(q, { count: maxHints, enabled: true }).slice(0, maxHints)
      : [];
    const shown = hintsShown[qi] || 0;
    const status = resolved[qi];
    const done = !!status;
    const reveal = opts.reveal || status === 'revealed' || status === 'correct';
    const canShowAnswer = maxHints > 0 ? shown >= maxHints : (wrongTries[qi] || 0) >= 1;
    const shortAnswer = q.type === 'short-answer';
    const mark = selfMarks[qi];
    const sources = sourcesOf(q);

    // The card tints to the outcome once there is one to show.
    let cardBg = 'white';
    let cardBorder = 'transparent';
    if (done && shortAnswer && mark) {
      cardBg = mark === 'correct' ? 'rgba(5,150,105,0.06)' : mark === 'missed' ? 'rgba(239,68,68,0.05)' : 'rgba(217,119,6,0.06)';
      cardBorder = mark === 'correct' ? 'rgba(5,150,105,0.22)' : mark === 'missed' ? 'rgba(239,68,68,0.2)' : 'rgba(217,119,6,0.22)';
    } else if (done && !shortAnswer) {
      cardBg = status === 'correct' ? 'rgba(5,150,105,0.06)' : 'rgba(239,68,68,0.05)';
      cardBorder = status === 'correct' ? 'rgba(5,150,105,0.22)' : 'rgba(239,68,68,0.2)';
    }

    return (
      <div
        key={qi}
        className="rounded-[22px] p-5"
        style={{ background: cardBg, border: `1.5px solid ${cardBorder}`, boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9AA3AF' }}>{opts.label}</p>
          {q.type && q.type !== 'multiple-choice' && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: '#F3F4F6', color: '#6B7280' }}>{q.type}</span>
          )}
          {q.cognitiveLevel && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(37,99,235,0.08)', color: '#2563EB' }}>{q.cognitiveLevel}</span>
          )}
          {adaptive && q.difficulty && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(217,119,6,0.1)', color: '#D97706' }}>{q.difficulty}</span>
          )}
          {status === 'correct' && (
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 10.5, fontWeight: 600, background: 'rgba(5,150,105,0.12)', color: '#059669' }}>Correct</span>
          )}
        </div>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: '#0B1220', marginBottom: 14, lineHeight: 1.4 }}>{q.question}</p>
        <QuestionMedia q={q} />

        {shortAnswer ? (
          <textarea
            rows={4}
            value={typeof answers[qi] === 'string' ? String(answers[qi]) : ''}
            disabled={opts.disabled || done}
            onChange={(e) => {
              setAnswers((prev) => ({ ...prev, [qi]: e.target.value }));
              setFlashWrong((p) => ({ ...p, [qi]: false }));
            }}
            placeholder="Write your answer…"
            className="w-full rounded-xl px-4 py-3 resize-none"
            style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'rgba(0,0,0,0.03)' }}
          />
        ) : (
          <div className="space-y-2">
            {options.map((opt, oi) => {
              const multi = q.type === 'multi-select';
              const chosen = multi
                ? Array.isArray(answers[qi]) && (answers[qi] as number[]).includes(oi)
                : answers[qi] === oi;
              const right = multi ? (q.correctIndices || []).includes(oi) : oi === q.correct;
              const correct = reveal && right;
              const wrong = reveal && chosen && !right;
              return (
                <button
                  key={oi}
                  disabled={opts.disabled || done}
                  onClick={() => {
                    if (multi) toggleMulti(qi, oi);
                    else {
                      setAnswers((prev) => ({ ...prev, [qi]: oi }));
                      setFlashWrong((p) => ({ ...p, [qi]: false }));
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl transition-all"
                  style={{
                    fontSize: 13.5,
                    background: correct ? 'rgba(5,150,105,0.1)' : wrong ? 'rgba(239,68,68,0.08)' : chosen ? 'rgba(11,15,26,0.07)' : 'rgba(0,0,0,0.04)',
                    border: correct ? '1.5px solid rgba(5,150,105,0.3)' : wrong ? '1.5px solid rgba(239,68,68,0.25)' : chosen ? '1.5px solid rgba(11,15,26,0.15)' : '1.5px solid transparent',
                    color: '#0B1220',
                    fontWeight: chosen ? 600 : 400,
                  }}
                >
                  {multi ? (chosen ? '☑ ' : '☐ ') : ''}{opt}
                </button>
              );
            })}
            {reveal && q.type === 'multi-select' && (
              <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 4 }}>
                {(q.correctIndices || []).length} correct option{(q.correctIndices || []).length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}

        {flashWrong[qi] && !done && (
          <p style={{ fontSize: 12.5, color: '#DC2626', marginTop: 10, fontWeight: 600 }}>
            Not quite{maxHints > 0 && shown ? ` — hint ${shown} of ${maxHints}` : ''}. Try again.
          </p>
        )}

        {shown > 0 && hints.length > 0 && (
          <div className="mt-3 space-y-2">
            {hints.slice(0, shown).map((h: string, hi: number) => (
              <div
                key={hi}
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: hi === shown - 1 ? 'rgba(37,99,235,0.08)' : 'rgba(0,0,0,0.03)',
                  border: hi === shown - 1 ? '1px solid rgba(37,99,235,0.2)' : '1px solid transparent',
                }}
              >
                <p style={{ fontSize: 10.5, fontWeight: 700, color: '#2563EB', marginBottom: 2 }}>Hint {hi + 1} of {maxHints}</p>
                <p style={{ fontSize: 12.5, color: '#1E3A8A', lineHeight: 1.45 }}>{h}</p>
              </div>
            ))}
          </div>
        )}

        {/* Self-marking: the sample answer is evidence for the learner's own
            judgement, not a string to be matched against. */}
        {shortAnswer && done && mark == null && (
          <div className="mt-4">
            <p style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 8 }}>
              Compare with the sample answer — how did you do?
            </p>
            {q.sampleAnswer && (
              <div className="rounded-xl px-4 py-3 mb-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 10, letterSpacing: '0.14em', color: '#9AA3AF', fontWeight: 700, marginBottom: 4 }}>SAMPLE ANSWER</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{q.sampleAnswer}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'correct' as const, label: 'Got it ✓', fg: '#047857', bg: 'rgba(5,150,105,0.08)', bd: 'rgba(5,150,105,0.3)' },
                { key: 'partial' as const, label: 'Partly', fg: '#B45309', bg: 'rgba(217,119,6,0.08)', bd: 'rgba(217,119,6,0.3)' },
                { key: 'missed' as const, label: 'Missed it', fg: '#B91C1C', bg: 'rgba(239,68,68,0.07)', bd: 'rgba(239,68,68,0.28)' },
              ]).map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setSelfMarks((p) => ({ ...p, [qi]: b.key }))}
                  className="px-4 py-2 rounded-full"
                  style={{ fontSize: 12.5, fontWeight: 650, color: b.fg, background: b.bg, border: `1px solid ${b.bd}` }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {shortAnswer && done && mark != null && (
          <div
            className="mt-3 rounded-xl px-3 py-2 flex items-center justify-between gap-3"
            style={{
              fontSize: 12.5,
              fontWeight: 650,
              color: mark === 'correct' ? '#047857' : mark === 'missed' ? '#B91C1C' : '#B45309',
              background: mark === 'correct' ? 'rgba(5,150,105,0.1)' : mark === 'missed' ? 'rgba(239,68,68,0.08)' : 'rgba(217,119,6,0.1)',
            }}
          >
            <span>
              {mark === 'correct' ? '✓ Marked as correct' : mark === 'missed' ? '✗ Marked as missed' : '~ Marked as partial'}
            </span>
            <button
              type="button"
              onClick={() => setSelfMarks((p) => {
                const n = { ...p };
                delete n[qi];
                return n;
              })}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280', textDecoration: 'underline' }}
            >
              change
            </button>
          </div>
        )}

        {opts.showCheck && !done && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!hasAnswer(answers[qi])}
              onClick={() => checkAnswer(qi)}
              className="px-4 py-2 rounded-full text-white text-xs font-semibold"
              style={{ background: '#0B0F1A', opacity: hasAnswer(answers[qi]) ? 1 : 0.45 }}
            >
              {shortAnswer ? 'Submit' : 'Check answer'}
            </button>
            {!shortAnswer && canShowAnswer && (
              <button
                type="button"
                onClick={() => revealAndLock(qi)}
                className="px-4 py-2 rounded-full text-xs font-semibold border"
                style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#6B7280' }}
              >
                Show answer
              </button>
            )}
          </div>
        )}

        {opts.showExp && q.explanation && (
          <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 10, lineHeight: 1.5 }}>{q.explanation}</p>
        )}

        {/* Grounded quotes — collected by the pipeline all along, shown at last. */}
        {done && sources.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setSourcesOpen((p) => ({ ...p, [qi]: !p[qi] }))}
              className="flex items-center gap-1.5"
              style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}
              aria-expanded={!!sourcesOpen[qi]}
            >
              <span>{sourcesOpen[qi] ? '▾' : '▸'}</span>
              {sourcesOpen[qi] ? 'Hide sources' : 'From your sources'}
            </button>
            {sourcesOpen[qi] && <SourcesPanel sources={sources} />}
          </div>
        )}
      </div>
    );
  };

  /* ── per-question progress strip ─────────────────────────────── */

  const progressStrip = questions.length > 1 && (
    <div className="flex gap-1" aria-hidden>
      {questions.map((_q, qi) => {
        const finished = isFinished(qi);
        const right = isRight(qi);
        const partial = questions[qi].type === 'short-answer' && selfMarks[qi] === 'partial';
        return (
          <div
            key={qi}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 99,
              transition: 'background 200ms ease',
              background: !finished
                ? 'rgba(0,0,0,0.09)'
                : partial
                  ? '#F59E0B'
                  : right
                    ? '#059669'
                    : '#F87171',
            }}
          />
        );
      })}
    </div>
  );

  const scoreBanner = !deferPassScore && submitted && (
    <div
      className="rounded-[22px] p-5 text-center"
      style={{
        background: !passRequired ? 'rgba(5,150,105,0.06)' : passed ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.06)',
        border: `1.5px solid ${!passRequired ? 'rgba(5,150,105,0.2)' : passed ? 'rgba(5,150,105,0.25)' : 'rgba(239,68,68,0.2)'}`,
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginBottom: 4 }}>
        {pct}% · {correctCount}/{attempted || questions.length} correct
      </p>
      {passRequired ? (
        <p style={{ fontSize: 13.5, fontWeight: 600, color: passed ? '#059669' : '#DC2626' }}>
          {passed ? `Passed (mark ${passMark}%)` : `Not yet — need ${passMark}% to pass`}
        </p>
      ) : (
        <p style={{ fontSize: 13.5, fontWeight: 600, color: '#059669' }}>Practice complete — no pass mark</p>
      )}
    </div>
  );

  /* ── adaptive path ───────────────────────────────────────────── */

  if (adaptive) {
    const q = questions[currentQi];
    const answered = hasAnswer(answers[currentQi]);
    const done = isFinished(currentQi);
    const showExp = shouldShowExplanation(showMode, { submitted: done || submitted, answered: done || answered }) && !!q?.explanation;

    const advance = () => {
      if (currentQi == null || currentQi < 0 || !q) return;
      const ok = isRight(currentQi);
      const used = new Set(path);
      const next = pickAdaptiveNext(questions, used, ok, diffRank(q.difficulty));
      if (next == null) {
        setSubmitted(true);
        return;
      }
      setPath((p) => [...p, next]);
    };

    return (
      <div className="space-y-5">
        <p style={{ fontSize: 12.5, color: '#6B7280' }}>
          {content.purpose ? `${content.purpose} · ` : ''}Adaptive
          {passRequired ? ` · Pass mark ${passMark}%` : ' · No pass mark'}
          {!submitted && q ? ` · Question ${path.length} of ${questions.length}` : ''}
        </p>
        {progressStrip}
        {!submitted && q && (
          <>
            {renderQuestion(q, currentQi, {
              reveal: !!resolved[currentQi],
              showExp: !!showExp,
              disabled: !!resolved[currentQi] || submitted,
              label: q.label || `Question ${path.length}`,
              showCheck: true,
            })}
            {done && (
              <button
                onClick={advance}
                className="w-full py-3 rounded-full text-white"
                style={{ background: '#059669', fontSize: 14, fontWeight: 600 }}
              >
                {path.length >= questions.length ? 'See results' : 'Next question →'}
              </button>
            )}
          </>
        )}
        {scoreBanner}
      </div>
    );
  }

  /* ── linear path ─────────────────────────────────────────────── */

  const shownQuestions = reviewWrong
    ? questions.map((q, qi) => ({ q, qi })).filter(({ qi }) => wrongIndices.includes(qi))
    : questions.map((q, qi) => ({ q, qi }));

  return (
    <div className="space-y-5">
      {!deferPassScore && (
        <p style={{ fontSize: 12.5, color: '#6B7280' }}>
          {content.purpose ? `${content.purpose} · ` : ''}
          {passRequired ? `Pass mark ${passMark}%` : 'No pass mark — practice only'}
          {!submitted && maxHints > 0 ? ` · Wrong answers unlock up to ${maxHints} hint${maxHints === 1 ? '' : 's'}` : ''}
          {!submitted && maxHints <= 0 ? ' · Check each answer' : ''}
        </p>
      )}

      {progressStrip}

      {/* Review-wrong: only offered once there is something to review. */}
      {allDone && wrongIndices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setReviewWrong((v) => !v)}
            className="px-3.5 py-1.5 rounded-full"
            style={{
              fontSize: 12,
              fontWeight: 650,
              color: reviewWrong ? '#B91C1C' : '#6B7280',
              background: reviewWrong ? 'rgba(239,68,68,0.07)' : 'transparent',
              border: `1px solid ${reviewWrong ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.12)'}`,
            }}
          >
            {reviewWrong ? '← Show all questions' : `Review ${wrongIndices.length} missed`}
          </button>
          {reviewWrong && (
            <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
              Showing the {wrongIndices.length} you did not get.
            </span>
          )}
        </div>
      )}

      {shownQuestions.map(({ q, qi }) => {
        const done = !!resolved[qi];
        const showExp = shouldShowExplanation(showMode, { submitted: submitted || done, answered: done }) && !!q.explanation;
        return (
          <div key={qi}>
            {renderQuestion(q, qi, {
              reveal: submitted || done,
              showExp: !!showExp,
              disabled: submitted || done,
              label: q.label || `Question ${qi + 1}`,
              showCheck: !submitted,
            })}
          </div>
        );
      })}

      {!deferPassScore && !submitted && allDone && !reviewWrong && (
        <button
          onClick={() => setSubmitted(true)}
          className="w-full py-3 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 14, fontWeight: 600 }}
        >
          See results
        </button>
      )}

      {scoreBanner}
    </div>
  );
}
