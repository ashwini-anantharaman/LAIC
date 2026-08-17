/**
 * Bridge Tutorial V3 parts ↔ per-type object editors (concept card, flashcards, quiz, …).
 */
import type { Block, ObjectType } from '../types';
import type { TutorialV3Part } from './types';

export type NestedEditorKind =
  | 'concept-card'
  | 'flashcard-set'
  | 'quiz'
  | 'assignment'
  | 'reflection'
  | 'summary'
  | 'drill';

const EDITOR_KINDS = new Set<string>([
  'concept-card',
  'flashcard-set',
  'quiz',
  'assignment',
  'reflection',
  'summary',
  'drill',
]);

function snapBlocks(part: TutorialV3Part): Block[] {
  return Array.isArray(part.snapshotBlocks) ? (part.snapshotBlocks as Block[]) : [];
}

function firstBlockOfType(blocks: Block[], type: string): Block | undefined {
  return blocks.find((b) => b?.type === type) || blocks[0];
}

/** Resolve which dedicated editor a part should open, if any. */
export function nestedEditorKindForPart(part: TutorialV3Part): NestedEditorKind | null {
  if (part.type === 'library-embed') {
    const ot = String(part.objectType || '');
    if (EDITOR_KINDS.has(ot)) return ot as NestedEditorKind;
    return null;
  }
  if (part.type === 'concept-card') return 'concept-card';
  if (part.type === 'section-quiz' || part.type === 'question') return 'quiz';
  // Generated placeholders sometimes land as rich-text with an embed label.
  const label = String(part.label || '').toLowerCase();
  if (part.type === 'rich-text' || !part.type) {
    if (label.includes('flashcard')) return 'flashcard-set';
    if (label.includes('concept')) return 'concept-card';
    if (label.includes('quiz')) return 'quiz';
    if (label.includes('assignment')) return 'assignment';
    if (label.includes('reflection')) return 'reflection';
  }
  return null;
}

export function nestedEditorTitle(part: TutorialV3Part, kind: NestedEditorKind): string {
  if (part.libraryTitle) return String(part.libraryTitle);
  if (kind === 'concept-card' && (part as any).concept) return String((part as any).concept);
  if (part.label) return String(part.label);
  return kind;
}

export function extractConceptCardPayload(part: TutorialV3Part): Record<string, unknown> {
  const block = firstBlockOfType(snapBlocks(part), 'concept-card');
  if (block?.content && typeof block.content === 'object') {
    return { ...(block.content as object) };
  }
  return {
    term: part.concept || part.label || '',
    oneSentenceMeaning: part.plain || part.body || '',
    definition: part.plain || part.body || '',
    example: part.misc || '',
    nonExample: '',
  };
}

export function extractFlashcardPayload(part: TutorialV3Part): {
  cards: Array<{ id?: string; front: string; back: string; hook?: string; hint?: string; imageUrl?: string }>;
  direction?: string;
} {
  const block = firstBlockOfType(snapBlocks(part), 'flashcard-set');
  const content = (block?.content || {}) as any;
  const cards = Array.isArray(content.cards) ? content.cards : [];
  return {
    cards: cards.map((c: any, i: number) => ({
      id: c.id || `c-${i}`,
      front: c.front || '',
      back: c.back || '',
      hook: c.hook,
      hint: c.hint,
      imageUrl: c.imageUrl,
    })),
    direction: content.direction,
  };
}

export function extractQuizPayload(part: TutorialV3Part): {
  questions: any[];
  passMark?: number;
  showExplanations?: string;
  adaptive?: boolean;
} {
  if (part.type === 'section-quiz' || part.type === 'question') {
    if (Array.isArray(part.questions) && part.questions.length) {
      return { questions: part.questions };
    }
    if (part.type === 'question') {
      return {
        questions: [{
          question: part.prompt || '',
          options: part.options || [],
          correct: part.correct ?? 0,
          explanation: part.exp || '',
        }],
      };
    }
  }
  const block = firstBlockOfType(snapBlocks(part), 'quiz');
  const content = (block?.content || {}) as any;
  return {
    questions: Array.isArray(content.questions) ? content.questions : [],
    passMark: content.passMark,
    showExplanations: content.showExplanations,
    adaptive: content.adaptive,
  };
}

export function extractStructuredPayload(part: TutorialV3Part, kind: NestedEditorKind): Record<string, unknown> | null {
  const block = firstBlockOfType(snapBlocks(part), kind);
  if (block?.content && typeof block.content === 'object') {
    return { ...(block.content as object) };
  }
  return null;
}

/**
 * Whether a part has anything in it yet.
 *
 * A scaffolded recipe slot — "Section quiz 1" before anything is written or
 * generated — is a real part with a real id and no content. Opening it in
 * student preview shows a blank page, which reads as a broken editor rather
 * than an empty one, so the nested editor uses this to land on Edit instead.
 */
