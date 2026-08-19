/**
 * A published learning object, read as source material for a new one.
 *
 * Quizzes are most often written about a tutorial that already exists, and
 * until now the only way to do that was to find the tutorial's original PDF and
 * mark it up a second time — which tests the source rather than the lesson, and
 * drifts from it the moment the tutorial is edited.
 *
 * A tutorial is better source material than the PDF behind it: it has already
 * been curated, and it has SECTIONS. That is the difference this file exists to
 * preserve — a PDF is a wall of sentences, a tutorial is an outline, and an
 * author writing a quiz nearly always wants "test sections 2 and 4" rather than
 * the whole thing.
 */
import type { Block, LearningObject } from './types';
import { expandTutorialBlocks } from './libraryEmbed';
import { docFromText } from './pdf';

/** The object types worth offering as source material. */
export const CONTENT_SOURCE_TYPES = [
  'tutorial-v3',
  'tutorial-v2',
  'tutorial',
  'lesson',
  'course',
] as const;

export interface ContentSection {
  id: string;
  title: string;
  /** Prose in reading order, already split the way a pasted source would be. */
  sentences: { text: string; page: number }[];
  words: number;
}

/**
 * Blocks whose text is a question, not teaching.
 *
 * A quiz generated from another quiz's questions restates them, which is not a
 * new assessment — it is a copy with the answers attached. The prose those
 * questions were written from is what a generator needs.
 */
const ASSESSMENT_TYPES = new Set([
  'quiz',
  'question',
  'opening-question',
  'matching',
  'quick-decisions',
  'drill',
]);

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * The teaching text inside one block, whatever shape it keeps it in.
 *
 * Deliberately field-driven rather than a switch per block type: a new block
 * type that carries prose in `text` or `body` is picked up without this file
 * being told about it, and one that carries prose somewhere exotic contributes
 * nothing rather than breaking the harvest.
 */
function proseFromBlock(block: Block): string {
  if (ASSESSMENT_TYPES.has(String(block.type))) return '';
  const c = (block.content || {}) as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of ['text', 'body', 'definition', 'oneSentenceMeaning', 'example', 'intro', 'coreIdea', 'coreRule', 'caption', 'whatNext', 'closing']) {
    const v = str(c[key]);
    if (v) parts.push(v);
  }
  // Lists: objectives, a completion checklist.
  for (const key of ['objectives', 'checklist']) {
    const list = c[key];
    if (Array.isArray(list)) parts.push(...list.map(str).filter(Boolean));
  }
  // A reference table's rows are facts, and among the most quizzable text a
  // tutorial holds — flattened one row per line so a row stays one sentence.
  if (Array.isArray(c.columns) && Array.isArray(c.rows)) {
    const cols = (c.columns as unknown[]).map(str);
    for (const row of c.rows as unknown[]) {
      if (!Array.isArray(row)) continue;
      const cells = row.map(str);
      const line = cols
        .map((col, i) => (cells[i] ? `${col ? `${col}: ` : ''}${cells[i]}` : ''))
        .filter(Boolean)
        .join('; ');
      if (line) parts.push(line);
    }
  }
  // Flashcards teach in pairs; the back is the fact.
  if (Array.isArray(c.cards)) {
    for (const card of c.cards as unknown[]) {
      if (!card || typeof card !== 'object') continue;
      const front = str((card as Record<string, unknown>).front);
      const back = str((card as Record<string, unknown>).back);
      if (front && back) parts.push(`${front} — ${back}`);
    }
  }
  return parts.join(' ');
}

/** The heading a block opens a section with, if it opens one. */
function headingOf(block: Block): string {
  const c = (block.content || {}) as Record<string, unknown>;
  return str(c.heading) || str(c.title);
}

function countWords(sentences: { text: string }[]): number {
  return sentences.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
}

/**
 * Split an object into the sections an author would recognise.
 *
 * Read from the BLOCKS rather than from a tutorial draft: the draft is
 * authoring state that lives only in the browser that wrote it, and this has to
 * work for any published object from any machine. A block carrying a heading
 * opens a section; everything after it belongs there until the next heading.
 *
 * Sections with no prose in them are dropped — a section that is nothing but a
 * quiz has nothing to offer a generator, and offering an empty checkbox invites
 * an author to pick it and wonder why the questions are thin.
 */
export function sectionsFromObject(obj: LearningObject): ContentSection[] {
  const blocks = expandTutorialBlocks(obj.blocks || []) as Block[];
  const groups: { title: string; text: string[]; id: string }[] = [];

  for (const b of blocks) {
    const heading = headingOf(b);
    if (heading || !groups.length) {
      groups.push({ id: `sec-${b.id}`, title: heading || obj.title || 'Section', text: [] });
    }
    const prose = proseFromBlock(b);
    if (prose) groups[groups.length - 1].text.push(prose);
  }

  return groups
    .map((g) => {
      const sentences = docFromText(g.text.join('\n\n'), g.title).sentences || [];
      return { id: g.id, title: g.title, sentences, words: countWords(sentences) };
    })
    .filter((s) => s.sentences.length > 0);
}

/** What the Sources step holds once a piece of content has been picked. */
export interface PickedContentSource {
  objectId: string;
  title: string;
  type: string;
  /**
   * The version this was read from, so a quiz can later be told the tutorial
   * has moved on. Absent for objects with no version history.
   */
  versionId?: string;
  sections: ContentSection[];
  /** Which sections the author chose. Empty means all of them. */
  pickedSectionIds: string[];
}

export function pickedSections(src: PickedContentSource): ContentSection[] {
  if (!src.pickedSectionIds.length) return src.sections;
  return src.sections.filter((s) => src.pickedSectionIds.includes(s.id));
}

/** Sentences from the chosen sections, in reading order. */
export function sentencesFromPickedContent(src: PickedContentSource): { text: string; page: number }[] {
  const out: { text: string; page: number }[] = [];
  pickedSections(src).forEach((sec, i) => {
    // One "page" per section, so a marked-up quote can be traced back to the
    // section it came from rather than to a flat offset in the whole tutorial.
    for (const s of sec.sentences) out.push({ text: s.text, page: i + 1 });
  });
  return out;
}

export function contentSourceLabel(src: PickedContentSource): string {
  const picked = src.pickedSectionIds.length;
  if (!picked || picked === src.sections.length) return src.title;
  return `${src.title} · ${picked} of ${src.sections.length} sections`;
}
