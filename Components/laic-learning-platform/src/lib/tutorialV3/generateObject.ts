/**
 * Generate ONE embedded object's blocks from marked-up source.
 *
 * Lifted out of `TutorialV3ObjectGeneratePane` so it has two callers rather
 * than one: the pane, which generates the slot an author is standing in, and
 * the batch runner, which generates several from a single markup pass. Keeping
 * it in the pane would have meant the batch path reimplementing every per-type
 * branch, and the two drifting apart the first time one of them changed.
 *
 * Everything it needs arrives as an argument. It owns no state, touches no
 * draft, and returns blocks — deciding what to do with them is the caller's.
 */

import {
  generateConceptCard,
  generateFlashcards,
  generateQuiz,
  generateStructuredObject,
  type GeneratedCard,
  type GeneratedConceptCard,
  type GeneratedQuizQuestion,
  type StructuredObjectKind,
  type TutorialExtract,
} from '../api';
import { resolveConceptCategories } from '../conceptCard';
import type { Block, ClusteredKnowledgeBase, ContentUnit } from '../types';

/**
 * The block types Tutorial V3 added. They share one branch because they share
 * one contract: a Define group shaped to the prompt, a single JSON object back,
 * and a block whose `type` is the object type itself.
 */
const V3_BLOCK_TYPES = new Set([
  'lesson-overview',
  'lesson-complete',
  'reference-table',
  'quick-decisions',
  'matching',
  'opening-question',
]);

