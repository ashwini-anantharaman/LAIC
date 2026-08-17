/**
 * The two pages the reference export wraps every tutorial in, built from the
 * draft rather than hand-written.
 *
 * A generated Tutorial V3 has no "lesson overview" or "lesson complete" block —
 * those are not things a course developer authors, they are the covers the
 * reference puts on the front and back of the lesson. Both are assembled here
 * from data the tutorial already carries: the objective written on Start, the
 * section intents written on Plan, the end-with note from Structure, and the
 * learner's own progress.
 *
 * Where a tutorial has nothing to fill a panel with, the panel is left out
 * rather than filled with placeholder text.
 */

import React from 'react';
import type { TutorialV3Draft } from '../../../../../../lib/tutorialV3/types';
import type { LearnerProgressState, LearnerSection } from '../progress';
import { SAGE } from './theme';
import { WarmCard } from './WarmPrimitives';

/** The objectives list: one line per section, the author's intent if they wrote one. */
function objectivesOf(draft: TutorialV3Draft): string[] {
  const defined = draft.tutorialDefinition?.sections || [];
  const fromPlan = defined
    .map((s) => (s.intent || '').trim() || (s.title || '').trim())
    .filter(Boolean);
  if (fromPlan.length) return fromPlan;
  return (draft.sections || [])
    .map((s) => (s.intent || '').trim() || (s.title || '').trim())
    .filter(Boolean);
}

export function WarmLessonOverview({
  draft,
  duration,
  onStart,
}: {
  draft: TutorialV3Draft;
  duration: string;
  onStart: () => void;
}) {
  const intro = String(draft.metadata?.objective || draft.tutorialDefinition?.objective || '').trim();
  const objectives = objectivesOf(draft);
  const coreIdea = String(draft.metadata?.notes || '').trim();
  const audience = [draft.metadata?.audience, draft.metadata?.level]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      {intro && <p className="text-stone-600 text-[15px] leading-relaxed mb-8">{intro}</p>}

      {objectives.length > 0 && (
        <WarmCard className="p-6 mb-5">
          <h2 className="text-xl font-bold text-stone-900 mb-5">What you will learn</h2>
          <ol className="space-y-4">
            {objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
                  style={{ background: SAGE }}
                >
                  {i + 1}
                </span>
                <span className="text-stone-700 text-[15px] leading-snug pt-0.5 font-medium">{obj}</span>
              </li>
            ))}
          </ol>
        </WarmCard>
      )}

      {coreIdea && (
        <WarmCard tone="amber" className="p-6 mb-5">
          <h2 className="text-xl font-bold text-stone-900 mb-3">Core idea</h2>
          <p className="text-stone-700 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">{coreIdea}</p>
        </WarmCard>
      )}

      <WarmCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Ready?</h2>
            <p className="text-stone-600 text-sm leading-relaxed font-medium">
              Takes about {duration.replace('~', '')}.
              {audience ? ` Written for ${audience}.` : ''}
              {' '}Explanations appear as you answer, and the sidebar keeps your place.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="sm:shrink-0 flex items-center gap-2 px-7 py-3 rounded-full text-white text-base font-black hover:opacity-90 transition-opacity self-start"
            style={{ background: SAGE }}
          >
            Start lesson →
          </button>
        </div>
      </WarmCard>
    </div>
  );
}

export function WarmLessonComplete({
  draft,
  sections,
  progress,
  pageCount,
  onBack,
}: {
  draft: TutorialV3Draft;
  /** The content sections only — the two cover pages are not lesson work. */
  sections: LearnerSection[];
  progress: LearnerProgressState;
  pageCount: number;
  onBack?: () => void;
}) {
  const work = sections.flatMap((s) => s.interactiveBlockIds);
  const finished = work.filter((id) => progress.doneBlocks.includes(id));
  const readOnly = sections.filter((s) => !s.interactiveBlockIds.length);
  const readOnlyDone = readOnly.filter((s) => progress.visitedSections.includes(s.id));

  const stats = [
    { val: String(pageCount), label: 'pages' },
    { val: String(finished.length), label: 'exercises finished' },
    { val: String(Math.max(0, work.length - finished.length)), label: 'still open' },
    { val: `${readOnlyDone.length}/${readOnly.length || 0}`, label: 'sections read' },
  ];

  const checklist = sections
    .filter((s) => {
      if (s.interactiveBlockIds.length) {
        return s.interactiveBlockIds.every((id) => progress.doneBlocks.includes(id));
      }
      return progress.visitedSections.includes(s.id);
    })
    .map((s) => s.title);

  const whatNext = String(draft.structure?.endWith || '').trim();
  const allDone = work.length > 0 && finished.length >= work.length;

  return (
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-1">
        {allDone ? 'Nice work — you finished the lesson' : 'That is the end of the lesson'}
      </h2>
      <p className="text-stone-500 text-[15px] mb-8 font-medium">
        {allDone
          ? `You completed ${draft.title || 'this tutorial'} and every exercise in it.`
          : 'You reached the last page. Anything still open is listed below — the sidebar will take you back to it.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        {stats.map((s) => (
          <WarmCard key={s.label} className="p-4 text-center">
            <div className="text-4xl font-black text-stone-900 mb-1">{s.val}</div>
            <div className="text-xs text-stone-400 font-bold">{s.label}</div>
          </WarmCard>
        ))}
      </div>

      {checklist.length > 0 && (
        <WarmCard className="p-6 mb-5">
          <h3 className="text-lg font-bold text-stone-900 mb-4">What you got through</h3>
          <ul className="space-y-3">
            {checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] shrink-0 mt-0.5 font-bold"
                  style={{ background: SAGE }}
                >
                  ✓
                </span>
                <span className="text-stone-700 text-[15px] font-medium">{item}</span>
              </li>
            ))}
          </ul>
        </WarmCard>
      )}

      {(whatNext || onBack) && (
        <WarmCard tone="stone" className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-stone-900 mb-1">What&rsquo;s next?</h3>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                {whatNext || 'Return to the tutorial list and pick up the next lesson.'}
              </p>
            </div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="sm:shrink-0 flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-black hover:opacity-90 self-start"
                style={{ background: SAGE }}
              >
                Continue →
              </button>
            )}
          </div>
        </WarmCard>
      )}
    </div>
  );
}
