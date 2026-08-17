/**
 * The reference export's `TutorialHome` — the catalogue a learner picks a
 * tutorial from.
 *
 * This is the one piece of the reference that is not part of a tutorial object:
 * it is the screen in front of them. It appears in the Object Library when a
 * folder has been opened and holds tutorials, so the shelf a course developer
 * built is what a learner sees, and it stays out of the way everywhere else.
 *
 * Every value on a card comes from the object: its title, description, tags,
 * estimated time, status, and the number of learner pages its blocks paginate
 * into. Nothing here is authored twice.
 */

import React, { useMemo } from 'react';
import type { LearningObject, ObjectStatus } from '../../../../../../lib/types';
import { expandTutorialBlocks } from '../../../../../../lib/libraryEmbed';
import { paginateTutorialBlocks, TUTORIAL_WORDS_PER_PAGE } from '../../../../../../lib/tutorialPages.js';
import { SAGE, WARM_BG, WARM_FONT } from './theme';

/** Object types that belong on this shelf. */
const TUTORIAL_TYPES = new Set(['tutorial', 'tutorial-v2', 'tutorial-v3']);

export function isTutorialObject(o: LearningObject): boolean {
  return TUTORIAL_TYPES.has(String(o.type));
}

/** The library's own status vocabulary, in the reference's chip. */
const STATUS: Record<ObjectStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#d97706' },
  'in-review': { label: 'In review', color: '#d97706' },
  'changes-requested': { label: 'Changes requested', color: '#dc2626' },
  approved: { label: 'Approved', color: '#16a34a' },
  published: { label: 'Published', color: '#16a34a' },
  archived: { label: 'Archived', color: '#6b7280' },
};

/** How many learner pages this tutorial's blocks come to. */
function pageCountOf(o: LearningObject): number {
  try {
    const pages = paginateTutorialBlocks(expandTutorialBlocks(o.blocks || []), {
      wordsPerPage: TUTORIAL_WORDS_PER_PAGE,
    });
    return pages.length || 1;
  } catch {
    return 1;
  }
}

export function WarmTutorialCatalogue({
  title,
  subtitle,
  tutorials,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  tutorials: LearningObject[];
  /** Opens the student preview — the same action the library row's eye icon takes. */
  onOpen: (objectId: string) => void;
}) {
  const cards = useMemo(
    () => tutorials.map((t) => ({ t, pages: pageCountOf(t) })),
    [tutorials],
  );

  if (!cards.length) return null;

  return (
    <div className="rounded-[22px] overflow-hidden" style={{ background: WARM_BG, fontFamily: WARM_FONT }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 mb-2">{title}</h1>
        {subtitle && (
          <p className="text-stone-500 text-[15px] mb-8 sm:mb-10 font-medium">{subtitle}</p>
        )}

        <div className="space-y-4">
          {cards.map(({ t, pages }) => {
            const status = STATUS[t.status] || STATUS.draft;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t.id)}
                className="w-full text-left rounded-2xl bg-white shadow-sm p-5 sm:p-7 hover:shadow-md transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: `${status.color}18`, color: status.color }}
                      >
                        {status.label}
                      </span>
                      <span className="text-xs text-stone-400 font-semibold">
                        {pages} page{pages === 1 ? '' : 's'}
                        {t.estimatedTime ? ` · ${t.estimatedTime}` : ''}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-stone-900 mb-2">{t.title}</h2>
                    {t.description && (
                      <p className="text-stone-500 text-sm sm:text-[15px] leading-relaxed mb-3 sm:mb-4 font-medium">
                        {t.description}
                      </p>
                    )}
                    {(t.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(t.tags || []).map((tag, i) => (
                          <span
                            key={i}
                            className="text-xs text-stone-500 bg-stone-100 rounded-full px-3 py-1 font-semibold"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <span
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white text-sm font-black transition-opacity group-hover:opacity-90"
                      style={{ background: SAGE }}
                    >
                      Start →
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
