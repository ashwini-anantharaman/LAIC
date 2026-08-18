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
import { outlineRows } from './draftModel';
import { defaultDefineConfig, objectTypeNoun } from './objectPipelineDefaults';
import { templateUsesCompositeRecipe, toFlatSectionBlockRecipe } from './tutorialTemplates';
import { makeGeneratedEmbedPart, slotKeyFromPart } from '../libraryEmbed';

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
/**
 * Put a set of targets into the tutorial's reading order.
 *
 * A batch is assembled from ticked rows or from a filter over two arrays, and
 * neither says anything about sequence — so a run generated the content before
 * the sections regardless of where the template put them. Generating in the
 * order the tutorial reads also means each piece is written after the ones a
 * learner will have read before it.
 */
export function sortTargetsByOutline<T extends { id: string }>(
  draft: TutorialV3Draft,
  targets: T[],
): T[] {
  const rank = new Map<string, number>();
  outlineRows(draft).forEach((row, i) => {
    rank.set(row.kind === 'slot' ? row.slot.id : row.section.id, i);
  });
  return [...targets].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export interface SharedMarkup {
  pickedSourceIds: string[];
  highlights: any[];
  markupFlags?: any[];
  /**
   * Units to generate from, when they did not come from highlights.
   *
   * The source-first path has no markup step — the author attached sources and
   * that is the whole instruction — so it supplies units read straight from the
   * pool. When this is set the highlights are not consulted.
   */
  units?: ContentUnit[];
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


/**
 * A title nobody chose.
 *
 * "Section 1" is what the scaffold calls a section before anyone has said what
 * it is about. Keeping it after generation leaves the outline describing the
 * shape of the tutorial rather than its content — and the model has just
 * written a heading that says exactly what the section turned out to be.
 */
function isPlaceholderSectionTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  return /^(section|part|chapter|concept)\s*\d*$/i.test(t) || /^untitled/i.test(t);
}

/** The heading the generator gave this section, if it gave one. */
function headingFromParts(parts: TutorialV3Part[]): string | null {
  for (const p of parts) {
    const heading = String((p as { heading?: string }).heading || '').trim();
    // Skip reserved embed positions — their heading is a marker, not a title.
    if (!heading || slotKeyFromPart(p)) continue;
    return heading;
  }
  return null;
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
  /*
    `sectionPlans[0].title` keeps the placeholder — the server watches for it and
    tells the model to name the section itself. Everywhere else the placeholder
    is just noise the model can copy, so those carry the subject instead.
  */
  const unnamed = isPlaceholderSectionTitle(section.title);
  const subject = String(
    (unnamed ? section.intent || draft.metadata.objective || draft.title : section.title) || draft.title,
  );
  const kb: ClusteredKnowledgeBase = {
    units,
    clusters: [{
      id: section.id,
      name: subject,
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
    title: unnamed ? draft.title : `${draft.title} — ${section.title}`,
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
      topic: subject,
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
 * Fill the embed markers a generated section leaves behind.
 *
 * When a section recipe carries an embedded object, the tutorial generator does
 * not write it — it reserves the position with a `⟦EMBED_SLOT:…⟧` heading and
 * moves on, because each object type has its own pipeline. Nothing in V3 ever
 * came back to fill those in, so the marker reached the learner verbatim.
 *
 * A slot whose object cannot be generated has its marker dropped rather than
 * left showing: a missing exercise is a gap, a raw marker is a bug on screen.
 */
async function fillSectionEmbedSlots(opts: {
  section: V3Section;
  parts: TutorialV3Part[];
  units: ContentUnit[];
  draft: TutorialV3Draft;
  signal: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<{ parts: TutorialV3Part[]; failures: string[] }> {
  const { section, parts, units, draft, signal, onProgress } = opts;
  const failures: string[] = [];
  const out: TutorialV3Part[] = [];

  for (const part of parts) {
    const key = slotKeyFromPart(part);
    if (!key) {
      out.push(part);
      continue;
    }
    // `${sectionId}:${recipeItemId}` — the recipe item names the object type.
    const recipeItemId = key.slice(key.indexOf(':') + 1);
    const item = (section.recipe || []).find(
      (r) => r.kind === 'embedded' && r.id === recipeItemId,
    );
    if (!item || item.kind !== 'embedded') {
      failures.push('an embed slot with no recipe entry');
      continue;
    }
    const objectType = String(item.objectType);
    const noun = objectTypeNoun(objectType);
    try {
      onProgress?.(`Writing the ${noun} for ${section.title}…`);
      const { blocks, title } = await generateObjectBlocks({
        objectType,
        noun,
        title: `${section.title} · ${noun}`,
        define: defaultDefineConfig(objectType, item.generateMeta, section.intent || section.title),
        extracts: extractsFromUnits(units),
        markupUnits: units,
        knowledgeBase: null,
        slotId: recipeItemId,
        signal,
      });
      out.push(makeGeneratedEmbedPart({
        id: `embed-${recipeItemId}`,
        objectType: objectType as any,
        title,
        snapshotBlocks: blocks,
        authoringNote: item.authoringNote,
        required: item.required,
      }) as TutorialV3Part);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      failures.push(noun);
    }
  }

  return { parts: out, failures };
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
  const { draft, template, markup, signal, onOutcome, onSectionDone, onSlotDone } = opts;
  const targets = sortTargetsByOutline(draft, opts.targets);

  for (const target of targets) {
    if (signal.aborted) return;
    onOutcome({ target, status: 'running' });
    /** Set when the target succeeded but something inside it did not. */
    let note: string | undefined;
    /** Set when the section took the title the generator wrote for it. */
    let renamedTo: string | undefined;
    try {
      const units = markup.units?.length
        ? markup.units
        : highlightsToUnits(markup.highlights, target.id);
      if (!units.length) {
        throw new Error(markup.units
          ? 'The picked sources have no readable text.'
          : 'No usable highlights — tag passages Use or Support first.');
      }

      if (target.kind === 'section') {
        const section = (draft.sections || []).find((s) => s.id === target.id);
        if (!section) throw new Error('Section no longer exists.');
        const prose = await generateSectionParts({
          draft, template, section, units, highlights: markup.highlights, signal,
        });
        const filled = await fillSectionEmbedSlots({
          section, parts: prose, units, draft, signal,
        });
        // The section itself succeeded; carry what inside it did not, so the
        // final outcome does not overwrite the only mention of it.
        if (filled.failures.length) {
          note = `Written, but ${filled.failures.join(' and ')} could not be generated.`;
        }
        /*
          Adopt the generated heading when the section is still called whatever
          the scaffold named it. An author who titled it themselves keeps their
          title — this only fills a blank.
        */
        const generatedTitle = isPlaceholderSectionTitle(section.title)
          ? headingFromParts(filled.parts)
          : null;
        if (generatedTitle) renamedTo = generatedTitle;

        onSectionDone(target.id, {
          ...(generatedTitle ? { title: generatedTitle } : {}),
          parts: filled.parts,
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
      onOutcome({
        target: renamedTo ? { ...target, title: renamedTo } : target,
        status: 'done',
        message: note,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // One target failing is not the batch failing — carry on and report it.
      onOutcome({ target, status: 'failed', message: errorMessage(e, 'Generation failed.') });
    }
  }
}
