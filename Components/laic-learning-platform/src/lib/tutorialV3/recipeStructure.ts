/**
 * Recipe → Structure checklist helpers for Tutorial V3.
 * Structure is driven only by the template recipe (no Plan objective / template picker).
 */
import type {
  EmbeddedObjectItem,
  EmbeddedObjectSourceMode,
  EmbeddableObjectType,
  LearningObject,
  RecipeItem,
  TutorialTemplate,
  VersionPin,
} from '../types';
import { makeLibraryEmbedPart } from '../libraryEmbed';
import { cloneRecipeItems, recipeHasSectionBlock } from './tutorialTemplates';
import { newSectionId } from './tutorialDefinition';
import type { TutorialV3Part, V3Section, V3TopLevelSlot } from './types';

export interface RecipeStructureAnalysis {
  hasSections: boolean;
  sectionCount: number;
  /** Library embeds shown as Structure pickers (tutorial-level). */
  libraryEmbeds: EmbeddedObjectItem[];
  /**
   * Generate embeds at tutorial level — every generate embed in the recipe,
   * with or without a Section block. A template with both a Section block and
   * an embedded quiz shows the sections AND the quiz on Structure.
   */
  topLevelGenerateEmbeds: EmbeddedObjectItem[];
  /** True when Sources → markup → generate is needed. */
  needsSources: boolean;
  /** Atomics that form each section's teaching shape (excludes section-heading). */
  sectionAtomics: RecipeItem[];
  /** Full per-section recipe when hasSections (atomics + generate embeds). */
  sectionRecipe: RecipeItem[];
  /**
   * Where each embed sits in the template recipe, by embed id.
   *
   * The author arranges blocks in a deliberate order in the template — quiz
   * after the sections, overview before them. Structure has to show that order
   * back, so the positions travel with the analysis rather than being lost the
   * moment embeds are split into library and generate groups.
   */
  recipeOrder: Record<string, number>;
  /** Index of every Section block in the recipe, in order. Empty when there are none. */
  sectionSlots: number[];
  /** Where the first Section block sits (-1 when the template has none). */
  sectionOrder: number;
}

function isLibraryMode(item: EmbeddedObjectItem): boolean {
  return (
    item.sourceMode === 'pick_from_library'
    || item.objectType === 'reused-from-library'
  );
}

function isGenerateMode(item: EmbeddedObjectItem): boolean {
  if (isLibraryMode(item)) return false;
  return item.sourceMode === 'generate' || item.sourceMode === 'prompt_on_author' || !item.sourceMode;
}

export function analyzeTemplateRecipe(template: TutorialTemplate): RecipeStructureAnalysis {
  const recipe = template.recipe || [];
  const hasSections = recipeHasSectionBlock(recipe);

  /*
    Where the recipe's Section blocks sit.

    A template may place several, interleaved with embedded content — Section,
    quiz, Section, flashcards — and each one is a section in its own right, at
    its own point in the reading order. Only when there is a single Section
    block does the `secs` knob mean anything: one block standing for however
    many sections the author asked for.
  */
  const sectionSlots = recipe
    .map((r, i) => (r.kind === 'atomic' && String((r as { blockType?: string }).blockType || '') === 'section-heading' ? i : -1))
    .filter((i) => i >= 0);
  const sectionCount = !hasSections
    ? 0
    : sectionSlots.length > 1
      ? sectionSlots.length
      : Math.max(1, Math.min(20, Number(template.knobDefaults?.secs) || 3));

  const recipeOrder: Record<string, number> = {};
  recipe.forEach((r, i) => {
    if (r.kind === 'embedded' && (r as EmbeddedObjectItem).id) {
      recipeOrder[String((r as EmbeddedObjectItem).id)] = i;
    }
  });
  const embeds = recipe.filter((r): r is EmbeddedObjectItem => r.kind === 'embedded');
  const libraryEmbeds = embeds.filter(isLibraryMode);
  const generateEmbeds = embeds.filter(isGenerateMode);

  // Generate embeds are their own Structure items even when sections exist —
  // one quiz block in the template means one quiz to generate, not one per section.
  const topLevelGenerateEmbeds = generateEmbeds;

  /*
    One section's shape, not the whole recipe's.

    A recipe with five Section blocks describes five sections, not one section
    made of five headings — so the repeats collapse to a single heading here,
    and the other atomics (explanation, worked example, and so on) come along
    as the shape each of those sections is built to.
  */
  let seenHeading = false;
  const sectionAtomics = recipe.filter((r) => {
    if (r.kind !== 'atomic') return false;
    if (String((r as { blockType?: string }).blockType || '') !== 'section-heading') return true;
    if (seenHeading) return false;
    seenHeading = true;
    return true;
  });
  // Per-section: atomics only (embeds are tutorial-level Structure items).
  const sectionRecipe = hasSections ? sectionAtomics : [];

  const needsSources = hasSections
    || topLevelGenerateEmbeds.length > 0;

  return {
    hasSections,
    sectionCount,
    libraryEmbeds,
    topLevelGenerateEmbeds,
    needsSources,
    sectionAtomics,
    sectionRecipe,
    recipeOrder,
    sectionSlots,
    sectionOrder: hasSections ? (sectionSlots[0] ?? recipe.length) : -1,
  };
}

