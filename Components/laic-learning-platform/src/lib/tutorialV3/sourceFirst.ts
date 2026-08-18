/**
 * The source-first path: Plan → Sources → Structure → Author → Review.
 *
 * Every other path asks the author to design the tutorial and then find source
 * material for it. This one runs the other way: the sources arrive first, the
 * model proposes what the tutorial should be, and the author reviews a shape
 * rather than inventing one.
 *
 * "Complete AI" is meant literally — there is no markup step. Generation reads
 * the picked sources whole, so an author who has attached a PDF has already
 * done everything the path needs.
 */

import type { ContentUnit, RecipeItem } from '../types';
import type { ProposedStructure } from '../api';
import type { TutorialV3Draft, V3Section, V3TopLevelSlot, V3SourceRef } from './types';
import { newRecipeItemId } from './tutorialTemplates';

export const SOURCE_FIRST_PATH = 'source-first';

export function isSourceFirstDraft(draft: TutorialV3Draft): boolean {
  return draft.metadata?.authoringPath === SOURCE_FIRST_PATH;
}

/**
 * Units straight from the pool, with no markup in between.
 *
 * The markup step exists so an author can tell generation which passages
 * matter. On this path nobody has said, so everything picked counts — which is
 * the honest reading of "generate from my sources" and is why this path needs
 * no markup screen at all.
 */
export function unitsFromSourcePool(
  pool: V3SourceRef[],
  pickedIds?: string[],
  limit = 240,
): ContentUnit[] {
  const picked = pickedIds?.length ? pool.filter((s) => pickedIds.includes(s.id)) : pool;
  const out: ContentUnit[] = [];
  for (const src of picked) {
    for (const sen of src.sentences || []) {
      const text = String(sen?.text || '').trim();
      if (text.length < 12) continue;
      out.push({
        id: `u-src-${src.id}-${out.length}`,
        kind: 'Key point',
        text,
        from: src.label || 'Source',
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Sentences in the shape the propose endpoint wants. */
export function sentencesFromPool(
  pool: V3SourceRef[],
  pickedIds?: string[],
): { text: string; page?: number }[] {
  const picked = pickedIds?.length ? pool.filter((s) => pickedIds.includes(s.id)) : pool;
  return picked.flatMap((src) => (src.sentences || [])
    .map((s) => ({ text: String(s?.text || '').trim(), page: s?.page }))
    .filter((s) => s.text.length > 4));
}

/** A proposed section's blocks and objects, as a recipe the rest of V3 understands. */
function recipeFromProposal(blocks: string[], objects: string[]): RecipeItem[] {
  const items: RecipeItem[] = [{
    kind: 'atomic',
    id: newRecipeItemId('ri'),
    blockType: 'section-heading',
    required: true,
  }];
  for (const b of blocks) {
    items.push({
      kind: 'atomic',
      id: newRecipeItemId('ri'),
      blockType: b as RecipeItem extends { blockType: infer T } ? T : never,
    } as RecipeItem);
  }
  for (const o of objects) {
    items.push({
      kind: 'embedded',
      id: newRecipeItemId('re'),
      objectType: o as any,
      sourceMode: 'generate',
      required: false,
    });
  }
  return items;
}

/**
 * Turn a proposal into the draft's own sections and top-level slots.
 *
 * Ids are minted here rather than taken from the model, and the picked sources
 * are stamped onto every section, so Author can generate immediately without
 * asking the author to repeat a choice they already made on Sources.
 */
export function applyProposal(
  draft: TutorialV3Draft,
  proposal: ProposedStructure,
  pickedSourceIds: string[],
): { sections: V3Section[]; topLevelSlots: V3TopLevelSlot[] } {
  const stamp = Date.now().toString(36);

  const sections: V3Section[] = proposal.sections.map((sec, i) => ({
    id: `sf-sec-${stamp}-${i}`,
    title: sec.title,
    intent: sec.intent,
    recipe: recipeFromProposal(sec.blocks, sec.objects),
    parts: [],
    pickedSourceIds: [...pickedSourceIds],
    highlights: [],
    markupFlags: [],
    authorMode: 'empty',
    done: false,
    required: true,
    learnerPage: i + 2,
  }));

  // Openers and closers are tutorial-level, so they become top-level slots
  // rather than being buried inside the first and last section.
  const slotFor = (objectType: string, idx: number, page: number): V3TopLevelSlot => ({
    id: `sf-slot-${stamp}-${idx}`,
    kind: 'generate',
    objectType: objectType as any,
    required: false,
    recipeIndex: idx,
    pickedSourceIds: [...pickedSourceIds],
    highlights: [],
    done: false,
    learnerPage: page,
  });

  const topLevelSlots: V3TopLevelSlot[] = [
    ...proposal.openers.map((o, i) => slotFor(o, i, 1)),
    ...proposal.closers.map((o, i) => slotFor(o, proposal.openers.length + i, sections.length + 2)),
  ];

  return { sections, topLevelSlots };
}
