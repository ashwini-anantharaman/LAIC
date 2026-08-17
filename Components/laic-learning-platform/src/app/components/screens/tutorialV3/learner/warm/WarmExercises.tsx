/**
 * The two exercise templates the reference export has and the platform did not:
 * `QuickDecisionsPage` and `TryItMatchingPage`, both from `App.tsx`.
 *
 * Neither is a quiz. Quick decisions asks the learner to commit privately and
 * then compare — nothing is marked, and the button carrying the answer is the
 * whole interaction. Matching is marked, but as one set rather than per item:
 * every option is used at most once, so assigning one to a second card takes it
 * off the first, and Check answers grades the arrangement.
 *
 * Both report to the learner-progress channel the same way every other block
 * does, so the sidebar's dots and the progress meter count them.
 */

import React, { useEffect, useState } from 'react';
import type { MatchingContent, QuickDecisionsContent } from '../../../../../../lib/types';
import { useLearnerProgress } from '../LearnerProgressContext';
import { SAGE, suitColor } from './theme';

/* ── quick decisions ───────────────────────────────────────────── */

export function WarmQuickDecisions({
  content,
  blockId,
}: {
  content: QuickDecisionsContent;
  blockId: string;
}) {
  const decisions = content.decisions || [];
  const [revealed, setRevealed] = useState<boolean[]>(() => decisions.map(() => false));
  const { markBlockDone } = useLearnerProgress();

  // A different set in the same slot starts over. Keyed on length rather than
  // on the array, which the reader rebuilds on every render.
  useEffect(() => {
    setRevealed(Array.from({ length: decisions.length }, () => false));
  }, [blockId, decisions.length]);

  const allRevealed = decisions.length > 0 && revealed.every(Boolean);

  useEffect(() => {
    if (allRevealed) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRevealed, blockId]);

  if (!decisions.length) return null;

  return (
    <div>
      {content.label && <span className="text-xs font-bold text-stone-400">{content.label.toUpperCase()}</span>}
      <h2 className="text-2xl text-stone-900 mt-1 mb-2">{content.title || 'Quick decisions'}</h2>
      {content.intro && <p className="text-stone-600 text-[15px] mb-6">{content.intro}</p>}

      <div className="space-y-3 mb-6">
        {decisions.map((d, i) => (
          <div
            key={i}
            className={`rounded-lg border p-5 transition-colors ${revealed[i] ? 'border-stone-300 bg-white' : 'border-stone-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-xs font-semibold text-stone-500">{d.label}</span>
                  {d.tag && <span className="text-xs font-bold text-stone-400">{d.tag}</span>}
                </div>
                <pre className="font-mono text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">{d.prompt}</pre>
                {revealed[i] && d.explanation && (
                  <p className="text-sm text-stone-600 mt-3 leading-relaxed">{d.explanation}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRevealed((prev) => prev.map((v, j) => (j === i ? true : v)))}
                disabled={revealed[i]}
                className={`shrink-0 px-4 py-2 rounded-full border-2 text-sm font-bold transition-all ${
                  revealed[i]
                    ? 'border-green-400 bg-green-50 text-green-800'
                    : 'border-stone-300 bg-stone-50 text-stone-600 hover:border-amber-400 hover:text-amber-800 cursor-pointer'
                }`}
              >
                {revealed[i] ? d.answer : 'Show answer'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {allRevealed && content.closing && (
        <div className="rounded-lg bg-stone-50 border border-stone-200 px-5 py-4">
          <p className="text-stone-600 text-sm leading-relaxed">{content.closing}</p>
        </div>
      )}
    </div>
  );
}

/* ── try it: matching ──────────────────────────────────────────── */

/** One monospaced body line, with the leading suit glyph coloured. */
function CardLine({ line }: { line: string }) {
  const head = line.trim().charAt(0);
  const isSuit = ['♠', '♥', '♦', '♣'].includes(head);
  if (!isSuit) return <div className="font-mono text-sm text-stone-800 mb-0.5">{line}</div>;
  return (
    <div className="flex items-center gap-2 font-mono text-sm mb-0.5">
      <span style={{ color: suitColor(head) }}>{head}</span>
      <span className="text-stone-800">{line.trim().slice(1).trim()}</span>
    </div>
  );
}

export function WarmMatching({
  content,
  blockId,
}: {
  content: MatchingContent;
  blockId: string;
}) {
  const cards = content.cards || [];
  const options = content.options || [];
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const { markBlockDone } = useLearnerProgress();

  useEffect(() => {
    setAssignments({});
    setSubmitted(false);
  }, [blockId, cards.length]);

  useEffect(() => {
    if (submitted) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, blockId]);

  if (!cards.length || !options.length) return null;

  /** An option belongs to one card at a time — assigning it moves it. */
  const assign = (cardLabel: string, option: string) => {
    if (submitted) return;
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === option) delete next[k]; });
      next[cardLabel] = option;
      return next;
    });
  };

  const allAssigned = cards.every((c) => assignments[c.label]);
  const allCorrect = cards.every((c) => assignments[c.label] === c.correct);
  const ref = content.reference;

  return (
    <div>
      {content.label && <span className="text-xs font-bold text-stone-400">{content.label.toUpperCase()}</span>}
      <h2 className="text-2xl text-stone-900 mt-1 mb-2">{content.title}</h2>
      {content.intro && <p className="text-stone-600 text-[15px] mb-5">{content.intro}</p>}

      {ref && ref.columns.length > 0 && ref.rows.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden mb-7">
          <div
            className="grid bg-stone-50 border-b border-stone-200"
            style={{ gridTemplateColumns: `repeat(${ref.columns.length}, minmax(0, 1fr))` }}
          >
            {ref.columns.map((h, i) => (
              <div key={i} className="px-4 py-2 text-xs font-bold text-stone-500">{h}</div>
            ))}
          </div>
          {ref.rows.map((row, ri) => (
            <div
              key={ri}
              className="grid border-b border-stone-100 last:border-0"
              style={{ gridTemplateColumns: `repeat(${ref.columns.length}, minmax(0, 1fr))` }}
            >
              {row.map((cell, ci) => (
                <div
                  key={ci}
                  className={ci === 0 ? 'px-4 py-3 font-mono font-medium text-stone-800' : 'px-4 py-3 text-sm text-stone-600'}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {content.prompt && <h3 className="text-lg text-stone-900 mb-4">{content.prompt}</h3>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {cards.map((card) => {
          const assigned = assignments[card.label];
          const isCorrect = submitted && assigned === card.correct;
          const isWrong = submitted && assigned !== card.correct;
          return (
            <div
              key={card.label}
              className={`rounded-lg border p-4 transition-colors ${
                isCorrect ? 'border-green-300 bg-green-50' : isWrong ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'
              }`}
            >
              <p className="text-xs font-bold text-stone-400 mb-2">{card.label}</p>
              {(card.lines || []).map((line, i) => <CardLine key={i} line={line} />)}

              <div className="mt-3 flex flex-col gap-1.5">
                {options.map((option) => {
                  const active = assigned === option;
                  const usedByOther = !active && Object.values(assignments).includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => assign(card.label, option)}
                      disabled={submitted}
                      className={`rounded-full border py-1 text-xs transition-all text-center ${
                        active && !submitted
                          ? 'border-amber-500 bg-amber-50 text-amber-900'
                          : active && isCorrect
                            ? 'border-green-500 bg-green-100 text-green-900 font-medium'
                            : active && isWrong
                              ? 'border-red-400 bg-red-100 text-red-800'
                              : usedByOther
                                ? 'border-stone-100 text-stone-300 cursor-default'
                                : 'border-stone-200 text-stone-600 hover:border-stone-400 cursor-pointer'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {submitted && card.explanation && (
                <p className="text-xs text-stone-500 mt-2 leading-snug">{card.explanation}</p>
              )}
            </div>
          );
        })}
      </div>

      {submitted ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            allCorrect ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          <span className="font-medium">{allCorrect ? '✓ Matched correctly. ' : 'Some mismatches. '}</span>
          {content.closing}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!allAssigned}
          className="px-6 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-30 transition-opacity"
          style={{ background: SAGE }}
        >
          Check answers
        </button>
      )}
    </div>
  );
}
