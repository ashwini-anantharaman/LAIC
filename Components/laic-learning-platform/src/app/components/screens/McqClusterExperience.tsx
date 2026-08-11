/**
 * Tutorial MCQ clusters: inline “Enter MCQ questions” card + one-at-a-time modal
 * (hints, explanations, optional source snippets) matching student-preview mockups.
 */
import React, { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Lightbulb, X } from 'lucide-react';
import type { QuestionContent } from '../../../lib/types';
import { hintsForQuestion } from '../../../lib/questionHints.js';
import { QuestionMedia } from './QuestionMedia';

export type QuizResolveStatus = 'correct' | 'revealed';

export type McqSourceSnippet = { quote: string; cite: string };

export type McqClusterQuestion = QuestionContent & {
  sources?: McqSourceSnippet[];
};

function hasAnswer(v: unknown) {
  if (typeof v === 'number') return true;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

function isCorrect(q: McqClusterQuestion, answer: unknown): boolean {
  if (q.type === 'short-answer') {
    const a = String(answer || '').trim().toLowerCase();
    const sample = String(q.sampleAnswer || '').trim().toLowerCase();
    return !!a && !!sample && (a === sample || sample.includes(a) || a.includes(sample));
  }
  if (q.type === 'multi-select') {
    const chosen = Array.isArray(answer) ? [...(answer as number[])].sort() : [];
    const right = [...(q.correctIndices || [])].sort();
    return chosen.length === right.length && chosen.every((v, i) => v === right[i]);
  }
  return answer === (q.correct ?? 0);
}

function letter(i: number) {
  return String.fromCharCode(65 + i);
}

/** Compact CTA card — opens the MCQ modal. */
export function McqClusterCard({
  title,
  questionCount,
  hintsEnabled,
  onEnter,
}: {
  title: string;
  questionCount: number;
  hintsEnabled?: boolean;
  onEnter: () => void;
}) {
  const sub = hintsEnabled !== false
    ? `${questionCount} question${questionCount !== 1 ? 's' : ''} · hints & explanations included`
    : `${questionCount} question${questionCount !== 1 ? 's' : ''} · explanations included`;

  return (
    <div
      className="flex items-center gap-3 sm:gap-4 rounded-2xl px-4 py-4 border bg-white my-1"
      style={{
        borderColor: 'rgba(0,0,0,0.08)',
        boxShadow: '0 4px 18px -10px rgba(30,50,80,0.28)',
      }}
    >
      <div
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(5,150,105,0.12)' }}
      >
        <BookOpen size={18} style={{ color: '#059669' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 14.5, fontWeight: 700, color: '#0B1220', lineHeight: 1.25 }}>
          {title}
        </p>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>{sub}</p>
      </div>
      <button
        type="button"
        onClick={onEnter}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-white"
        style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 650 }}
      >
        Enter MCQ questions <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/** Full-screen modal: one MCQ at a time with hints / why / sources. */
export function McqClusterModal({
  open,
  onClose,
  title,
  fromLabel,
  questions,
  maxHints = 4,
  hintsEnabled = true,
  onResolvedChange,
  resultKeyPrefix,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fromLabel?: string;
  questions: McqClusterQuestion[];
  maxHints?: number;
  hintsEnabled?: boolean;
  onResolvedChange?: (info: {
    keyPrefix: string;
    byIndex: Record<number, QuizResolveStatus>;
    correct: number;
    total: number;
    allDone: boolean;
  }) => void;
  resultKeyPrefix: string;
}) {
  const n = questions.length;
  const hintsOn = hintsEnabled !== false && maxHints > 0;
  const hintCap = hintsOn ? Math.max(0, maxHints) : 0;

  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | number[] | string>>({});
  const [hintsShown, setHintsShown] = useState<Record<number, number>>({});
  const [hintOpen, setHintOpen] = useState(true);
  const [resolved, setResolved] = useState<Record<number, QuizResolveStatus>>({});
  const [flashWrong, setFlashWrong] = useState<Record<number, boolean>>({});
  const [wrongTries, setWrongTries] = useState<Record<number, number>>({});

  useEffect(() => {
    setQi(0);
    setAnswers({});
    setHintsShown({});
    setHintOpen(true);
    setResolved({});
    setFlashWrong({});
    setWrongTries({});
  }, [resultKeyPrefix]);

  useEffect(() => {
    if (!open) return;
    setQi((cur) => {
      const firstOpen = questions.findIndex((_, i) => !resolved[i]);
      if (firstOpen >= 0) return firstOpen;
      return Math.min(cur, Math.max(0, n - 1));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const correct = Object.values(resolved).filter((v) => v === 'correct').length;
    const allDone = n > 0 && Object.keys(resolved).length >= n;
    onResolvedChange?.({
      keyPrefix: resultKeyPrefix,
      byIndex: resolved,
      correct,
      total: n,
      allDone,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, resultKeyPrefix, n]);

  if (!open || !n) return null;

  const q = questions[qi];
  const status = resolved[qi];
  const done = !!status;
  const reveal = status === 'revealed' || status === 'correct';
  const shown = hintsShown[qi] || 0;
  const hints = hintCap > 0
    ? hintsForQuestion(q, { count: hintCap, enabled: true }).slice(0, hintCap)
    : [];
  const progress = ((qi + (done ? 1 : 0.35)) / n) * 100;
  const sources = Array.isArray(q.sources) ? q.sources.filter((s) => s?.quote || s?.cite) : [];
  const why = String(q.explanation || '').trim();
  const canShowAnswer = hintCap > 0
    ? shown >= hintCap
    : (wrongTries[qi] || 0) >= 1;

  const checkAnswer = () => {
    if (!q || done || !hasAnswer(answers[qi])) return;
    if (isCorrect(q, answers[qi])) {
      setResolved((p) => ({ ...p, [qi]: 'correct' }));
      setFlashWrong((p) => ({ ...p, [qi]: false }));
      return;
    }
    setWrongTries((p) => ({ ...p, [qi]: (p[qi] || 0) + 1 }));
    if (hintCap > 0) {
      setHintsShown((p) => ({ ...p, [qi]: Math.min(hintCap, (p[qi] || 0) + 1) }));
      setHintOpen(true);
    }
    setFlashWrong((p) => ({ ...p, [qi]: true }));
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[qi];
      return next;
    });
  };

  const revealAndLock = () => {
    if (hintCap > 0) setHintsShown((p) => ({ ...p, [qi]: hintCap }));
    setResolved((p) => ({ ...p, [qi]: 'revealed' }));
    setFlashWrong((p) => ({ ...p, [qi]: false }));
    if (q.type === 'multi-select') setAnswers((p) => ({ ...p, [qi]: [...(q.correctIndices || [])] }));
    else if (q.type !== 'short-answer') setAnswers((p) => ({ ...p, [qi]: q.correct ?? 0 }));
    else if (q.sampleAnswer) setAnswers((p) => ({ ...p, [qi]: q.sampleAnswer || '' }));
  };

  const options = q.options || [];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-xl max-h-[min(920px,94vh)] flex flex-col rounded-[22px] bg-white overflow-hidden"
        style={{ boxShadow: '0 24px 64px -20px rgba(15,23,42,0.45)' }}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-start gap-2">
            <div
              className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(5,150,105,0.12)' }}
            >
              <BookOpen size={15} style={{ color: '#059669' }} />
            </div>
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{title}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  Question {qi + 1} of {n}
                </span>
                <div className="flex-1 min-w-[80px] h-1.5 rounded-full overflow-hidden" style={{ background: '#E5E7EB' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(8, progress))}%`, background: '#059669' }}
                  />
                </div>
                {fromLabel && (
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }} className="truncate max-w-[140px]">
                    from: {fromLabel}
                  </span>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/[0.04]" aria-label="Close">
              <X size={18} style={{ color: '#6B7280' }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <p style={{ fontSize: 15.5, fontWeight: 700, color: '#0B1220', lineHeight: 1.45, marginBottom: 14 }}>
            {q.question}
          </p>
          <QuestionMedia q={q} />

          {q.type === 'short-answer' ? (
            <input
              value={typeof answers[qi] === 'string' ? String(answers[qi]) : ''}
              disabled={done}
              onChange={(e) => {
                setAnswers((prev) => ({ ...prev, [qi]: e.target.value }));
                setFlashWrong((p) => ({ ...p, [qi]: false }));
              }}
              placeholder="Type your answer…"
              className="w-full rounded-xl px-4 py-2.5 mb-3"
              style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: '#FAFBFC' }}
            />
          ) : (
            <div className="space-y-2 mb-3">
              {options.map((opt, oi) => {
                const multi = q.type === 'multi-select';
                const chosen = multi
                  ? Array.isArray(answers[qi]) && (answers[qi] as number[]).includes(oi)
                  : answers[qi] === oi;
                const isRight = multi ? (q.correctIndices || []).includes(oi) : oi === q.correct;
                const showRight = reveal && isRight;
                const showWrong = reveal && chosen && !isRight;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={done}
                    onClick={() => {
                      if (multi) {
                        setAnswers((prev) => {
                          const cur = Array.isArray(prev[qi]) ? [...(prev[qi] as number[])] : [];
                          const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi];
                          return { ...prev, [qi]: next };
                        });
                      } else {
                        setAnswers((prev) => ({ ...prev, [qi]: oi }));
                      }
                      setFlashWrong((p) => ({ ...p, [qi]: false }));
                    }}
                    className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl transition-all"
                    style={{
                      fontSize: 13.5,
                      background: showRight ? 'rgba(5,150,105,0.08)' : showWrong ? 'rgba(239,68,68,0.06)' : chosen ? 'rgba(11,15,26,0.04)' : '#fff',
                      border: showRight
                        ? '1.5px solid rgba(5,150,105,0.45)'
                        : showWrong
                          ? '1.5px solid rgba(239,68,68,0.4)'
                          : chosen
                            ? '1.5px solid rgba(11,15,26,0.2)'
                            : '1.5px solid rgba(0,0,0,0.1)',
                      color: '#0B1220',
                      fontWeight: chosen || showRight ? 600 : 400,
                    }}
                  >
                    <span
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: showRight ? '#059669' : showWrong ? '#DC2626' : chosen ? '#0B0F1A' : '#F3F4F6',
                        color: showRight || showWrong || chosen ? '#fff' : '#6B7280',
                      }}
                    >
                      {letter(oi)}
                    </span>
                    <span className="flex-1 min-w-0">{opt}</span>
                    {showRight && <Check size={16} style={{ color: '#059669' }} />}
                    {showWrong && <X size={16} style={{ color: '#DC2626' }} />}
                  </button>
                );
              })}
            </div>
          )}

          {flashWrong[qi] && !done && (
            <p style={{ fontSize: 12.5, color: '#DC2626', fontWeight: 600, marginBottom: 10 }}>
              Not quite{hintCap > 0 && shown ? ` — hint ${shown} of ${hintCap}` : ''}. Try again.
            </p>
          )}

          {!done && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                disabled={!hasAnswer(answers[qi])}
                onClick={checkAnswer}
                className="px-4 py-2 rounded-full text-white text-xs font-semibold"
                style={{ background: '#0B0F1A', opacity: hasAnswer(answers[qi]) ? 1 : 0.45 }}
              >
                Check answer
              </button>
              {canShowAnswer && (
                <button
                  type="button"
                  onClick={revealAndLock}
                  className="px-4 py-2 rounded-full text-xs font-semibold border"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#374151' }}
                >
                  Show answer
                </button>
              )}
            </div>
          )}

          {/* Hints */}
          {shown > 0 && hints.length > 0 && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setHintOpen((v) => !v)}
                className="flex items-center gap-1.5 mb-1.5"
                style={{ fontSize: 12.5, fontWeight: 600, color: '#92400E' }}
              >
                <Lightbulb size={13} />
                {hintOpen ? 'Hide hint' : 'Show hint'}
              </button>
              {hintOpen && (
                <div
                  className="rounded-xl px-3.5 py-2.5"
                  style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}
                >
                  <p style={{ fontSize: 13, color: '#9A3412', lineHeight: 1.5 }}>
                    {hints[Math.max(0, shown - 1)]}
                  </p>
                  {shown > 1 && (
                    <p style={{ fontSize: 11, color: '#C2410C', marginTop: 6 }}>
                      Hint {shown} of {hintCap}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* WHY */}
          {reveal && why && (
            <div
              className="rounded-xl px-3.5 py-3 mb-3"
              style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.22)' }}
            >
              <p style={{ fontSize: 11, fontWeight: 750, color: '#047857', letterSpacing: '0.06em', marginBottom: 6 }}>
                WHY
              </p>
              <p style={{ fontSize: 13, color: '#065F46', lineHeight: 1.55 }}>{why}</p>
            </div>
          )}

          {/* Sources */}
          {reveal && sources.length > 0 && (
            <div
              className="rounded-xl px-3.5 py-3"
              style={{ background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <p
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: 750, color: '#6B7280', letterSpacing: '0.06em', marginBottom: 8 }}
              >
                <BookOpen size={12} /> FROM YOUR SOURCES
              </p>
              <ul className="space-y-2.5">
                {sources.map((s, si) => (
                  <li key={si}>
                    {s.quote && (
                      <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.45 }}>
                        “{s.quote.replace(/^["“]|["”]$/g, '')}”
                      </p>
                    )}
                    {s.cite && (
                      <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 2 }}>{s.cite}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-3"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#FAFBFC' }}
        >
          <button
            type="button"
            disabled={qi <= 0}
            onClick={() => setQi((v) => Math.max(0, v - 1))}
            className="flex items-center gap-0.5 px-2 py-1.5 text-sm font-medium disabled:opacity-35"
            style={{ color: '#4B5563' }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <div className="flex-1 text-center">
            <p style={{ fontSize: 11, color: '#9AA3AF' }}>
              {n} question{n !== 1 ? 's' : ''} · hints & explanations
            </p>
            <div className="flex justify-center gap-1.5 mt-1.5">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to question ${i + 1}`}
                  onClick={() => setQi(i)}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{
                    background: i === qi ? '#059669' : resolved[i] ? '#A7F3D0' : '#E5E7EB',
                  }}
                />
              ))}
            </div>
          </div>
          {qi < n - 1 ? (
            <button
              type="button"
              onClick={() => setQi((v) => Math.min(n - 1, v + 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-full text-white text-xs font-semibold"
              style={{ background: '#0B0F1A' }}
            >
              Next question <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-4 py-2 rounded-full text-white text-xs font-semibold"
              style={{ background: '#059669' }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card + modal controller for one cluster of questions. */
export function McqClusterExperience({
  title,
  fromLabel,
  questions,
  maxHints,
  hintsEnabled,
  onResolvedChange,
  resultKeyPrefix,
}: {
  title: string;
  fromLabel?: string;
  questions: McqClusterQuestion[];
  maxHints?: number;
  hintsEnabled?: boolean;
  onResolvedChange?: Parameters<typeof McqClusterModal>[0]['onResolvedChange'];
  resultKeyPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  if (!questions.length) return null;
  return (
    <>
      <McqClusterCard
        title={title}
        questionCount={questions.length}
        hintsEnabled={hintsEnabled}
        onEnter={() => setOpen(true)}
      />
      <McqClusterModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        fromLabel={fromLabel}
        questions={questions}
        maxHints={maxHints}
        hintsEnabled={hintsEnabled}
        onResolvedChange={onResolvedChange}
        resultKeyPrefix={resultKeyPrefix}
      />
    </>
  );
}
