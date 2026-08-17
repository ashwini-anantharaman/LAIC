/**
 * The two pages the reference export wraps every tutorial in — its
 * `LessonOverviewPage` and `LessonCompletePage` from `App.tsx` — built from the
 * draft rather than hand-written.
 *
 * A generated Tutorial V3 has no "lesson overview" or "lesson complete" block:
 * those are not things a course developer authors, they are the covers on the
 * front and back of the lesson. Both are assembled from data the tutorial
 * already carries — the objective written on Start, the section intents from
 * Plan, the end-with note from Structure, and the learner's own progress.
 *
 * Where a tutorial has nothing to fill a panel with, the panel is left out
 * rather than filled with placeholder text.
 */

import React from 'react';
import type { TutorialV3Draft } from '../../../../../../lib/tutorialV3/types';
import type { LearnerProgressState, LearnerSection } from '../progress';
import { SAGE } from './theme';

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
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 mb-5">
          <h2 className="text-xl text-stone-900 mb-5">What you will learn</h2>
          <ol className="space-y-4">
            {objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-4">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
                  style={{ background: SAGE }}
                >
                  {i + 1}
                </span>
                <span className="text-stone-700 text-[15px] leading-snug pt-0.5">{obj}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {coreIdea && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-5">
          <h2 className="text-xl text-stone-900 mb-3">Core idea</h2>
          <p className="text-stone-700 text-[15px] leading-relaxed whitespace-pre-wrap">{coreIdea}</p>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-xl text-stone-900 mb-2">Ready?</h2>
            <p className="text-stone-600 text-sm leading-relaxed">
              Takes about {duration.replace('~', '')}.
              {audience ? ` Written for ${audience}.` : ''}
              {' '}Explanations appear as you answer, and the sidebar keeps your place.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="sm:shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium transition-opacity hover:opacity-90 self-start"
            style={{ background: SAGE }}
          >
            Start lesson →
          </button>
        </div>
      </div>
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
  const read = sections.filter((s) => progress.visitedSections.includes(s.id));

  /**
   * The reference's fourth tile is "revisited", which needs a per-item history
   * the learner-progress channel does not keep. These four are the ones that
   * can be told truthfully from what it does.
   */
  const stats = [
    { val: String(pageCount), label: 'pages' },
    { val: String(finished.length), label: 'completed' },
    { val: String(Math.max(0, work.length - finished.length)), label: 'unfinished' },
    { val: `${read.length}/${sections.length}`, label: 'sections read' },
  ];

  const checklist = sections
    .filter((s) => (s.interactiveBlockIds.length
      ? s.interactiveBlockIds.every((id) => progress.doneBlocks.includes(id))
      : progress.visitedSections.includes(s.id)))
    .map((s) => s.title);

  const whatNext = String(draft.structure?.endWith || '').trim();
  const allDone = work.length > 0 && finished.length >= work.length;

  return (
    <div>
      <h2 className="text-3xl text-stone-900 mb-1">
        {allDone ? 'Nice work — you finished the lesson' : 'That is the end of the lesson'}
      </h2>
      <p className="text-stone-600 text-[15px] mb-8">
        {allDone
          ? `You completed ${draft.title || 'this tutorial'} and every exercise in it.`
          : 'You reached the last page. Anything still open is listed below — the sidebar will take you back to it.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <div className="text-4xl text-stone-900 mb-1">{s.val}</div>
            <div className="text-xs text-stone-400 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {checklist.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-6 mb-5">
          <h3 className="text-lg text-stone-900 mb-4">What you got through</h3>
          <ul className="space-y-3">
            {checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] shrink-0 mt-0.5">
                  ✓
                </span>
                <span className="text-stone-700 text-[15px]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h3 className="text-lg text-stone-900 mb-2">What&rsquo;s next?</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              {whatNext || 'Return to the tutorial list and pick up the next lesson.'}
            </p>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="sm:shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium hover:opacity-90 self-start"
              style={{ background: SAGE }}
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