export function isNestedPartEmpty(part: TutorialV3Part, kind: NestedEditorKind): boolean {
  if (kind === 'quiz') return extractQuizPayload(part).questions.length === 0;
  if (kind === 'flashcard-set') return extractFlashcardPayload(part).cards.length === 0;
  if (kind === 'concept-card') {
    const c = extractConceptCardPayload(part);
    return !['term', 'oneSentenceMeaning', 'definition'].some((k) => String(c[k] || '').trim());
  }
  return extractStructuredPayload(part, kind) == null;
}

function asLibraryEmbed(
  part: TutorialV3Part,
  objectType: ObjectType,
  title: string,
  snapshotBlocks: Block[],
): Partial<TutorialV3Part> {
  return {
    type: 'library-embed',
    objectType,
    libraryTitle: title,
    label: part.label || `Embedded · ${title}`,
    snapshotBlocks,
    versionPin: part.versionPin || { objectId: 'generated', versionId: 'inline' },
  };
}

export function applyConceptCardResult(
  part: TutorialV3Part,
  content: Record<string, unknown>,
): Partial<TutorialV3Part> {
  const title = String(content.term || part.libraryTitle || 'Concept card');
  const blocks: Block[] = [{
    id: `${part.id}_cc`,
    type: 'concept-card',
    content,
  }];
  if (part.type === 'library-embed' || nestedEditorKindForPart(part) === 'concept-card') {
    return {
      ...asLibraryEmbed(part, 'concept-card', title, blocks),
      concept: title,
      plain: String(content.oneSentenceMeaning || content.definition || ''),
      misc: String(content.example || ''),
    };
  }
  return {
    type: 'concept-card',
    concept: title,
    plain: String(content.oneSentenceMeaning || content.definition || ''),
    misc: String(content.example || ''),
    label: title,
  };
}

export function applyFlashcardResult(
  part: TutorialV3Part,
  cards: Array<{ front: string; back: string; hook?: string; hint?: string; imageUrl?: string }>,
  direction?: string,
): Partial<TutorialV3Part> {
  const title = part.libraryTitle || part.label || 'Flashcard set';
  const blocks: Block[] = [{
    id: `${part.id}_fc`,
    type: 'flashcard-set',
    content: {
      cards,
      direction: direction || 'front-to-back',
    },
  }];
  return asLibraryEmbed(part, 'flashcard-set', String(title), blocks);
}

export function applyQuizResult(
  part: TutorialV3Part,
  questions: any[],
  meta?: { passMark?: number; showExplanations?: string; adaptive?: boolean },
): Partial<TutorialV3Part> {
  if (part.type === 'section-quiz' || part.type === 'question') {
    return { questions, type: 'section-quiz', label: part.label || 'Section quiz' };
  }
  const title = part.libraryTitle || part.label || 'Quiz';
  const blocks: Block[] = [{
    id: `${part.id}_quiz`,
    type: 'quiz',
    content: {
      questions,
      passRequired: true,
      passMark: meta?.passMark ?? 70,
      showExplanations: meta?.showExplanations || 'After attempt',
      adaptive: meta?.adaptive,
    },
  }];
  return asLibraryEmbed(part, 'quiz', String(title), blocks);
}

export function applyStructuredResult(
  part: TutorialV3Part,
  kind: 'assignment' | 'reflection' | 'summary' | 'drill',
  content: Record<string, unknown>,
): Partial<TutorialV3Part> {
  const title = String(
    (content as any).objective
    || (content as any).goal
    || (content as any).title
    || part.libraryTitle
    || part.label
    || kind,
  );
  const blocks: Block[] = [{
    id: `${part.id}_${kind}`,
    type: kind,
    content,
  }];
  return asLibraryEmbed(part, kind, title, blocks);
}

/**
 * Tutorial V3 block types embedded in a tutorial.
 *
 * They have no dedicated object editor — there is no standalone `matching` to
 * edit — so they are authored by generating them and refined by regenerating.
 * The write pane needs to recognise them so they do not fall through to the
 * plain-text branch and offer a body textarea for a block that has no body.
 */
const V3_BLOCK_EMBEDS = new Set<string>([
  'lesson-overview',
  'lesson-complete',
  'reference-table',
  'quick-decisions',
  'matching',
  'opening-question',
]);

export function isV3BlockEmbedPart(part: TutorialV3Part): boolean {
  if (V3_BLOCK_EMBEDS.has(String(part.type))) return true;
  return part.type === 'library-embed' && V3_BLOCK_EMBEDS.has(String(part.objectType));
}

export function v3BlockEmbedLabel(part: TutorialV3Part): string {
  const t = V3_BLOCK_EMBEDS.has(String(part.type)) ? String(part.type) : String(part.objectType || '');
  return t.replace(/-/g, ' ');
}

export function isNestedEditablePart(part: TutorialV3Part): boolean {
  return nestedEditorKindForPart(part) != null;
}
