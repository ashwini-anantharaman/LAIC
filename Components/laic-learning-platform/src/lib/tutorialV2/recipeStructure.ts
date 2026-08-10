/**
 * Recipe → Structure checklist helpers for Tutorial V2.
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
import type { TutorialV2Part, V2Section, V2TopLevelSlot } from './types';

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
  const sectionCount = hasSections
    ? Math.max(1, Math.min(20, Number(template.knobDefaults?.secs) || 3))
    : 0;

  const embeds = recipe.filter((r): r is EmbeddedObjectItem => r.kind === 'embedded');
  const libraryEmbeds = embeds.filter(isLibraryMode);
  const generateEmbeds = embeds.filter(isGenerateMode);

  // Generate embeds are their own Structure items even when sections exist —
  // one quiz block in the template means one quiz to generate, not one per section.
  const topLevelGenerateEmbeds = generateEmbeds;

  const sectionAtomics = recipe.filter((r) => r.kind === 'atomic');
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
  };
}

export function seedTopLevelSlots(
  analysis: RecipeStructureAnalysis,
  existing?: V2TopLevelSlot[],
): V2TopLevelSlot[] {
  const prev = new Map((existing || []).map((s) => [s.id, s]));
  const out: V2TopLevelSlot[] = [];

  for (const item of analysis.libraryEmbeds) {
    const old = prev.get(item.id);
    out.push({
      id: item.id,
      kind: 'library',
      objectType: item.objectType,
      authoringNote: item.authoringNote,
      required: item.required !== false,
      recipeIndex: 0,
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
      recipeIndex: 0,
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

  return out;
}

export function seedSectionsFromAnalysis(
  analysis: RecipeStructureAnalysis,
  titles?: { id?: string; title: string; intent?: string }[],
): V2Section[] {
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

  return outline.map((row) => ({
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
};

export function seedWriteYourselfSections(
  analysis: RecipeStructureAnalysis,
  titles: StructureSectionTitle[],
): V2Section[] {
  return applySectionOutline([], titles, analysis, { writeYourself: true });
}

/**
 * Apply Plan/Structure section outline onto existing sections.
 * Renames / reorders / adds / removes by id (with title/index fallback),
 * and keeps authored parts / done state for sections that remain.
 */
export function applySectionOutline(
  existing: V2Section[],
  titles: StructureSectionTitle[],
  analysis: RecipeStructureAnalysis,
  opts?: { writeYourself?: boolean },
): V2Section[] {
  const writeYourself = !!opts?.writeYourself;
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
    if (prev) {
      unused.delete(prev.id);
      return {
        ...prev,
        title,
        intent: row.intent !== undefined ? String(row.intent) : prev.intent,
        learnerPage,
      };
    }
    return {
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
  slots: V2TopLevelSlot[],
  sections: { title: string }[],
  opts?: { writeYourself?: boolean },
): boolean {
  if (opts?.writeYourself) {
    const named = (sections || []).filter((s) => String(s.title || '').trim());
    return named.length >= 1;
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
  slot: V2TopLevelSlot,
  opts: {
    object: LearningObject;
    versionId: string;
    title: string;
  },
): V2TopLevelSlot {
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
    part: part as TutorialV2Part,
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
