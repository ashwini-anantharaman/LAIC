/**
 * Structured V2 draft model — Plan → Structure → Sources → Author → Review
 * for quiz / flashcard-set / concept-card / video-script objects.
 *
 * Structure is extracted from the object's template (Define knob defaults):
 *   quiz          → categories, each proposing individual question slots
 *   flashcard-set → card-style groups (template `cc`), each with card slots
 *   concept-card  → the template's enabled sheet categories (one slot each)
 *   video-script  → checkpoint slots (template `ncp`)
 *
 * Each slot is authored by hand (with optional image/video) or filled by
 * per-unit AI generation (pick sources → mark up → generate).
 */
import type {
  Block,
  AssistantMessage,
  ConceptCardContent,
  FlashcardItem,
  QuestionContent,
  QuizContent,
  VideoScriptContent,
} from '../types';
import type { YtTranscriptSegment } from '../api';
import type { V2SourceRef } from '../tutorialV2/types';
import {
  DEFAULT_CONCEPT_CATEGORIES,
  categoryBody,
  normalizeConceptCardContent,
  resolveConceptCategories,
  slugCategoryId,
} from '../conceptCard';

export type StructuredObjectType = 'quiz' | 'flashcard-set' | 'concept-card' | 'video-script';
export type XV2Phase = 'start' | 'structure' | 'sources' | 'navigator' | 'unit' | 'review';
export type XAuthorMode = 'empty' | 'written' | 'generated' | 'mixed';
export type XSlotKind = 'question' | 'card' | 'category' | 'checkpoint' | 'media';

export interface XSlotMedia {
  url: string;
  kind: 'image' | 'video';
  caption?: string;
}

export interface XV2Slot {
  id: string;
  /** Row heading (e.g. "Question 2", "Card 3", the category label). */
  title: string;
  /** What this slot should verify/teach — steers generation. */
  intent?: string;
  kind: XSlotKind;
  /** kind=question | checkpoint */
  question?: QuestionContent;
  /** kind=checkpoint — pause time in seconds. */
  time?: number;
  /** kind=card */
  card?: FlashcardItem;
  /** kind=category */
  body?: string;
  categoryId?: string;
  /** kind=media (standalone), or attached media for a category slot. */
  media?: XSlotMedia;
  done: boolean;
}

export interface XV2Unit {
  id: string;
  title: string;
  intent?: string;
  slots: XV2Slot[];
  authorMode: XAuthorMode;
  /** Per-unit generate pipeline state (sub-select from the shared pool). */
  pickedSourceIds?: string[];
  highlights?: any[];
  markupFlags?: any[];
  done: boolean;
  required: boolean;
}

