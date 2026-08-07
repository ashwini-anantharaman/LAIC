/**
 * Bridge Tutorial V2 parts ↔ per-type object editors (concept card, flashcards, quiz, …).
 */
import type { Block, ObjectType } from '../types';
import type { TutorialV2Part } from './types';

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

function snapBlocks(part: TutorialV2Part): Block[] {
  return Array.isArray(part.snapshotBlocks) ? (part.snapshotBlocks as Block[]) : [];
}

function firstBlockOfType(blocks: Block[], type: string): Block | undefined {
  return blocks.find((b) => b?.type === type) || blocks[0];
}

/** Resolve which dedicated editor a part should open, if any. */
export function nestedEditorKindForPart(part: TutorialV2Part): NestedEditorKind | null {
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

export function nestedEditorTitle(part: TutorialV2Part, kind: NestedEditorKind): string {
  if (part.libraryTitle) return String(part.libraryTitle);
  if (kind === 'concept-card' && (part as any).concept) return String((part as any).concept);
  if (part.label) return String(part.label);
  return kind;
}

export function extractConceptCardPayload(part: TutorialV2Part): Record<string, unknown> {
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

export function extractFlashcardPayload(part: TutorialV2Part): {
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

export function extractQuizPayload(part: TutorialV2Part): {
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

export function extractStructuredPayload(part: TutorialV2Part, kind: NestedEditorKind): Record<string, unknown> | null {
  const block = firstBlockOfType(snapBlocks(part), kind);
  if (block?.content && typeof block.content === 'object') {
    return { ...(block.content as object) };
  }
  return null;
}

function asLibraryEmbed(
  part: TutorialV2Part,
  objectType: ObjectType,
  title: string,
  snapshotBlocks: Block[],
): Partial<TutorialV2Part> {
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
  part: TutorialV2Part,
  content: Record<string, unknown>,
): Partial<TutorialV2Part> {
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
  part: TutorialV2Part,
  cards: Array<{ front: string; back: string; hook?: string; hint?: string; imageUrl?: string }>,
  direction?: string,
): Partial<TutorialV2Part> {
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
  part: TutorialV2Part,
  questions: any[],
  meta?: { passMark?: number; showExplanations?: string; adaptive?: boolean },
): Partial<TutorialV2Part> {
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
  part: TutorialV2Part,
  kind: 'assignment' | 'reflection' | 'summary' | 'drill',
  content: Record<string, unknown>,
): Partial<TutorialV2Part> {
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

export function isNestedEditablePart(part: TutorialV2Part): boolean {
  return nestedEditorKindForPart(part) != null;
}
