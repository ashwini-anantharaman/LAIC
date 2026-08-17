/**
 * Learner-side progress for a generated Tutorial V3.
 *
 * `V3Section.done` and `SectionAuthorMode` mean "the author finished writing
 * it". The sidebar's dots mean something else entirely — "the learner finished
 * it" — so this is a second, separate signal, derived from what the learner has
 * actually resolved rather than from anything in the draft.
 *
 * State lives in localStorage under the object id: it is the learner's, not the
 * content's, and must never ride along in the saved object.
 */

import type { Block } from '../../../../../lib/types';
import type { TutorialV3Draft, V3Section } from '../../../../../lib/tutorialV3/types';
import { paginateTutorialBlocks, TUTORIAL_WORDS_PER_PAGE } from '../../../../../lib/tutorialPages.js';

/** Block types a learner can finish. Everything else is read-through prose. */
const INTERACTIVE_TYPES = new Set([
  'quiz',
  'question',
  'opening-question',
  'quick-decisions',
  'matching',
  'flashcard-set',
  'concept-card',
  'bidding-sequence',
  'bridge-play',
  'bridge-table',
]);

export type LearnerSectionStatus = 'not_started' | 'in_progress' | 'done';

/** One sidebar row: a section, the pages it covers, and the work inside it. */
export interface LearnerSection {
  id: string;
  title: string;
  required: boolean;
  /** 1-based position, for the §n label. */
  index: number;
  /** Learner pages (1-based) this section's blocks land on. */
  pages: number[];
  /** Ids of the blocks in this section that a learner can finish. */
  interactiveBlockIds: string[];
  /** Every block id in the section, interactive or not. */
  blockIds: string[];
}

export interface LearnerProgressState {
  /** Block ids the learner has finished. */
  doneBlocks: string[];
  /** Section ids the learner has opened. */
  visitedSections: string[];
  /** Concept cards bookmarked to the glossary. */
  bookmarks: string[];
}

export const EMPTY_PROGRESS: LearnerProgressState = {
  doneBlocks: [],
  visitedSections: [],
  bookmarks: [],
};

const KEY = (objectId: string) => `laic-tutorial-v3-learner-progress:${objectId}`;

export function loadProgress(objectId: string): LearnerProgressState {
  try {
    const raw = localStorage.getItem(KEY(objectId));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_PROGRESS;
    return {
      doneBlocks: Array.isArray(parsed.doneBlocks) ? parsed.doneBlocks.filter((x: unknown) => typeof x === 'string') : [],
      visitedSections: Array.isArray(parsed.visitedSections) ? parsed.visitedSections.filter((x: unknown) => typeof x === 'string') : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(objectId: string, state: LearnerProgressState): void {
  try {
    localStorage.setItem(KEY(objectId), JSON.stringify(state));
  } catch {
    /* private mode / quota — progress is a convenience, never a blocker */
  }
}

/**
 * The pages the reader will actually show.
 *
 * Delegated to the reader's own paginator rather than re-derived here: it
 * honours the author's hard breaks when Structure assigned pages and falls back
 * to a word budget when it did not, and a sidebar that disagreed with the pager
 * about where page 3 begins would be worse than no sidebar.
 */
export function paginate(blocks: Block[]): Block[][] {
  const pages = paginateTutorialBlocks(blocks, { wordsPerPage: TUTORIAL_WORDS_PER_PAGE });
  return pages.length ? pages : [blocks];
}

/** Which learner page (1-based) each block lands on. */
export function pageOfBlocks(blocks: Block[]): Record<string, number> {
  const out: Record<string, number> = {};
  paginate(blocks).forEach((page, pi) => {
    for (const b of page) out[b.id] = pi + 1;
  });
  return out;
}

/** Total learner pages implied by the block stream. */
export function pageCount(blocks: Block[]): number {
  return paginate(blocks).length || 1;
}

/**
 * Sidebar rows, built by tracing each section's part ids into the block stream
 * the reader will actually paginate.
 *
 * That stream must be the EXPANDED one: a library embed becomes several blocks
 * before the reader sees it, and a sidebar built from unexpanded parts would
 * put page boundaries where the pager does not. Expanded children keep their
 * parent's id as a prefix (`parentId__0`), which is what the prefix match below
 * is for. Blocks no section contributed — top-level slots — belong to no row
 * and simply do not appear.
 */
export function buildLearnerSections(draft: TutorialV3Draft, blocks: Block[]): LearnerSection[] {
  const pages = pageOfBlocks(blocks);
  const byId = new Map(blocks.map((b) => [b.id, b]));

  /** Every block a part produced: itself, or the children it expanded into. */
  const blocksForPart = (partId: string): string[] => {
    if (byId.has(partId)) return [partId];
    const prefix = `${partId}__`;
    return blocks.filter((b) => b.id.startsWith(prefix)).map((b) => b.id);
  };

  return (draft.sections || []).map((sec: V3Section, i) => {
    const blockIds = (sec.parts || []).flatMap((p) => blocksForPart(p.id));
    const sectionPages = [...new Set(blockIds.map((id) => pages[id]).filter((p) => p != null))].sort((a, b) => a - b);
    return {
      id: sec.id,
      title: sec.title?.trim() || `Section ${i + 1}`,
      required: !!sec.required,
      index: i + 1,
      pages: sectionPages.length ? sectionPages : [1],
      interactiveBlockIds: blockIds.filter((id) => INTERACTIVE_TYPES.has(String(byId.get(id)?.type))),
      blockIds,
    };
  });
}

/**
 * A section's status in the learner's terms.
 *
 * A section with nothing to answer is finished once it has been read, which is
 * the only signal available for prose; a section with work in it is finished
 * only when every piece of that work is.
 */
export function sectionStatus(
  section: LearnerSection,
  progress: LearnerProgressState,
): LearnerSectionStatus {
  const visited = progress.visitedSections.includes(section.id);
  const work = section.interactiveBlockIds;
  if (!work.length) return visited ? 'done' : 'not_started';
  const done = work.filter((id) => progress.doneBlocks.includes(id)).length;
  if (done >= work.length) return 'done';
  if (done > 0 || visited) return 'in_progress';
  return 'not_started';
}

/**
 * Percentage for the sidebar meter.
 *
 * Counted over units of work rather than over sections, so a long section full
 * of questions cannot be worth the same single tick as a one-paragraph one.
 * Sections with no work each count as a single unit so reading still moves it.
 */
export function overallPercent(
  sections: LearnerSection[],
  progress: LearnerProgressState,
): number {
  let total = 0;
  let done = 0;
  for (const s of sections) {
    if (s.interactiveBlockIds.length) {
      total += s.interactiveBlockIds.length;
      done += s.interactiveBlockIds.filter((id) => progress.doneBlocks.includes(id)).length;
    } else {
      total += 1;
      if (progress.visitedSections.includes(s.id)) done += 1;
    }
  }
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

/** The section a learner page belongs to, for the header's section band. */
export function sectionForPage(sections: LearnerSection[], page: number): LearnerSection | null {
  return sections.find((s) => s.pages.includes(page)) || null;
}