export interface StructuredV2Draft {
  id: string;
  type: StructuredObjectType;
  title: string;
  metadata: {
    objective?: string;
    audience?: string;
    level?: string;
    authoringPath?: 'template' | 'write-yourself';
    [key: string]: any;
  };
  templateId?: string;
  /** Define knob values seeded from the template (generation settings). */
  fv: Record<string, any>;
  units: XV2Unit[];
  sourcePool: V2SourceRef[];
  /** Uploaded media pool (images/videos) usable inside items. */
  media?: any[];
  /** video-script only — the actual video the player runs. */
  video?: { url: string; videoId: string; title?: string; transcript?: YtTranscriptSegment[] };
  assistantMessages?: AssistantMessage[];
  refineHighlights?: any[];
  status: 'draft' | 'submitted' | 'ready';
  phase?: XV2Phase;
  activeUnitId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function newXId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function touchXDraft(draft: StructuredV2Draft, patch: Partial<StructuredV2Draft>): StructuredV2Draft {
  return { ...draft, ...patch, updatedAt: new Date().toISOString() };
}

export const STRUCTURED_V2_TYPES: StructuredObjectType[] = [
  'quiz', 'flashcard-set', 'concept-card', 'video-script',
];

export function isStructuredV2Type(t: string | null | undefined): t is StructuredObjectType {
  return !!t && (STRUCTURED_V2_TYPES as string[]).includes(t);
}

export const X_NOUNS: Record<StructuredObjectType, string> = {
  quiz: 'quiz',
  'flashcard-set': 'flashcard set',
  'concept-card': 'concept card',
  'video-script': 'video script',
};

/** What a unit is called per type (Structure/Author copy). */
export const X_UNIT_NOUN: Record<StructuredObjectType, string> = {
  quiz: 'category',
  'flashcard-set': 'card group',
  'concept-card': 'category',
  'video-script': 'checkpoint group',
};

/** What a slot is called per type. */
export const X_SLOT_NOUN: Record<StructuredObjectType, string> = {
  quiz: 'question',
  'flashcard-set': 'card',
  'concept-card': 'category',
  'video-script': 'checkpoint',
};

/* ── slot factories ─────────────────────────────────────────── */

export function blankQuestion(): QuestionContent {
  return { question: '', type: 'multiple-choice', options: ['', '', '', ''], correct: 0, explanation: '' };
}

export function blankSlot(type: StructuredObjectType, index: number, patch?: Partial<XV2Slot>): XV2Slot {
  const base: XV2Slot = {
    id: newXId('slot'),
    title: '',
    kind: 'question',
    done: false,
  };
  if (type === 'quiz') {
    Object.assign(base, { kind: 'question', title: `Question ${index + 1}`, question: blankQuestion() });
  } else if (type === 'flashcard-set') {
    Object.assign(base, { kind: 'card', title: `Card ${index + 1}`, card: { front: '', back: '' } });
  } else if (type === 'concept-card') {
    Object.assign(base, { kind: 'category', title: `Category ${index + 1}`, body: '' });
  } else {
    Object.assign(base, {
      kind: 'checkpoint',
      title: `Checkpoint ${index + 1}`,
      time: 30 * (index + 1),
      question: blankQuestion(),
    });
  }
  return { ...base, ...patch };
}

export function mediaSlot(kind: 'image' | 'video'): XV2Slot {
  return {
    id: newXId('slot'),
    title: kind === 'image' ? 'Image' : 'Video',
    kind: 'media',
    media: { url: '', kind },
    done: false,
  };
}

/* ── Structure: template → units ────────────────────────────── */

export function seedUnitsFromTemplate(type: StructuredObjectType, fv: Record<string, any>): XV2Unit[] {
  const mkUnit = (title: string, slots: XV2Slot[], intent = ''): XV2Unit => ({
    id: newXId('unit'),
    title,
    intent,
    slots,
    authorMode: 'empty',
    done: false,
    required: true,
  });

  if (type === 'quiz') {
    const nq = Math.max(1, Math.min(30, Number(fv.nq) || 8));
    const slots = Array.from({ length: nq }, (_, i) => blankSlot('quiz', i));
    return [mkUnit('Core questions', slots, String(fv.concepts || fv.verify || ''))];
  }

  if (type === 'flashcard-set') {
    const styles: string[] = Array.isArray(fv.cc) && fv.cc.length ? fv.cc : ['Key terms → definitions'];
    const nc = Math.max(1, Math.min(60, Number(fv.nc) || 12));
    const per = Math.max(1, Math.floor(nc / styles.length));
    let remainder = nc - per * styles.length;
    return styles.map((style) => {
      const count = per + (remainder-- > 0 ? 1 : 0);
      const slots = Array.from({ length: count }, (_, i) => blankSlot('flashcard-set', i));
      return mkUnit(style, slots);
    });
  }

  if (type === 'concept-card') {
    const cats = resolveConceptCategories(fv.categories).filter((c) => c.enabled);
    const list = cats.length ? cats : DEFAULT_CONCEPT_CATEGORIES.filter((c) => c.enabled);
    return list.map((cat) => mkUnit(cat.label, [
      blankSlot('concept-card', 0, { title: cat.label, categoryId: cat.id }),
    ]));
  }

  // video-script
  const ncp = Math.max(1, Math.min(12, Number(fv.ncp) || 4));
  const slots = Array.from({ length: ncp }, (_, i) => blankSlot('video-script', i));
  return [mkUnit('Checkpoints', slots, String(fv.obj || ''))];
}

export function emptyStructuredDraft(
  type: StructuredObjectType,
  patch?: Partial<StructuredV2Draft>,
): StructuredV2Draft {
  const now = new Date().toISOString();
  return {
    id: newXId('xv2'),
    type,
    title: '',
    metadata: {},
    fv: {},
    units: [],
    sourcePool: [],
    status: 'draft',
    phase: 'start',
    activeUnitId: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/* ── status helpers ─────────────────────────────────────────── */

export function slotHasContent(slot: XV2Slot): boolean {
  if (slot.kind === 'question' || slot.kind === 'checkpoint') {
    return !!String(slot.question?.question || '').trim();
  }
  if (slot.kind === 'card') return !!(String(slot.card?.front || '').trim() || slot.card?.imageUrl);
  if (slot.kind === 'category') return !!String(slot.body || '').trim() || !!slot.media?.url;
  return !!slot.media?.url;
}

export type XUnitStatus = 'not_started' | 'in_progress' | 'done';

export function unitStatus(unit: XV2Unit): XUnitStatus {
  const withContent = unit.slots.filter(slotHasContent).length;
  if (unit.done || (unit.slots.length > 0 && withContent === unit.slots.length)) return 'done';
  if (withContent > 0) return 'in_progress';
  return 'not_started';
}

export function bumpXAuthorMode(current: XAuthorMode, next: 'written' | 'generated'): XAuthorMode {
  if (current === 'empty') return next;
  if (current === next) return current;
  return 'mixed';
}

export function allUnitsReady(units: XV2Unit[]): boolean {
  const withSlots = units.filter((u) => u.slots.length > 0);
  if (!withSlots.length) return false;
  return withSlots.every((u) => !u.required || unitStatus(u) !== 'not_started');
}

/* ── unit/slot mutation helpers ─────────────────────────────── */

export function updateUnit(draft: StructuredV2Draft, unitId: string, patch: Partial<XV2Unit>): StructuredV2Draft {
  return touchXDraft(draft, {
    units: draft.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
  });
}

export function updateSlot(
  draft: StructuredV2Draft,
  unitId: string,
  slotId: string,
  patch: Partial<XV2Slot>,
): StructuredV2Draft {
  return updateUnit(draft, unitId, {
    slots: (draft.units.find((u) => u.id === unitId)?.slots || []).map((s) => (
      s.id === slotId ? { ...s, ...patch, done: patch.done ?? slotHasContent({ ...s, ...patch }) } : s
    )),
  });
}

/* ── assembly: units → library blocks ───────────────────────── */

function passMarkFrom(fv: Record<string, any>): number {
  return parseInt(String(fv.pass || '70').replace('%', ''), 10) || 70;
}

/** Inverse of conceptCard.categoryBody — write a category body onto content. */
function setCategoryBody(content: Record<string, any>, id: string, body: string, title: string) {
  const b = body || '';
  switch (id) {
    case 'meaning': content.oneSentenceMeaning = b; break;
    case 'why': content.whyItMatters = b; break;
    case 'core': content.coreIdea = b; break;
    case 'components': content.keyComponents = b.split('\n').map((s) => s.trim()).filter(Boolean); break;
    case 'example': content.example = b; break;
    case 'nonExample': content.nonExample = b; break;
    case 'visual': content.visualOrFormula = b; break;
    case 'mistake': content.commonMistake = b; break;
    case 'connection': content.connection = b; break;
    case 'recall': content.recallQuestion = b; break;
    case 'teachBack': content.teachBack = b; break;
    default: {
      const sections = (content.extraSections ||= []);
      sections.push({ id, title, body: b });
    }
  }
}

export function draftToConceptContent(draft: StructuredV2Draft): ConceptCardContent {
  const content: Record<string, any> = {
    term: draft.title || draft.metadata.objective || 'Concept',
    categories: resolveConceptCategories(draft.fv.categories),
    extraSections: [],
    categoryMedia: {},
  };
  for (const unit of draft.units) {
    for (const slot of unit.slots) {
      if (slot.kind !== 'category') continue;
      const id = slot.categoryId || slugCategoryId(slot.title || unit.title);
      setCategoryBody(content, id, slot.body || '', slot.title || unit.title);
      if (slot.media?.url) content.categoryMedia[id] = { ...slot.media };
      // Make sure custom categories appear on the sheet.
      if (!(content.categories as any[]).some((c) => c.id === id)) {
        content.categories.push({ id, label: slot.title || unit.title, enabled: true, builtin: false, tone: 'blue' });
      }
    }
  }
  return normalizeConceptCardContent(content);
}

function slotQuestion(slot: XV2Slot, label?: string): QuestionContent {
  const q = slot.question || blankQuestion();
  return {
    ...q,
    ...(label ? { label } : {}),
    ...(String(slot.intent || '').trim() && !q.explanation ? {} : {}),
  };
}

export function unitsToBlocks(draft: StructuredV2Draft): Block[] {
  const blocks: Block[] = [];
  const fv = draft.fv || {};

  if (draft.type === 'quiz') {
    const contentUnits = draft.units.filter((u) => u.slots.some((s) => s.kind === 'question' && slotHasContent(s)));
    const multi = contentUnits.length > 1;
    for (const unit of draft.units) {
      const questions = unit.slots
        .filter((s) => s.kind === 'question' && slotHasContent(s))
        .map((s) => slotQuestion(s, multi ? unit.title : undefined));
      if (questions.length) {
        const content: QuizContent = {
          questions,
          passRequired: fv.passOn !== false,
          ...(fv.passOn !== false ? { passMark: passMarkFrom(fv) } : {}),
          showExplanations: fv.show || 'After attempt',
          ...(String(fv.adaptive || 'No') === 'Yes' ? { adaptive: true } : {}),
        };
        blocks.push({ id: `blk-quiz-${unit.id}`, type: 'quiz', content } as Block);
      }
      for (const s of unit.slots) {
        if (s.kind === 'media' && s.media?.url) blocks.push(mediaBlock(s));
      }
    }
    return blocks;
  }

  if (draft.type === 'flashcard-set') {
    const cards: FlashcardItem[] = [];
    for (const unit of draft.units) {
      for (const s of unit.slots) {
        if (s.kind === 'card' && slotHasContent(s) && s.card) {
          cards.push({
            front: s.card.front,
            back: s.card.back,
            ...(s.card.hook ? { hook: s.card.hook } : {}),
            ...(s.card.hint ? { hint: s.card.hint } : {}),
            ...(s.card.imageUrl ? { imageUrl: s.card.imageUrl } : {}),
            ...(s.card.videoUrl ? { videoUrl: s.card.videoUrl } : {}),
          });
        }
      }
    }
    if (cards.length) {
      blocks.push({
        id: `blk-fc-${draft.id}`,
        type: 'flashcard-set',
        content: { cards, direction: 'front-to-back' },
      } as Block);
    }
    for (const unit of draft.units) {
      for (const s of unit.slots) {
        if (s.kind === 'media' && s.media?.url) blocks.push(mediaBlock(s));
      }
    }
    return blocks;
  }

  if (draft.type === 'concept-card') {
    blocks.push({ id: `blk-cc-${draft.id}`, type: 'concept-card', content: draftToConceptContent(draft) } as Block);
    return blocks;
  }

  // video-script
  const checkpoints = draft.units.flatMap((u) => u.slots)
    .filter((s) => s.kind === 'checkpoint' && slotHasContent(s))
    .map((s, i) => ({
      id: s.id,
      time: typeof s.time === 'number' ? s.time : 30 * (i + 1),
      question: slotQuestion(s),
    }))
    .sort((a, b) => a.time - b.time);
  const content: VideoScriptContent = {
    provider: 'youtube',
    videoUrl: draft.video?.url || '',
    videoId: draft.video?.videoId || '',
    ...(draft.video?.title ? { title: draft.video.title } : {}),
    transcript: (draft.video?.transcript || []) as any,
    checkpoints,
    showTranscript: fv.showTranscript !== false,
    enableChat: fv.enableChat !== false,
    requireAnswer: true,
  };
  blocks.push({ id: `blk-vs-${draft.id}`, type: 'video-script', content } as Block);
  return blocks;
}

function mediaBlock(slot: XV2Slot): Block {
  const m = slot.media!;
  if (m.kind === 'video') {
    return {
      id: `blk-media-${slot.id}`,
      type: 'video-embed',
      content: { provider: 'youtube', url: m.url, videoId: parseYtIdLoose(m.url), caption: m.caption || '' },
    } as Block;
  }
  return {
    id: `blk-media-${slot.id}`,
    type: 'image',
    content: { url: m.url, caption: m.caption || '', alt: m.caption || '' },
  } as Block;
}

/** Minimal YouTube id extraction (mirror of TutorialV2SourcePanel.parseYtId). */
export function parseYtIdLoose(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/* ── reopen: blocks → units (legacy objects without a draft) ── */

export function blocksToUnits(type: StructuredObjectType, blocks: Block[], fv: Record<string, any>): {
  units: XV2Unit[];
  video?: StructuredV2Draft['video'];
} {
  const mkUnit = (title: string, slots: XV2Slot[]): XV2Unit => ({
    id: newXId('unit'), title, slots, authorMode: 'written', done: slots.length > 0, required: true,
  });

  if (type === 'quiz') {
    const units: XV2Unit[] = [];
    let idx = 0;
    for (const b of blocks || []) {
      if (b.type !== 'quiz') continue;
      const qs: QuestionContent[] = ((b.content as any)?.questions || []);
      const slots = qs.map((q, i) => ({
        ...blankSlot('quiz', i),
        title: q.label || `Question ${i + 1}`,
        question: { ...q },
        done: true,
      }));
      units.push(mkUnit(qs[0]?.label || (idx === 0 ? 'Core questions' : `Group ${idx + 1}`), slots));
      idx += 1;
    }
    return { units: units.length ? units : seedUnitsFromTemplate('quiz', fv) };
  }

  if (type === 'flashcard-set') {
    const cards: FlashcardItem[] = (blocks || [])
      .filter((b) => b.type === 'flashcard-set')
      .flatMap((b) => ((b.content as any)?.cards || []));
    if (!cards.length) return { units: seedUnitsFromTemplate('flashcard-set', fv) };
    const slots = cards.map((c, i) => ({
      ...blankSlot('flashcard-set', i),
      card: { ...c },
      done: true,
    }));
    return { units: [mkUnit('Cards', slots)] };
  }

  if (type === 'concept-card') {
    const blk = (blocks || []).find((b) => b.type === 'concept-card');
    const content = normalizeConceptCardContent((blk?.content as any) || {});
    const cats = (content.categories || []).filter((c) => c.enabled);
    const units = (cats.length ? cats : DEFAULT_CONCEPT_CATEGORIES.filter((c) => c.enabled)).map((cat) => {
      const body = categoryBody(content, cat.id);
      const media = content.categoryMedia?.[cat.id];
      const slot: XV2Slot = {
        ...blankSlot('concept-card', 0, { title: cat.label, categoryId: cat.id }),
        body,
        ...(media ? { media: { ...media } } : {}),
        done: !!(body || media?.url),
      };
      return mkUnit(cat.label, [slot]);
    });
    return { units };
  }

  // video-script
  const blk = (blocks || []).find((b) => b.type === 'video-script');
  const c = (blk?.content || {}) as VideoScriptContent;
  const slots = (c.checkpoints || []).map((cp, i) => ({
    ...blankSlot('video-script', i),
    id: cp.id || newXId('slot'),
    time: cp.time,
    question: { ...cp.question },
    done: true,
  }));
  return {
    units: [
      {
        id: newXId('unit'),
        title: 'Checkpoints',
        slots: slots.length ? slots : seedUnitsFromTemplate('video-script', fv)[0].slots,
        authorMode: slots.length ? 'written' : 'empty',
        done: slots.length > 0,
        required: true,
      },
    ],
    video: c.videoId || c.videoUrl
      ? { url: c.videoUrl || '', videoId: c.videoId || '', title: c.title, transcript: (c.transcript || []) as any }
      : undefined,
  };
}

export function draftFromLearningObjectX(obj: {
  id: string;
  type: string;
  title: string;
  description?: string;
  blocks?: Block[];
  structuredV2Draft?: StructuredV2Draft;
}): StructuredV2Draft | null {
  if (!isStructuredV2Type(obj.type)) return null;
  const raw = obj.structuredV2Draft;
  if (raw && raw.type === obj.type && Array.isArray(raw.units)) {
    return { ...raw, id: obj.id, title: obj.title || raw.title };
  }
  return null;
}

/* ── Hoot adapter: slots ⇄ assistant parts ──────────────────── */

/** Flatten slots to TutorialEditorPart-style bags so Hoot can see/patch them. */
export function partsForAssistant(draft: StructuredV2Draft): any[] {
  const parts: any[] = [];
  for (const unit of draft.units) {
    for (const slot of unit.slots) {
      if (slot.kind === 'question' || slot.kind === 'checkpoint') {
        const q = slot.question || blankQuestion();
        parts.push({
          id: slot.id,
          type: 'question',
          label: slot.title,
          prompt: q.question,
          question: q.question,
          options: q.options || [],
          correct: q.correct ?? 0,
          explanation: q.explanation || '',
          imageUrl: q.imageUrl || '',
          videoUrl: q.videoUrl || '',
          ...(slot.kind === 'checkpoint' ? { time: slot.time } : {}),
        });
      } else if (slot.kind === 'card') {
        parts.push({
          id: slot.id,
          type: 'flashcard',
          label: slot.title,
          front: slot.card?.front || '',
          back: slot.card?.back || '',
          hook: slot.card?.hook || '',
          hint: slot.card?.hint || '',
          imageUrl: slot.card?.imageUrl || '',
          videoUrl: slot.card?.videoUrl || '',
        });
      } else if (slot.kind === 'category') {
        parts.push({
          id: slot.id,
          type: 'rich-text',
          label: slot.title,
          heading: slot.title,
          body: slot.body || '',
          imageUrl: slot.media?.kind === 'image' ? slot.media.url : '',
          videoUrl: slot.media?.kind === 'video' ? slot.media.url : '',
        });
      } else if (slot.media) {
        parts.push({
          id: slot.id,
          type: slot.media.kind,
          label: slot.title,
          url: slot.media.url,
          caption: slot.media.caption || '',
        });
      }
    }
  }
  return parts;
}

/** Find a slot (and its unit) by id. */
export function findSlot(draft: StructuredV2Draft, slotId: string): { unit: XV2Unit; slot: XV2Slot } | null {
  for (const unit of draft.units) {
    const slot = unit.slots.find((s) => s.id === slotId);
    if (slot) return { unit, slot };
  }
  return null;
}

const str = (v: unknown) => (v == null ? undefined : String(v));

/** Apply Hoot EditActions (already flattened) onto the draft's units. */
export function applyAssistantActionsToDraft(
  draft: StructuredV2Draft,
  actions: any[],
): { draft: StructuredV2Draft; affectedIds: string[] } {
  let next = draft;
  const affected: string[] = [];

  const patchSlot = (slotId: string, patch: Record<string, any>) => {
    const found = findSlot(next, slotId);
    if (!found) return;
    const { unit, slot } = found;
    let slotPatch: Partial<XV2Slot> = {};
    if (slot.kind === 'question' || slot.kind === 'checkpoint') {
      const q = { ...(slot.question || blankQuestion()) };
      if (patch.question != null || patch.prompt != null) q.question = String(patch.question ?? patch.prompt);
      if (Array.isArray(patch.options)) q.options = patch.options.map((o: any) => String(o));
      if (patch.correct != null) q.correct = Number(patch.correct);
      if (patch.explanation != null) q.explanation = String(patch.explanation);
      if (patch.hint != null) q.hint = String(patch.hint);
      if (patch.imageUrl != null) q.imageUrl = str(patch.imageUrl);
      if (patch.videoUrl != null) q.videoUrl = str(patch.videoUrl);
      if (patch.url != null) {
        // Hoot image add/update targeted at a question — attach it.
        q.imageUrl = String(patch.url);
      }
      slotPatch = { question: q, ...(patch.time != null ? { time: Number(patch.time) } : {}) };
    } else if (slot.kind === 'card') {
      const card = { ...(slot.card || { front: '', back: '' }) };
      if (patch.front != null) card.front = String(patch.front);
      if (patch.back != null) card.back = String(patch.back);
      if (patch.hook != null) card.hook = String(patch.hook);
      if (patch.hint != null) card.hint = String(patch.hint);
      if (patch.imageUrl != null || patch.url != null) card.imageUrl = String(patch.imageUrl ?? patch.url);
      if (patch.videoUrl != null) card.videoUrl = String(patch.videoUrl);
      slotPatch = { card };
    } else if (slot.kind === 'category') {
      slotPatch = {
        ...(patch.body != null || patch.text != null ? { body: String(patch.body ?? patch.text) } : {}),
        ...(patch.imageUrl != null || patch.url != null
          ? { media: { url: String(patch.imageUrl ?? patch.url), kind: 'image' as const, caption: str(patch.caption) } }
          : {}),
        ...(patch.videoUrl != null
          ? { media: { url: String(patch.videoUrl), kind: 'video' as const, caption: str(patch.caption) } }
          : {}),
      };
    } else {
      slotPatch = {
        media: {
          url: String(patch.url ?? slot.media?.url ?? ''),
          kind: slot.media?.kind || 'image',
          caption: str(patch.caption) ?? slot.media?.caption,
        },
      };
    }
    next = updateSlot(next, unit.id, slot.id, slotPatch);
    affected.push(slot.id);
  };

  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'update_block' && a.blockId && a.patch) {
      patchSlot(String(a.blockId), a.patch);
    } else if (a.type === 'delete_block' && a.blockId) {
      const found = findSlot(next, String(a.blockId));
      if (found) {
        next = updateUnit(next, found.unit.id, {
          slots: found.unit.slots.filter((s) => s.id !== found.slot.id),
        });
      }
    } else if (a.type === 'add_block') {
      const targetUnit = next.units.find((u) => u.id === next.activeUnitId) || next.units[next.units.length - 1];
      if (!targetUnit) continue;
      const content = a.content || {};
      const bt = String(a.blockType || '').toLowerCase();
      let slot: XV2Slot | null = null;
      if (bt === 'image' || bt === 'video') {
        // Attach to the most recently affected slot if any; else standalone media slot.
        const lastId = affected[affected.length - 1];
        if (lastId) {
          patchSlot(lastId, bt === 'image' ? { imageUrl: content.url } : { videoUrl: content.url });
          continue;
        }
        slot = mediaSlot(bt as 'image' | 'video');
        slot.media = { url: String(content.url || ''), kind: bt as 'image' | 'video', caption: str(content.caption) };
        slot.done = !!slot.media.url;
      } else if (next.type === 'quiz' || next.type === 'video-script') {
        slot = blankSlot(next.type, targetUnit.slots.length, {
          title: str(a.label) || undefined,
          question: {
            ...blankQuestion(),
            question: String(content.question ?? content.prompt ?? content.text ?? ''),
            options: Array.isArray(content.options) ? content.options.map((o: any) => String(o)) : ['', '', '', ''],
            correct: content.correct != null ? Number(content.correct) : 0,
            explanation: String(content.explanation || ''),
          },
        });
        slot.done = slotHasContent(slot);
      } else if (next.type === 'flashcard-set') {
        slot = blankSlot('flashcard-set', targetUnit.slots.length, {
          title: str(a.label) || undefined,
          card: {
            front: String(content.front ?? content.term ?? content.text ?? ''),
            back: String(content.back ?? content.definition ?? ''),
            ...(content.imageUrl || content.url ? { imageUrl: String(content.imageUrl || content.url) } : {}),
          },
        });
        slot.done = slotHasContent(slot);
      } else {
        slot = blankSlot('concept-card', targetUnit.slots.length, {
          title: str(a.label) || 'New category',
          body: String(content.body ?? content.text ?? ''),
        });
        slot.done = slotHasContent(slot);
      }
      if (slot) {
        next = updateUnit(next, targetUnit.id, { slots: [...targetUnit.slots, slot] });
        affected.push(slot.id);
      }
    } else if (a.type === 'update_metadata' && a.patch) {
      next = touchXDraft(next, {
        ...(a.patch.title != null ? { title: String(a.patch.title) } : {}),
        metadata: {
          ...next.metadata,
          ...(a.patch.objective != null ? { objective: String(a.patch.objective) } : {}),
          ...(a.patch.audience != null ? { audience: String(a.patch.audience) } : {}),
          ...(a.patch.level != null ? { level: String(a.patch.level) } : {}),
        },
      });
    }
  }

  return { draft: next, affectedIds: affected };
}
