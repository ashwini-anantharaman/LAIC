/**
 * Tutorial V3 quiz — the reference export's `GenericQuizBlock`, wired to the
 * platform's own quiz data.
 *
 * The look is fixed and comes from the Figma reference: rounded-2xl cards on a
 * soft shadow, two-column options with a letter prefix, sage submit pills, an
 * amber hint row, a per-question strip and a closing score panel. What varies is
 * only the content the course developer wrote.
 *
 * Behaviour is the platform's, not the reference's, and nothing was dropped to
 * get the look: multi-select, short answer with learner self-marking, adaptive
 * ordering, the author's explanation policy, progressive hints capped by the
 * tutorial's hintN, question media, FROM YOUR SOURCES, review-wrong mode, the
 * pass mark and cumulative pooling all still work. Each one is drawn in the
 * reference's own idiom rather than in the one it had before.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { QuestionContent, QuizContent } from '../../../../../lib/types';
import { QuestionMedia } from '../../QuestionMedia';
import { hintsForQuestion } from '../../../../../lib/questionHints.js';
import type { QuizResolveStatus } from '../../McqClusterExperience';
import { useLearnerProgress } from './LearnerProgressContext';
import { SAGE } from './warm/theme';
import { WarmStrip } from './warm/WarmPrimitives';

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

/** The reference's own wording for a question type. */
function typeLabel(t: string | undefined): string {
  if (t === 'multi-select') return 'Select all that apply';
  if (t === 'short-answer') return 'Short answer';
  if (t === 'true-false') return 'True or false';
  if (t === 'scenario') return 'Scenario';
  return 'Choose one';
}

function typeChipClass(t: string | undefined): string {
  if (t === 'multi-select') return 'bg-blue-50 text-blue-600';
  if (t === 'short-answer') return 'bg-purple-50 text-purple-600';
  return 'bg-stone-100 text-stone-500';
}

/* ── FROM YOUR SOURCES ────────────────────────────────────────── */

