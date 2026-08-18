/**
 * Mark up once, generate many.
 *
 * A tutorial's sections nearly always draw on the same sources marked up the
 * same way — the whole point of a source pool is that it is shared. Authoring
 * did not reflect that: every section and every slot carried its own
 * `pickedSourceIds` and `highlights`, so building a six-section tutorial meant
 * doing the identical markup six times and hoping it came out identical.
 *
 * This applies one markup pass to every target the author selected, then
 * generates each of them from it. Targets are independent: one failing does not
 * stop the rest, and every outcome is reported so a partial run is legible
 * rather than mysterious.
 */

import {
  errorMessage,
  generateTutorial,
  type GeneratedPart,
  type TutorialExtract,
} from '../api';
import type {
  ClusteredKnowledgeBase,
  ContentUnit,
  TutorialSectionPlan,
  TutorialTemplate,
} from '../types';
import type { TutorialV3Draft, TutorialV3Part, V3Section, V3TopLevelSlot } from './types';
import { generateObjectBlocks } from './generateObject';
import { defaultDefineConfig, objectTypeNoun } from './objectPipelineDefaults';
import { templateUsesCompositeRecipe, toFlatSectionBlockRecipe } from './tutorialTemplates';
import { makeGeneratedEmbedPart } from '../libraryEmbed';

/** One thing to generate: a section of prose, or an embedded object slot. */
export type BatchTarget =
  | { kind: 'section'; id: string; title: string }
  | { kind: 'slot'; id: string; title: string; objectType: string };

export type BatchOutcome = {
  target: BatchTarget;
  status: 'pending' | 'running' | 'done' | 'failed';
  message?: string;
};

/** Author markup, in the shape both generators want. */
export interface SharedMarkup {
  pickedSourceIds: string[];
  highlights: any[];
  markupFlags?: any[];
}

/**
 * Highlights the author tagged Use/Support become the units generation reads.
 * Ids are namespaced per target so two sections generated in one run cannot
 * collide on unit ids.
 */
export function highlightsToUnits(highlights: any[], scopeId: string): ContentUnit[] {
  return (highlights || [])
    .filter((h) => h.tag === 'Use' || h.tag === 'Support' || !h.tag)
    .map((h, i) => {
      const text = String(h.text || '').trim();
      if (!text) return null;
      return {
        id: `u-${scopeId}-${i}`,
        kind: 'Key point',
        text,
        from: h.sourceLabel || 'Source',
        authorNote: h.note || h.authorNote,
        sectionId: scopeId,
      } as ContentUnit;
    })
    .filter(Boolean) as ContentUnit[];
}

function extractsFromUnits(units: ContentUnit[]): TutorialExtract[] {
  return units.slice(0, 12).map((u) => ({
    kind: u.kind,
    text: u.text,
    from: u.from,
    authorNote: u.authorNote,
  }));
}

async function generateSectionParts(opts: {
  draft: TutorialV3Draft;
  template: TutorialTemplate;
  section: V3Section;
  units: ContentUnit[];
  highlights: any[];
  signal: AbortSignal;
}): Promise<TutorialV3Part[]> {
  const { draft, template, section, units, highlights, signal } = opts;
  const kb: ClusteredKnowledgeBase = {
    units,
    clusters: [{
      id: section.id,
      name: section.title,
      unitIds: units.map((u) => u.id),
      sectionId: section.id,
    }],
  } as ClusteredKnowledgeBase;

  const useComposite = templateUsesCompositeRecipe(template);
  const sectionPlans: TutorialSectionPlan[] = [{
    index: 0,
    title: section.title,
    intent: section.intent,
    clusterId: section.id,
    sectionRecipe: useComposite ? section.recipe : undefined,
    recipe: toFlatSectionBlockRecipe(section.recipe.length ? section.recipe : template.recipe),
    mediaPlacements: [],
  }];
  const knobs = template.knobDefaults || {};

  const collected: GeneratedPart[] = [];
  for await (const ev of generateTutorial({
    title: `${draft.title} — ${section.title}`,
    config: {
      secs: 1,
      prog: draft.structure.progression,
      dpth: draft.structure.depth,
      end: 'None',
      chks: draft.structure.checksPerSection,
      excpts: 1,
      wex: knobs.wex !== false,
      pass: draft.structure.pass || knobs.pass || '70%',
      hintsOn: draft.structure.hintsOn !== false,
      hintN: draft.structure.hintN ?? 4,
      aiExtra: false,
      obj: String(draft.metadata.objective || section.intent || section.title),
      topic: section.title,
    } as any,
    template,
    knowledgeBase: kb as any,
    sectionPlans,
    tutorialDefinition: {
      objective: String(draft.metadata.objective || ''),
      sections: [{ id: section.id, title: section.title, intent: section.intent }],
    },
    highlights: (highlights || []).map((h: any) => ({
      idx: h.idx,
      text: h.text,
      tag: h.tag,
      note: h.note,
      sourceLabel: h.sourceLabel,
    })),
  }, signal)) {
    if (ev.type === 'part' && ev.part) collected.push(ev.part);
    if (ev.type === 'error') throw new Error(ev.message || 'Generation failed');
  }
  if (!collected.length) throw new Error('Nothing was generated for this section.');
  return collected as TutorialV3Part[];
}

