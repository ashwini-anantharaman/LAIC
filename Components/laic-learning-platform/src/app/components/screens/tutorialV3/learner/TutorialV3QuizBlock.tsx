/**
 * Tutorial V3 quiz — the reference export's `QuizBlock` from `blocks.tsx`.
 *
 * The look is fixed by the reference: a mono QUIZ chip, a settings bar carrying
 * the explanation policy and the adaptive switch, a thin per-question strip,
 * bordered cards that tint to their outcome, two-column options with a mono
 * letter prefix, a navy Submit and a mono amber hint.
 *
 * The settings bar is live, not decorative. The author's Define settings seed
 * it — `showExplanations` and `adaptive` are where it starts — but the learner
 * may change both, which is what the reference does and what was asked for.
 *
 * Behaviour underneath is the platform's, and nothing was dropped to get the
 * look: multi-select, short answer with learner self-marking, adaptive
 * ordering, progressive hints capped by the tutorial's hintN, question media,
 * FROM YOUR SOURCES, review-wrong mode, the pass mark and cumulative pooling.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { QuestionContent, QuizContent } from '../../../../../lib/types';
import { QuestionMedia } from '../../QuestionMedia';
import { hintsForQuestion } from '../../../../../lib/questionHints.js';
import type { QuizResolveStatus } from '../../McqClusterExperience';
import { useLearnerProgress } from './LearnerProgressContext';
import { NAVY } from './warm/theme';

/** How the learner judged their own free-text answer. */
type SelfMark = 'correct' | 'partial' | 'missed';

/** The reference's four policies, in its own order. */
type Policy = 'immediately' | 'after-attempt' | 'after-completion' | 'never';

const POLICIES: Policy[] = ['immediately', 'after-attempt', 'after-completion', 'never'];

const POLICY_LABEL: Record<Policy, string> = {
  immediately: 'Immediately',
  'after-attempt': 'After attempt',
  'after-completion': 'After completion',
  never: 'Never',
};

/** Define writes "After attempt"; the reference's ids are kebab-case. */
function policyFromAuthor(authored?: string): Policy {
  const k = String(authored || 'After attempt').toLowerCase().replace(/\s+/g, '-');
  return (POLICIES as string[]).includes(k) ? (k as Policy) : 'after-attempt';
}

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

/** The reference's short type tag. */
function typeTag(t: string | undefined): string {
  if (t === 'multi-select') return 'SELECT ALL';
  if (t === 'short-answer') return 'SHORT ANSWER';
  if (t === 'true-false') return 'TRUE / FALSE';
  if (t === 'scenario') return 'SCENARIO';
  return 'MCQ';
}

function typeTagClass(t: string | undefined): string {
  if (t === 'multi-select') return 'bg-blue-50 text-blue-600';
  if (t === 'short-answer') return 'bg-purple-50 text-purple-600';
  return 'bg-stone-100 text-stone-500';
}

/* ── FROM YOUR SOURCES ────────────────────────────────────────── */