function SourcesPanel({ sources }: { sources: QuizSource[] }) {
  return (
    <div className="mt-3 rounded-2xl bg-stone-50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-stone-100">
        <span className="text-xs font-bold text-stone-500 tracking-wide">FROM YOUR SOURCES</span>
      </div>
      <div>
        {sources.map((s, i) => (
          <div key={i} className={`px-4 py-3 ${i ? 'border-t border-stone-100' : ''}`}>
            <p className="text-sm text-stone-700 italic leading-relaxed mb-1">“{s.quote}”</p>
            {citeOf(s) && <p className="text-xs text-stone-400 font-semibold">{citeOf(s)}</p>}
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
    const right = isRight(qi);

    // The card tints to the outcome once there is one to show.
    let cardBg = 'bg-white';
    if (done && shortAnswer) {
      cardBg = mark === 'correct' ? 'bg-green-50' : mark === 'missed' ? 'bg-red-50' : 'bg-amber-50';
    } else if (done) {
      cardBg = status === 'correct' ? 'bg-green-50' : 'bg-red-50';
    }

    return (
      <div key={qi} className={`rounded-2xl p-5 shadow-sm transition-colors ${cardBg}`}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-stone-400 font-bold">{opts.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeChipClass(q.type)}`}>
            {typeLabel(q.type)}
          </span>
          {q.cognitiveLevel && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">{q.cognitiveLevel}</span>
          )}
          {adaptive && q.difficulty && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{q.difficulty}</span>
          )}
        </div>

        <p className="text-stone-900 text-[15px] leading-relaxed mb-4 font-medium">{q.question}</p>
        <QuestionMedia q={q} />

        {/* Progressive hints — the reference draws one; the platform may have
            several, so they stack in the same amber row. */}
        {shown > 0 && hints.length > 0 && (
          <div className="mb-4 space-y-2">
            {hints.slice(0, shown).map((h: string, hi: number) => (
              <div key={hi} className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                <span className="text-amber-500 shrink-0 text-xs mt-0.5">💡</span>
                <div>
                  {maxHints > 1 && (
                    <p className="text-xs text-amber-600 font-bold mb-0.5">Hint {hi + 1} of {maxHints}</p>
                  )}
                  <p className="text-amber-800 text-sm">{h}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {shortAnswer ? (
          <div className="mb-4">
            <textarea
              rows={4}
              value={typeof answers[qi] === 'string' ? String(answers[qi]) : ''}
              disabled={opts.disabled || done}
              onChange={(e) => {
                setAnswers((prev) => ({ ...prev, [qi]: e.target.value }));
                setFlashWrong((p) => ({ ...p, [qi]: false }));
              }}
              placeholder="Write your answer here…"
              className="w-full text-sm text-stone-800 border-2 border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:border-amber-400 disabled:bg-stone-50 font-medium"
            />

            {/* Self-marking: the sample answer is evidence for the learner's own
                judgement, not a string to be matched against. */}
            {done && mark == null && (
              <div className="mt-3">
                <p className="text-sm text-stone-600 mb-2 font-bold">How did you do? Compare with the sample answer:</p>
                {q.sampleAnswer && (
                  <div className="rounded-xl bg-stone-50 px-4 py-3 mb-3 text-sm text-stone-700 leading-relaxed">
                    {q.sampleAnswer}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'correct' }))}
                    className="px-4 py-2 rounded-full border-2 border-green-300 bg-green-50 text-green-700 text-sm font-bold hover:bg-green-100"
                  >
                    Got it ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'partial' }))}
                    className="px-4 py-2 rounded-full border-2 border-amber-300 bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100"
                  >
                    Partly
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'missed' }))}
                    className="px-4 py-2 rounded-full border-2 border-red-300 bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100"
                  >
                    Missed it
                  </button>
                </div>
              </div>
            )}
            {done && mark != null && (
              <div
                className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold flex items-center justify-between gap-3 ${
                  mark === 'correct'
                    ? 'bg-green-100 text-green-800'
                    : mark === 'missed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
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
                  className="text-xs font-bold text-stone-500 underline"
                >
                  change
                </button>
              </div>
            )}
          </div>
        ) : q.type === 'multi-select' ? (
          <div className="space-y-2 mb-4">
            {options.map((opt, oi) => {
              const chosen = Array.isArray(answers[qi]) && (answers[qi] as number[]).includes(oi);
              const isCorrectOpt = (q.correctIndices || []).includes(oi);
              let cls = 'flex items-start gap-3 w-full text-left rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ';
              if (!reveal) {
                cls += chosen
                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                  : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700 cursor-pointer';
              } else if (isCorrectOpt) cls += 'border-green-400 bg-green-50 text-green-900';
              else if (chosen) cls += 'border-red-300 bg-red-50 text-red-800';
              else cls += 'border-stone-100 text-stone-400 cursor-default';
              return (
                <button
                  key={oi}
                  disabled={opts.disabled || done}
                  onClick={() => toggleMulti(qi, oi)}
                  className={cls}
                >
                  <span
                    className={`mt-0.5 flex items-center justify-center w-4 h-4 rounded border-2 shrink-0 ${
                      reveal && isCorrectOpt
                        ? 'border-green-500 bg-green-500'
                        : reveal && chosen && !isCorrectOpt
                          ? 'border-red-400 bg-red-400'
                          : chosen
                            ? 'border-amber-400 bg-amber-400'
                            : 'border-stone-300'
                    }`}
                  >
                    {(chosen || (reveal && isCorrectOpt)) && <span className="text-white text-[9px] font-bold">✓</span>}
                    {reveal && chosen && !isCorrectOpt && <span className="text-white text-[9px] font-bold">✗</span>}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
            {reveal && (
              <p className="text-xs text-stone-400 font-semibold">
                {(q.correctIndices || []).length} correct option{(q.correctIndices || []).length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {options.map((opt, oi) => {
              const chosen = answers[qi] === oi;
              const isCorrectOpt = oi === q.correct;
              let cls = 'rounded-xl border-2 px-4 py-3 text-sm text-left font-semibold transition-all ';
              if (!reveal) {
                cls += chosen
                  ? 'border-amber-400 bg-amber-50 text-amber-900 cursor-pointer'
                  : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700 cursor-pointer';
              } else if (isCorrectOpt) cls += 'border-green-400 bg-green-100 text-green-900 cursor-default';
              else if (chosen) cls += 'border-red-300 bg-red-100 text-red-800 cursor-default';
              else cls += 'border-stone-100 bg-white/60 text-stone-400 cursor-default';
              return (
                <button
                  key={oi}
                  disabled={opts.disabled || done}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [qi]: oi }));
                    setFlashWrong((p) => ({ ...p, [qi]: false }));
                  }}
                  className={cls}
                >
                  <span className="text-stone-400 font-bold mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
                </button>
              );
            })}
          </div>
        )}

        {flashWrong[qi] && !done && (
          <p className="text-sm text-red-600 font-bold mb-3">
            Not quite{maxHints > 0 && shown ? ` — hint ${shown} of ${maxHints}` : ''}. Try again.
          </p>
        )}

        {opts.showExp && q.explanation && (
          <div
            className={`text-sm rounded-xl px-4 py-3 mb-2 font-medium ${
              shortAnswer
                ? 'text-stone-700 bg-stone-100'
                : right
                  ? 'text-green-800 bg-green-100'
                  : 'text-red-800 bg-red-100'
            }`}
          >
            <span className="font-bold">{shortAnswer ? 'Note: ' : right ? '✓ ' : '✗ '}</span>{q.explanation}
          </div>
        )}

        {/* Grounded quotes — collected by the pipeline all along, shown at last. */}
        {done && sources.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setSourcesOpen((p) => ({ ...p, [qi]: !p[qi] }))}
              className="flex items-center gap-1.5 text-sm text-stone-500 font-bold hover:text-stone-700"
              aria-expanded={!!sourcesOpen[qi]}
            >
              <span>{sourcesOpen[qi] ? '▾' : '▸'}</span>
              {sourcesOpen[qi] ? 'Hide sources' : 'From your sources'}
            </button>
            {sourcesOpen[qi] && <SourcesPanel sources={sources} />}
          </div>
        )}

        {opts.showCheck && !done && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-stone-100">
            <button
              type="button"
              disabled={!hasAnswer(answers[qi])}
              onClick={() => checkAnswer(qi)}
              className="px-6 py-2 rounded-full text-white text-sm font-bold disabled:opacity-30 transition-opacity"
              style={{ background: SAGE }}
            >
              Submit
            </button>
            {!shortAnswer && canShowAnswer && (
              <button
                type="button"
                onClick={() => revealAndLock(qi)}
                className="text-sm text-stone-500 hover:text-stone-800 font-bold"
              >
                show answer
              </button>
            )}
            {maxHints > 0 && hints.length > 0 && shown < Math.min(maxHints, hints.length) && (
              <button
                type="button"
                onClick={() => setHintsShown((p) => ({ ...p, [qi]: Math.min(maxHints, (p[qi] || 0) + 1) }))}
                className="text-sm text-amber-600 hover:text-amber-800 font-bold ml-auto"
              >
                💡 hint
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── header, strip and score panel ───────────────────────────── */

  const heading = questions.length === 1 ? 'Quick check' : 'Knowledge check';
  const doneCount = questions.filter((_q, qi) => isFinished(qi)).length;

  const header = (
    <div className="flex items-start justify-between mb-5 gap-4">
      <h2 className="text-2xl font-bold text-stone-900">{heading}</h2>
      {allDone && (
        <div
          className={`text-sm font-bold px-3 py-1 rounded-full shrink-0 ${
            correctCount === questions.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {correctCount}/{questions.length} correct
        </div>
      )}
    </div>
  );

  const intro = (content.purpose || !deferPassScore) && (
    <p className="text-stone-600 text-[15px] leading-relaxed mb-5">
      {content.purpose}
      {content.purpose && !deferPassScore ? ' ' : ''}
      {!deferPassScore && (passRequired ? `Pass mark ${passMark}%.` : 'Practice only — no pass mark.')}
    </p>
  );

  const progressStrip = questions.length > 1 && (
    <div className="mb-5">
      <WarmStrip
        items={questions.map((q, qi) => {
          if (!isFinished(qi)) return adaptive && qi === currentQi ? 'current' : 'todo';
          if (q.type === 'short-answer' && selfMarks[qi] === 'partial') return 'partial';
          return isRight(qi) ? 'done' : 'missed';
        })}
      />
    </div>
  );

  const scorePanel = !deferPassScore && submitted && (
    <div
      className={`mt-5 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 ${
        !passRequired ? 'bg-green-50' : passed ? 'bg-green-50' : 'bg-amber-50'
      }`}
    >
      <div>
        <p className={`text-lg font-bold ${!passRequired || passed ? 'text-green-800' : 'text-amber-800'}`}>
          {!passRequired
            ? 'Practice complete'
            : passed
              ? (correctCount === (attempted || questions.length) ? 'Perfect score!' : 'Passed')
              : `${correctCount} of ${attempted || questions.length} correct`}
        </p>
        <p className={`text-sm font-medium ${!passRequired || passed ? 'text-green-600' : 'text-amber-700'}`}>
          {!passRequired
            ? 'No pass mark on this one.'
            : passed
              ? `At or above the ${passMark}% mark.`
              : `Needs ${passMark}% — review the missed questions, then continue.`}
        </p>
      </div>
      <div className="text-2xl font-black shrink-0" style={{ color: !passRequired || passed ? '#16a34a' : '#d97706' }}>
        {pct}%
      </div>
    </div>
  );

  if (!questions.length) return null;

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
      <div>
        {header}
        <p className="text-stone-600 text-[15px] leading-relaxed mb-5">
          {content.purpose ? `${content.purpose} ` : ''}
          Adaptive — each question follows from the last.
          {!submitted && q ? ` Question ${path.length} of ${questions.length}.` : ''}
        </p>
        {progressStrip}
        {!submitted && q && (
          <div className="space-y-4">
            {renderQuestion(q, currentQi, {
              reveal: !!resolved[currentQi],
              showExp: !!showExp,
              disabled: !!resolved[currentQi] || submitted,
              label: q.label || `Q${path.length}`,
              showCheck: true,
            })}
            {done && (
              <button
                type="button"
                onClick={advance}
                className="w-full py-3 rounded-full text-white text-sm font-bold hover:opacity-90 transition-opacity"
                style={{ background: SAGE }}
              >
                {path.length >= questions.length ? 'See results' : 'Next question →'}
              </button>
            )}
          </div>
        )}
        {scorePanel}
      </div>
    );
  }

  /* ── linear path ─────────────────────────────────────────────── */

  const shownQuestions = reviewWrong
    ? questions.map((q, qi) => ({ q, qi })).filter(({ qi }) => wrongIndices.includes(qi))
    : questions.map((q, qi) => ({ q, qi }));

  return (
    <div>
      {header}
      {intro}
      {progressStrip}

      {/* Review-wrong: only offered once there is something to review. */}
      {allDone && wrongIndices.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button
            type="button"
            onClick={() => setReviewWrong((v) => !v)}
            className={`text-sm font-bold px-4 py-2 rounded-full border-2 transition-colors ${
              reviewWrong
                ? 'border-red-300 text-red-600 bg-red-50'
                : 'border-stone-200 text-stone-500 hover:border-stone-400'
            }`}
          >
            {reviewWrong ? '← Show all' : `Review ${wrongIndices.length} missed`}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {shownQuestions.map(({ q, qi }) => {
          const done = !!resolved[qi];
          const showExp = shouldShowExplanation(showMode, { submitted: submitted || done, answered: done }) && !!q.explanation;
          return (
            <React.Fragment key={qi}>
              {renderQuestion(q, qi, {
                reveal: submitted || done,
                showExp: !!showExp,
                disabled: submitted || done,
                label: q.label || `Q${qi + 1}`,
                showCheck: !submitted,
              })}
            </React.Fragment>
          );
        })}
      </div>

      {!deferPassScore && !submitted && allDone && !reviewWrong && (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          className="w-full mt-5 py-3 rounded-full text-white text-sm font-bold hover:opacity-90 transition-opacity"
          style={{ background: SAGE }}
        >
          See results
        </button>
      )}

      {deferPassScore && allDone && (
        <p className="mt-4 text-sm text-stone-400 font-semibold text-center">
          {doneCount}/{questions.length} answered · counted toward the tutorial total
        </p>
      )}

      {scorePanel}
    </div>
  );
}