export interface GenerateObjectOptions {
  objectType: string;
  /** Human noun for messages — "flashcard set", "quiz". */
  noun: string;
  title: string;
  /** Define-step values for this object type. */
  define: Record<string, any>;
  extracts: TutorialExtract[];
  /** Units behind the extracts, used by the card and quiz retrievers. */
  markupUnits: ContentUnit[];
  knowledgeBase?: ClusteredKnowledgeBase | null;
  shapeIntent?: string;
  /** Distinguishes generated block ids when several run together. */
  slotId: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export async function generateObjectBlocks(
  opts: GenerateObjectOptions,
): Promise<{ blocks: Block[]; title: string }> {
  const {
    objectType, noun, title, define, extracts, markupUnits,
    knowledgeBase, shapeIntent, slotId, signal, onProgress,
  } = opts;

  let blocks: Block[] = [];
  let resultTitle = title;

  if (objectType === 'flashcard-set') {
    const collected: GeneratedCard[] = [];
    for await (const ev of generateFlashcards({
      title,
      config: {
        mem: define.mem || title,
        aud: define.aud,
        lvl: define.lvl,
        cc: define.cc,
        pull: define.pull,
        dir: define.dir,
        hooks: !!define.hooks,
        nc: Number(define.nc) || 12,
      },
      extracts: extracts,
      knowledgeBase: knowledgeBase || undefined,
      shapeIntent: shapeIntent || undefined,
      prompt: define.instructions || undefined,
    }, signal)) {
      if (ev.type === 'progress') onProgress?.(ev.message);
      else if (ev.type === 'card') collected.push(ev.card);
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'done') break;
    }
    if (!collected.length) throw new Error('No cards were generated.');
    blocks = [{
      id: `blk-fc-${slotId}`,
      type: 'flashcard-set',
      content: {
        cards: collected.map((c) => ({
          front: c.front,
          back: c.back,
          ...(c.hook ? { hook: c.hook } : {}),
          ...(c.hint ? { hint: c.hint } : {}),
        })),
        direction: 'front-to-back',
      },
    }];
  } else if (objectType === 'concept-card') {
    let card: GeneratedConceptCard | null = null;
    const markupPack = markupUnits.map((u) => ({
      text: u.text, from: u.from, kind: u.kind, authorNote: u.authorNote,
    }));
    for await (const ev of generateConceptCard({
      title,
      config: {
        concept: define.concept || title,
        aud: define.aud,
        lvl: define.lvl,
        voi: define.voi,
        len: define.len,
        categories: resolveConceptCategories(undefined),
      },
      extracts: extracts,
      markupUnits: markupPack,
      knowledgeBase: knowledgeBase || undefined,
      shapeIntent: shapeIntent || undefined,
      prompt: define.instructions || undefined,
    }, signal)) {
      if (ev.type === 'progress') onProgress?.(ev.message);
      else if (ev.type === 'card') card = ev.card;
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'done') break;
    }
    if (!card?.term) throw new Error('No concept card was generated.');
    resultTitle = card.term;
    blocks = [{ id: `blk-cc-${slotId}`, type: 'concept-card', content: card }];
  } else if (objectType === 'quiz') {
    const collected: GeneratedQuizQuestion[] = [];
    for await (const ev of generateQuiz({
      title,
      config: {
        verify: define.verify || title,
        purpose: define.purpose,
        concepts: define.concepts,
        aud: define.aud,
        lvl: define.lvl,
        qtypes: define.qtypes,
        nq: Number(define.nq) || 8,
        passOn: define.passOn !== false,
        pass: define.pass,
        show: define.show,
        adaptive: define.adaptive,
      } as any,
      extracts: extracts,
      knowledgeBase: knowledgeBase || undefined,
      shapeIntent: shapeIntent || undefined,
      prompt: define.instructions || undefined,
    }, signal)) {
      if (ev.type === 'progress') onProgress?.(ev.message);
      else if (ev.type === 'question') collected.push(ev.question);
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'done') break;
    }
    if (!collected.length) throw new Error('No questions were generated.');
    const passMark = parseInt(String(define.pass || '70').replace('%', ''), 10) || 70;
    blocks = [{
      id: `blk-quiz-${slotId}`,
      type: 'quiz',
      content: {
        questions: collected,
        passRequired: define.passOn !== false,
        passMark,
        showExplanations: define.show || 'After attempt',
      },
    }];
  } else if (objectType === 'assignment' || objectType === 'reflection') {
    let content: Record<string, unknown> | null = null;
    for await (const ev of generateStructuredObject(objectType, {
      title,
      config: objectType === 'assignment'
        ? {
          obj: define.obj || title,
          aud: define.aud,
          lvl: define.lvl,
          tt: define.tt,
          del: define.del,
          el: define.el,
          cite: define.cite !== false,
          req: define.req,
          rubric: define.rubric,
        }
        : {
          goal: define.goal,
          aud: define.aud,
          voi: define.voi,
          style: define.style,
          who: define.who,
          np: define.np,
          starters: define.starters,
        },
      extracts: extracts,
      knowledgeBase: knowledgeBase || undefined,
      shapeIntent: shapeIntent || undefined,
      prompt: define.instructions || undefined,
    }, signal)) {
      if (ev.type === 'progress') onProgress?.(ev.message);
      else if (ev.type === 'result') content = ev.content as Record<string, unknown>;
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'done') break;
    }
    if (!content) throw new Error(`No ${noun} was generated.`);
    resultTitle = String((content as any).objective || (content as any).goal || title);
    blocks = [{ id: `blk-${objectType}-${slotId}`, type: objectType as Block['type'], content: content as unknown as Block['content'] }];
  } else if (V3_BLOCK_TYPES.has(objectType)) {
    /*
      The six Tutorial V3 block types. Their Define groups are already
      shaped to the prompt — one intent field and a count — so `define`
      goes through as the config rather than being re-mapped field by
      field the way the older object types are.
    */
    let content: Record<string, unknown> | null = null;
    for await (const ev of generateStructuredObject(objectType as StructuredObjectKind, {
      title,
      config: { ...define },
      extracts: extracts,
      knowledgeBase: knowledgeBase || undefined,
      shapeIntent: shapeIntent || undefined,
      prompt: define.instructions || undefined,
    }, signal)) {
      if (ev.type === 'progress') onProgress?.(ev.message);
      else if (ev.type === 'result') content = ev.content as Record<string, unknown>;
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'done') break;
    }
    if (!content) throw new Error(`No ${noun} was generated.`);
    resultTitle = String((content as any).title || define.what || title);
    blocks = [{ id: `blk-${objectType}-${slotId}`, type: objectType as Block['type'], content: content as unknown as Block['content'] }];
  } else {
    throw new Error(`Generate pipeline for “${objectType}” is not wired yet.`);
  }


  return { blocks, title: resultTitle };
}