/**
 * Run the whole batch. Applies `markup` to every target, generates it, and
 * reports each outcome as it lands.
 *
 * The draft is never mutated here: each finished target is handed back through
 * `onSectionDone` / `onSlotDone` so the caller commits it the same way a
 * single-target run does, and an aborted batch leaves the ones that already
 * finished in place.
 */
export async function runBatchGenerate(opts: {
  draft: TutorialV3Draft;
  template: TutorialTemplate;
  targets: BatchTarget[];
  markup: SharedMarkup;
  signal: AbortSignal;
  onOutcome: (outcome: BatchOutcome) => void;
  onSectionDone: (sectionId: string, patch: Partial<V3Section>) => void;
  onSlotDone: (slotId: string, patch: Partial<V3TopLevelSlot>) => void;
}): Promise<void> {
  const { draft, template, targets, markup, signal, onOutcome, onSectionDone, onSlotDone } = opts;

  for (const target of targets) {
    if (signal.aborted) return;
    onOutcome({ target, status: 'running' });
    try {
      const units = highlightsToUnits(markup.highlights, target.id);
      if (!units.length) throw new Error('No usable highlights — tag passages Use or Support first.');

      if (target.kind === 'section') {
        const section = (draft.sections || []).find((s) => s.id === target.id);
        if (!section) throw new Error('Section no longer exists.');
        const parts = await generateSectionParts({
          draft, template, section, units, highlights: markup.highlights, signal,
        });
        onSectionDone(target.id, {
          parts,
          units,
          pickedSourceIds: markup.pickedSourceIds,
          highlights: markup.highlights,
          markupFlags: markup.markupFlags || [],
          authorMode: 'generated',
          done: true,
        });
      } else {
        const slot = (draft.topLevelSlots || []).find((s) => s.id === target.id);
        if (!slot) throw new Error('Slot no longer exists.');
        const objectType = String(slot.objectType || 'quiz');
        const noun = objectTypeNoun(objectType);
        const title = String(slot.generateMeta?.title || slot.libraryTitle || `${draft.title} · ${noun}`);
        const { blocks, title: resultTitle } = await generateObjectBlocks({
          objectType,
          noun,
          title,
          // Whatever the author already set on this slot wins; the rest comes
          // from the type's own defaults, so a batch never silently generates
          // against knobs nobody chose.
          define: defaultDefineConfig(objectType, slot.generateMeta, String(draft.metadata.objective || draft.title)),
          extracts: extractsFromUnits(units),
          markupUnits: units,
          knowledgeBase: null,
          slotId: slot.id,
          signal,
        });
        const part = makeGeneratedEmbedPart({
          id: `embed-gen-${slot.id}`,
          objectType: objectType as any,
          title: resultTitle,
          snapshotBlocks: blocks,
          authoringNote: slot.authoringNote,
          required: slot.required,
        }) as TutorialV3Part;
        onSlotDone(target.id, {
          part,
          parts: [part],
          pickedSourceIds: markup.pickedSourceIds,
          highlights: markup.highlights,
          markupFlags: markup.markupFlags || [],
          units,
          libraryTitle: resultTitle,
          done: true,
        });
      }
      onOutcome({ target, status: 'done' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // One target failing is not the batch failing — carry on and report it.
      onOutcome({ target, status: 'failed', message: errorMessage(e, 'Generation failed.') });
    }
  }
}