function SourcesPanel({ sources }: { sources: QuizSource[] }) {
  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
      <div className="px-4 py-2 border-b border-stone-200 flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-stone-500">FROM YOUR SOURCES</span>
      </div>
      <div className="divide-y divide-stone-100">
        {sources.map((s, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-sm text-stone-700 italic leading-relaxed mb-1">"{s.quote}"</p>
            {citeOf(s) && <p className="font-mono text-[10px] text-stone-400">{citeOf(s)}</p>}
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
  title = 'Knowledge check',
  deferPassScore = false,
  maxHints: maxHintsProp,
  hintsEnabled: hintsEnabledProp,
  onResolvedChange,
  resultKeyPrefix = '',
}: {
  content: QuizContent;
  /** Reported to the learner-progress channel when every question is resolved. */
  blockId: string;
  title?: string;
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
  const passRequired = content.passRequired !== false;
  const passMark = typeof content.passMark === 'number' ? content.passMark : 70;
  const hintsEnabled = hintsEnabledProp !== false;
  const maxHints = !hintsEnabled
    ? 0
    : typeof maxHintsProp === 'number'
      ? Math.max(0, maxHintsProp)
      : Math.max(0, ...questions.map((q) => (Array.isArray(q.hints) ? q.hints.length : 0)), 4);

  /** Seeded from Define, then the learner's to change. */
  const [policy, setPolicy] = useState<Policy>(() => policyFromAuthor(content.showExplanations));
  const [adaptive, setAdaptive] = useState<boolean>(() => !!content.adaptive);

  const [answers, setAnswers] = useState<Record<number, number | number[] | string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [path, setPath] = useState<number[]>(() => (content.adaptive && questions.length ? [pickAdaptiveStart(questions)] : []));
  const [hintsShown, setHintsShown] = useState<Record<number, number>>({});
  const [resolved, setResolved] = useState<Record<number, QuizResolveStatus>>({});
  const [flashWrong, setFlashWrong] = useState<Record<number, boolean>>({});
  const [wrongTries, setWrongTries] = useState<Record<number, number>>({});
  /** Short answer only — the learner's own verdict on their text. */
  const [selfMarks, setSelfMarks] = useState<Record<number, SelfMark>>({});
  /** Which questions have their sources panel open. */
  const [sourcesOpen, setSourcesOpen] = useState<Record<number, boolean>>({});
  /** Per-question override for the after-completion policy. */
  const [explanationShown, setExplanationShown] = useState<Record<number, boolean>>({});
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

  /** Short answer is only finished once the learner has judged it. */
  const isFinished = (qi: number): boolean => {
    const q = questions[qi];
    if (!q) return false;
    if (!resolved[qi]) return false;
    if (q.type === 'short-answer') return selfMarks[qi] != null;
    return true;
  };

  const doneCount = questions.filter((_q, qi) => isFinished(qi)).length;
  const allDone = questions.length > 0 && doneCount === questions.length;
  const correctCount = questions.reduce((n, _q, qi) => n + (isRight(qi) ? 1 : 0), 0);
  const scoreBase = adaptive && submitted ? path.length : questions.length;
  const pct = scoreBase ? Math.round((correctCount / scoreBase) * 100) : 0;
  const passed = pct >= passMark;

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

  /** Turning the switch on mid-quiz starts a path from what is still unanswered. */
  const toggleAdaptive = () => {
    setAdaptive((on) => {
      if (!on) {
        const unused = questions.map((_q, i) => i).filter((i) => !isFinished(i));
        setPath([unused.length ? unused[0] : pickAdaptiveStart(questions)]);
      }
      return !on;
    });
  };

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
      setHintsShown((p) => ({ ...p, [qi]: Math.min(maxHints, (p[qi] || 0) + 1) }));
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

  /* ── one question card ───────────────────────────────────────── */

  const renderQuestion = (q: QuestionContent, qi: number, label: string) => {
    const options = q.options || [];
    const hints = maxHints > 0
      ? hintsForQuestion(q, { count: maxHints, enabled: true }).slice(0, maxHints)
      : [];
    const shown = hintsShown[qi] || 0;
    const status = resolved[qi];
    const done = !!status;
    const reveal = done || submitted;
    const canShowAnswer = maxHints > 0 ? shown >= maxHints : (wrongTries[qi] || 0) >= 1;
    const shortAnswer = q.type === 'short-answer';
    const mark = selfMarks[qi];
    const sources = sourcesOf(q);
    const right = isRight(qi);

    const showExpl = done && (
      policy === 'immediately'
      || policy === 'after-attempt'
      || (policy === 'after-completion' && (allDone || explanationShown[qi]))
    );

    let cardBg = 'bg-white border-stone-200';
    if (done && shortAnswer) {
      cardBg = mark === 'correct'
        ? 'bg-green-50 border-green-200'
        : mark === 'missed' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
    } else if (done) {
      cardBg = status === 'correct' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    }

    const canSubmit = hasAnswer(answers[qi]);

    return (
      <div className={`rounded-lg border p-5 transition-colors ${cardBg}`}>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex items-center gap-2 shrink-0 mt-0.5 flex-wrap">
            <span className="font-mono text-[10px] text-stone-400">{label}</span>
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded tracking-wider ${typeTagClass(q.type)}`}>
              {typeTag(q.type)}
            </span>
            {adaptive && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded tracking-wider bg-amber-50 text-amber-600">
                ADAPTIVE
              </span>
            )}
            {q.cognitiveLevel && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded tracking-wider bg-stone-100 text-stone-500">
                {String(q.cognitiveLevel).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <p className="text-stone-900 text-[15px] leading-relaxed mb-4">{q.question}</p>
        <QuestionMedia q={q} />

        {shown > 0 && hints.length > 0 && (
          <div className="mb-4 space-y-2">
            {hints.slice(0, shown).map((h: string, hi: number) => (
              <div key={hi} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <span className="text-amber-500 shrink-0 text-xs mt-0.5">💡</span>
                <div>
                  {maxHints > 1 && (
                    <p className="font-mono text-[9px] text-amber-600 tracking-wider mb-0.5">
                      HINT {hi + 1} OF {maxHints}
                    </p>
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
              disabled={done}
              onChange={(e) => {
                setAnswers((prev) => ({ ...prev, [qi]: e.target.value }));
                setFlashWrong((p) => ({ ...p, [qi]: false }));
              }}
              placeholder="Write your answer here…"
              className="w-full text-sm text-stone-800 border border-stone-200 rounded p-3 resize-none focus:outline-none focus:border-amber-400 disabled:bg-stone-50 disabled:text-stone-600"
            />

            {done && mark == null && (
              <div className="mt-3">
                <p className="text-sm text-stone-600 mb-2 font-medium">Compare with the sample answer — how did you do?</p>
                {q.sampleAnswer && (
                  <div className="rounded bg-stone-50 border border-stone-200 px-4 py-3 mb-3 text-sm text-stone-700 leading-relaxed">
                    <span className="font-mono text-[10px] text-stone-400 block mb-1">SAMPLE ANSWER</span>
                    {q.sampleAnswer}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'correct' }))}
                    className="px-4 py-1.5 rounded border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100"
                  >
                    Got it ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'partial' }))}
                    className="px-4 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100"
                  >
                    Partly
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfMarks((p) => ({ ...p, [qi]: 'missed' }))}
                    className="px-4 py-1.5 rounded border border-red-300 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100"
                  >
                    Missed it
                  </button>
                </div>
              </div>
            )}
            {done && mark != null && (
              <div
                className={`mt-3 rounded px-3 py-2 text-sm font-medium flex items-center justify-between gap-3 ${
                  mark === 'correct'
                    ? 'bg-green-100 text-green-800'
                    : mark === 'missed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
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
                  className="font-mono text-[10px] text-stone-500 underline"
                >
                  change
                </button>
              </div>
            )}
          </div>
        ) : q.type === 'multi-select' ? (
          <div className="space-y-2 mb-4">
            {options.map((opt, oi) => {
              const checked = Array.isArray(answers[qi]) && (answers[qi] as number[]).includes(oi);
              const isCorrectOpt = (q.correctIndices || []).includes(oi);
              let border = 'border-stone-200';
              let bg = 'bg-white';
              let text = 'text-stone-700';
              if (!reveal && checked) { border = 'border-amber-500'; bg = 'bg-amber-50'; text = 'text-amber-900'; }
              if (reveal && isCorrectOpt) { border = 'border-green-500'; bg = 'bg-green-50'; text = 'text-green-900'; }
              if (reveal && checked && !isCorrectOpt) { border = 'border-red-400'; bg = 'bg-red-50'; text = 'text-red-800'; }
              if (reveal && !isCorrectOpt && !checked) { border = 'border-stone-100'; text = 'text-stone-400'; }
              return (
                <button
                  key={oi}
                  onClick={() => toggleMulti(qi, oi)}
                  disabled={done}
                  className={`flex items-start gap-3 w-full text-left rounded border px-3 py-2.5 text-sm transition-all ${border} ${bg} ${text} ${
                    !done ? 'cursor-pointer hover:border-stone-400' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex items-center justify-center w-4 h-4 rounded border-2 shrink-0 transition-all ${
                      reveal && isCorrectOpt
                        ? 'border-green-500 bg-green-500'
                        : reveal && checked && !isCorrectOpt
                          ? 'border-red-400 bg-red-400'
                          : checked ? 'border-amber-500 bg-amber-500' : 'border-stone-300'
                    }`}
                  >
                    {(checked || (reveal && isCorrectOpt)) && <span className="text-white text-[9px] font-bold">✓</span>}
                    {reveal && checked && !isCorrectOpt && <span className="text-white text-[9px] font-bold">✗</span>}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
            {reveal && (
              <p className="text-xs font-mono text-stone-400 mt-1">
                {(q.correctIndices || []).length} correct option{(q.correctIndices || []).length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {options.map((opt, oi) => {
              const chosen = answers[qi] === oi;
              let cls = 'rounded border px-3 py-2 text-sm text-left transition-all ';
              if (!reveal) {
                cls += chosen
                  ? 'border-amber-500 bg-amber-50 text-amber-900 font-medium cursor-pointer'
                  : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700 cursor-pointer';
              } else if (oi === q.correct) cls += 'border-green-500 bg-green-100 text-green-900 font-medium cursor-default';
              else if (chosen) cls += 'border-red-400 bg-red-100 text-red-800 cursor-default';
              else cls += 'border-stone-100 bg-white/60 text-stone-400 cursor-default';
              return (
                <button
                  key={oi}
                  className={cls}
                  disabled={done}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [qi]: oi }));
                    setFlashWrong((p) => ({ ...p, [qi]: false }));
                  }}
                >
                  <span className="font-mono text-[10px] text-stone-400 mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
                </button>
              );
            })}
          </div>
        )}

        {flashWrong[qi] && !done && (
          <p className="text-sm text-red-600 mb-3">
            Not quite{maxHints > 0 && shown ? ` — hint ${shown} of ${maxHints}` : ''}. Try again.
          </p>
        )}

        {done && (
          <div className="space-y-2">
            {policy === 'never' ? null
              : policy === 'after-completion' && !allDone && !explanationShown[qi] ? (
                <button
                  type="button"
                  onClick={() => setExplanationShown((p) => ({ ...p, [qi]: true }))}
                  className="text-xs text-stone-500 font-mono hover:text-stone-700 underline"
                >
                  Unlock explanation
                </button>
              ) : showExpl && q.explanation ? (
                <div
                  className={`text-sm rounded px-3 py-2 ${
                    shortAnswer && mark == null
                      ? 'text-stone-700 bg-stone-100'
                      : right ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
                  }`}
                >
                  <span className="font-medium">{right ? '✓ ' : '✗ '}</span>{q.explanation}
                </div>
              ) : null}

            {sources.length > 0 && (
              <button
                type="button"
                onClick={() => setSourcesOpen((p) => ({ ...p, [qi]: !p[qi] }))}
                className="text-xs text-stone-500 font-mono hover:text-stone-700 flex items-center gap-1"
                aria-expanded={!!sourcesOpen[qi]}
              >
                <span>{sourcesOpen[qi] ? '▾' : '▸'}</span>
                {sourcesOpen[qi] ? 'Hide sources' : 'From your sources'}
              </button>
            )}
            {sourcesOpen[qi] && sources.length > 0 && <SourcesPanel sources={sources} />}
          </div>
        )}

        {!done && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => checkAnswer(qi)}
              disabled={!canSubmit}
              className="px-4 py-1.5 rounded text-sm font-medium text-white disabled:opacity-30 transition-opacity"
              style={{ background: NAVY }}
            >
              Submit
            </button>
            {hints.length > 0 && (
              <button
                type="button"
                onClick={() => setHintsShown((p) => ({
                  ...p,
                  [qi]: shown > 0 ? 0 : Math.min(maxHints, 1),
                }))}
                className="text-sm text-amber-600 hover:text-amber-800 font-mono"
              >
                {shown > 0 ? 'hide hint' : '💡 hint'}
              </button>
            )}
            {canShowAnswer && !shortAnswer && (
              <button
                type="button"
                onClick={() => revealAndLock(qi)}
                className="text-xs text-stone-500 font-mono hover:text-stone-700 underline ml-auto"
              >
                Show answer
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!questions.length) return null;

  /* ── header, settings bar, strip ─────────────────────────────── */

  const header = (
    <div className="flex items-start justify-between mb-4 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-[10px] tracking-widest text-stone-500 bg-stone-100 px-2 py-0.5 rounded shrink-0">
          QUIZ
        </span>
        <h2 className="text-xl text-stone-900 truncate">{content.purpose?.trim() || title}</h2>
      </div>
      {allDone && (
        <div
          className={`font-mono text-sm px-3 py-1 rounded-full shrink-0 ${
            correctCount === questions.length ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {correctCount}/{questions.length} correct
        </div>
      )}
    </div>
  );

  const settingsBar = (
    <div className="flex flex-wrap items-center gap-3 mb-5 pb-4 border-b border-stone-100">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-stone-400 tracking-wider">EXPLANATIONS</span>
        <div className="flex gap-1 flex-wrap">
          {POLICIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPolicy(p)}
              aria-pressed={policy === p}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                policy === p ? 'text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
              style={policy === p ? { background: NAVY } : undefined}
            >
              {POLICY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <span className="font-mono text-[10px] text-stone-400">ADAPTIVE</span>
        <button
          type="button"
          onClick={toggleAdaptive}
          role="switch"
          aria-checked={adaptive}
          aria-label="Adaptive questions"
          className={`relative w-8 h-4 rounded-full transition-colors ${adaptive ? 'bg-amber-500' : 'bg-stone-200'}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${adaptive ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );

  const strip = (
    <div className="flex gap-1 mb-5" aria-hidden>
      {questions.map((q, qi) => {
        const finished = isFinished(qi);
        const partial = q.type === 'short-answer' && selfMarks[qi] === 'partial';
        return (
          <div
            key={qi}
            className={`h-1 flex-1 rounded-full transition-colors ${
              !finished
                ? 'bg-stone-200'
                : partial ? 'bg-amber-400' : isRight(qi) ? 'bg-green-500' : 'bg-red-400'
            }`}
          />
        );
      })}
    </div>
  );

  const scorePanel = !deferPassScore && allDone && (
    <div
      className={`mt-5 rounded-lg px-5 py-4 flex items-center justify-between gap-4 ${
        !passRequired || passed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
      }`}
    >
      <div>
        <p className={`text-lg ${!passRequired || passed ? 'text-green-800' : 'text-amber-800'}`}>
          {!passRequired
            ? 'Practice complete'
            : correctCount === questions.length ? 'Perfect score!' : `${correctCount} of ${questions.length} correct`}
        </p>
        <p className={`text-sm ${!passRequired || passed ? 'text-green-600' : 'text-amber-700'}`}>
          {!passRequired
            ? 'No pass mark on this one.'
            : passed ? 'All concepts nailed.' : `Needs ${passMark}% — review the missed questions, then move on.`}
        </p>
      </div>
      <div className="text-right font-mono text-2xl font-bold shrink-0" style={{ color: !passRequired || passed ? '#16a34a' : '#d97706' }}>
        {pct}%
      </div>
    </div>
  );

  /* ── adaptive path ───────────────────────────────────────────── */

  if (adaptive) {
    const q = questions[currentQi];
    const done = isFinished(currentQi);

    const advance = () => {
      if (currentQi == null || currentQi < 0 || !q) return;
      const used = new Set(path);
      const next = pickAdaptiveNext(questions, used, isRight(currentQi), diffRank(q.difficulty));
      if (next == null) {
        setSubmitted(true);
        return;
      }
      setPath((p) => [...p, next]);
    };

    return (
      <div>
        {header}
        {settingsBar}
        {strip}
        {!submitted && q && (
          <div className="space-y-4">
            {renderQuestion(q, currentQi, `Q${path.length}/${questions.length}`)}
            {done && (
              <button
                type="button"
                onClick={advance}
                className="w-full py-2.5 rounded text-white text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: NAVY }}
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
      {settingsBar}
      {strip}

      {allDone && wrongIndices.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setReviewWrong((v) => !v)}
            className={`text-xs font-mono px-3 py-1 rounded border transition-colors ${
              reviewWrong
                ? 'border-red-400 text-red-600 bg-red-50'
                : 'border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-500'
            }`}
          >
            {reviewWrong ? '← Show all' : `Review ${wrongIndices.length} missed`}
          </button>
        </div>
      )}

      <div className="space-y-5">
        {shownQuestions.map(({ q, qi }) => (
          <React.Fragment key={qi}>
            {renderQuestion(q, qi, q.label || `Q${qi + 1}/${questions.length}`)}
          </React.Fragment>
        ))}
      </div>

      {deferPassScore && allDone && (
        <p className="mt-4 font-mono text-[10px] text-stone-400 text-center tracking-wider">
          COUNTED TOWARD THE TUTORIAL TOTAL
        </p>
      )}

      {scorePanel}
    </div>
  );
}