export function seedTopLevelSlots(
  analysis: RecipeStructureAnalysis,
  existing?: V3TopLevelSlot[],
): V3TopLevelSlot[] {
  const prev = new Map((existing || []).map((s) => [s.id, s]));
  const out: V3TopLevelSlot[] = [];

  for (const item of analysis.libraryEmbeds) {
    const old = prev.get(item.id);
    out.push({
      id: item.id,
      kind: 'library',
      objectType: item.objectType,
      authoringNote: item.authoringNote,
      required: item.required !== false,
      recipeIndex: analysis.recipeOrder[item.id] ?? 0,
      order: old?.order ?? analysis.recipeOrder[item.id] ?? 0,
      versionPin: old?.versionPin || item.versionPin,
      libraryTitle: old?.libraryTitle || item.libraryTitle,
      part: old?.part,
      done: !!(old?.versionPin?.objectId || old?.part),
      learnerPage: old?.learnerPage,
    });
  }

  for (const item of analysis.topLevelGenerateEmbeds) {
    const old = prev.get(item.id);
    const parts = old?.parts?.length
      ? old.parts
      : (old?.part ? [old.part] : undefined);
    out.push({
      id: item.id,
      kind: 'generate',
      objectType: item.objectType,
      authoringNote: item.authoringNote,
      required: item.required !== false,
      recipeIndex: analysis.recipeOrder[item.id] ?? 0,
      order: old?.order ?? analysis.recipeOrder[item.id] ?? 0,
      generateMeta: old?.generateMeta || item.generateMeta,
      part: old?.part || parts?.[0],
      parts,
      pickedSourceIds: old?.pickedSourceIds,
      highlights: old?.highlights,
      markupFlags: old?.markupFlags,
      units: old?.units,
      done: !!(old?.done || old?.part || parts?.length),
      learnerPage: old?.learnerPage,
    });
  }

  // Author-added slots (recipeIndex -1, e.g. Blank canvas "Add content") are
  // not recipe-derived — preserve them across Structure re-entries.
  const seeded = new Set(out.map((s) => s.id));
  // Author-added slots land after the recipe's own, in the order they were added.
  let tail = Math.max(0, ...out.map((s) => s.order ?? 0)) + 1;
  for (const s of existing || []) {
    if (s.recipeIndex === -1 && !seeded.has(s.id)) {
      out.push(s.order == null ? { ...s, order: tail++ } : s);
    }
  }

  /*
    Library and generate embeds were collected in two passes, which is an
    implementation detail — not an order the author asked for. Sorting by the
    recipe position puts the list back the way the template reads.
  */
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function seedSectionsFromAnalysis(
  analysis: RecipeStructureAnalysis,
  titles?: { id?: string; title: string; intent?: string }[],
): V3Section[] {
  if (!analysis.hasSections) return [];
  const n = analysis.sectionCount;
  const rows = titles?.length
    ? titles
    : Array.from({ length: n }, (_, i) => ({ title: `Section ${i + 1}`, intent: '' }));

  // Resize to sectionCount
  const outline = rows.slice(0, n);
  while (outline.length < n) {
    outline.push({ title: `Section ${outline.length + 1}`, intent: '' });
  }

  return outline.map((row, i) => ({
    order: defaultSectionOrder(analysis, i, outline.length),
    id: row.id || newSectionId(),
    title: String(row.title || '').trim() || 'Section',
    intent: row.intent || '',
    recipe: cloneRecipeItems(analysis.sectionRecipe.length ? analysis.sectionRecipe : analysis.sectionAtomics, true),
    parts: [],
    pickedSourceIds: [],
    highlights: [],
    units: undefined,
    authorMode: 'empty' as const,
    done: false,
    required: true,
  }));
}

/** Write-it-yourself: seed from whatever section titles the author named (no fixed count). */
export type StructureSectionTitle = {
  id?: string;
  title: string;
  intent?: string;
  /** Student-preview page (1-based). */
  learnerPage?: number;
  /** Position in the outline's one running order, shared with top-level slots. */
  order?: number;
};

/**
 * Where a section sits in the running order when nothing has said otherwise.
 *
 * Every section shares the Section block's one position in the recipe, so they
 * are spread across a fractional span — enough to keep them in outline order
 * and still sit as a group wherever the template put the block.
 */
export function defaultSectionOrder(analysis: RecipeStructureAnalysis, i: number, n: number): number {
  const slots = analysis.sectionSlots || [];
  // Several Section blocks: the nth section belongs at the nth one. Sections
  // beyond the last block trail it, in order.
  if (slots.length > 1) {
    if (i < slots.length) return slots[i];
    const last = slots[slots.length - 1];
    return last + (i - slots.length + 1) / (Math.max(1, n) + 1);
  }
  const base = analysis.sectionOrder >= 0 ? analysis.sectionOrder : 0;
  return base + i / (Math.max(1, n) + 1);
}

export function seedWriteYourselfSections(
  analysis: RecipeStructureAnalysis,
  titles: StructureSectionTitle[],
): V3Section[] {
  return applySectionOutline([], titles, analysis, { writeYourself: true });
}

/**
 * Apply Plan/Structure section outline onto existing sections.
 * Renames / reorders / adds / removes by id (with title/index fallback),
 * and keeps authored parts / done state for sections that remain.
 */
export function applySectionOutline(
  existing: V3Section[],
  titles: StructureSectionTitle[],
  analysis: RecipeStructureAnalysis,
  opts?: { writeYourself?: boolean; freeSections?: boolean },
): V3Section[] {
  const writeYourself = !!opts?.writeYourself || !!opts?.freeSections;
  let outline = [...(titles || [])];
  if (writeYourself) {
    outline = outline.filter((t) => String(t.title || '').trim());
    if (!outline.length) outline = [{ title: 'Section 1', intent: '' }];
  } else {
    if (!analysis.hasSections) return [];
    const n = analysis.sectionCount;
    outline = outline.slice(0, n);
    while (outline.length < n) {
      outline.push({ title: `Section ${outline.length + 1}`, intent: '' });
    }
  }

  const byId = new Map((existing || []).map((s) => [s.id, s]));
  const unused = new Set((existing || []).map((s) => s.id));
  const recipe = cloneRecipeItems(
    analysis.sectionRecipe.length ? analysis.sectionRecipe : analysis.sectionAtomics,
    true,
  );

  return outline.map((row, i) => {
    const title = String(row.title || '').trim() || `Section ${i + 1}`;
    const learnerPage = Math.max(
      1,
      Number(row.learnerPage != null ? row.learnerPage : (i + 1)) || (i + 1),
    );
    let prev = (row.id && byId.get(row.id)) || undefined;
    if (!prev && !row.id) {
      const atIndex = existing[i];
      if (atIndex && unused.has(atIndex.id)) prev = atIndex;
    }
    if (!prev) {
      const needle = title.toLowerCase();
      prev = (existing || []).find(
        (s) => unused.has(s.id) && s.title.trim().toLowerCase() === needle,
      );
    }
    const order = row.order ?? defaultSectionOrder(analysis, i, outline.length);
    if (prev) {
      unused.delete(prev.id);
      return {
        ...prev,
        title,
        intent: row.intent !== undefined ? String(row.intent) : prev.intent,
        learnerPage,
        order,
      };
    }
    return {
      order,
      id: row.id || newSectionId(),
      title,
      intent: row.intent || '',
      recipe: cloneRecipeItems(recipe, true),
      parts: [],
      pickedSourceIds: [],
      highlights: [],
      units: undefined,
      authorMode: 'empty' as const,
      done: false,
      required: true,
      learnerPage,
    };
  });
}

/** Structure continue gate: required library slots pinned; sections named when present. */
export function structureIsReady(
  analysis: RecipeStructureAnalysis,
  slots: V3TopLevelSlot[],
  sections: { title: string }[],
  opts?: { writeYourself?: boolean; freeform?: boolean },
): boolean {
  if (opts?.writeYourself) {
    const named = (sections || []).filter((s) => String(s.title || '').trim());
    return named.length >= 1;
  }
  if (opts?.freeform) {
    for (const slot of slots) {
      if (slot.kind === 'library' && slot.required && !slot.versionPin?.objectId) return false;
    }
    const named = (sections || []).filter((s) => String(s.title || '').trim());
    return named.length >= 1 || slots.length >= 1;
  }
  for (const slot of slots) {
    if (slot.kind !== 'library') continue;
    if (!slot.required) continue;
    if (!slot.versionPin?.objectId) return false;
  }
  if (analysis.hasSections) {
    if (sections.length < analysis.sectionCount) return false;
    if (!sections.every((s) => String(s.title || '').trim())) return false;
  }
  return true;
}

export function applyLibraryPickToSlot(
  slot: V3TopLevelSlot,
  opts: {
    object: LearningObject;
    versionId: string;
    title: string;
  },
): V3TopLevelSlot {
  const part = makeLibraryEmbedPart({
    id: `p-slot-${slot.id}`,
    object: opts.object,
    versionId: opts.versionId,
    authoringNote: slot.authoringNote,
    required: slot.required,
  });
  return {
    ...slot,
    versionPin: { objectId: opts.object.id, versionId: opts.versionId },
    libraryTitle: opts.title || opts.object.title,
    part: part as TutorialV3Part,
    done: true,
  };
}

export function embedTypeLabel(objectType: string): string {
  const map: Record<string, string> = {
    quiz: 'Quiz',
    'flashcard-set': 'Flashcard set',
    'concept-card': 'Concept card',
    scenario: 'Scenario',
    assignment: 'Assignment',
    reflection: 'Reflection',
    'lesson-overview': 'Lesson overview',
    'lesson-complete': 'Lesson complete',
    'reference-table': 'Reference table',
    'quick-decisions': 'Quick decisions',
    matching: 'Matching',
    'opening-question': 'Opening question',
    'reused-from-library': 'Library content',
  };
  return map[objectType] || objectType;
}

export function effectiveSourceMode(item: EmbeddedObjectItem): EmbeddedObjectSourceMode | null {
  if (isLibraryMode(item)) return 'pick_from_library';
  if (item.sourceMode === 'prompt_on_author') return null;
  return item.sourceMode || 'generate';
}

export type { EmbeddableObjectType, VersionPin };
