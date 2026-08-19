/** Tutorial V3 definition helpers (fork of tutorialDefinition.ts). */
/**
 * Helpers for TutorialDefinition (define-first Plan step).
 * Section count is seeded from template knobDefaults.secs — NOT from recipe items.
 */
import type {
  ConceptCluster,
  ContentUnit,
  DefinedSection,
  EmbedPlanOverride,
  EmbeddedGenerateMeta,
  EmbeddedObjectItem,
  EmbeddedObjectSourceMode,
  RecipeItem,
  TutorialDefinition,
  TutorialTemplate,
} from '../types';
import { UNASSIGNED_SECTION_ID } from '../types';
import { filterRecipeByCondition, resolveSectionRecipe, templateHasSectionBlock } from './tutorialTemplates';

export function newSectionId(): string {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Embedded slots on the template default recipe (the pool authors tag onto sections). */
export function listTemplateRecipeEmbeds(template: TutorialTemplate): EmbeddedObjectItem[] {
  return (template.recipe || []).filter((r): r is EmbeddedObjectItem => r.kind === 'embedded');
}

export function isEmbedAttachedToSection(sec: DefinedSection, recipeItemId: string): boolean {
  if (sec.attachedEmbedIds === undefined) return true;
  return sec.attachedEmbedIds.includes(recipeItemId);
}

/** Toggle whether a template embed is tagged to a Plan section. */
export function setSectionEmbedAttached(
  def: TutorialDefinition,
  sectionId: string,
  recipeItemId: string,
  attached: boolean,
  allEmbedIds: string[],
): TutorialDefinition {
  return {
    ...def,
    sections: (def.sections || []).map((s) => {
      if (s.id !== sectionId) return s;
      const current = s.attachedEmbedIds === undefined ? [...allEmbedIds] : [...s.attachedEmbedIds];
      const next = attached
        ? (current.includes(recipeItemId) ? current : [...current, recipeItemId])
        : current.filter((id) => id !== recipeItemId);
      return { ...s, attachedEmbedIds: next };
    }),
  };
}

/** Keep atomics; keep only embeds tagged to this section (legacy undefined = all embeds). */
export function filterRecipeEmbedsForSection(
  recipe: RecipeItem[],
  sec: DefinedSection,
): RecipeItem[] {
  return (recipe || []).filter((item) => {
    if (item.kind !== 'embedded') return true;
    return isEmbedAttachedToSection(sec, item.id);
  });
}

/**
 * Seed named sections from template.secs — only when the template has a Section heading block.
 * Embed-only recipes get a single outline row (no multi-section count from knobs).
 */
export function seedSectionsFromTemplate(template: TutorialTemplate): DefinedSection[] {
  const base = template.name === 'Concept, Example, Practice' ? 'Concept' : 'Section';
  if (!templateHasSectionBlock(template)) {
    return [{ id: newSectionId(), title: `${base} 1`, intent: '' }];
  }
  const n = Math.max(1, Math.min(20, Number(template.knobDefaults?.secs) || 3));
  return Array.from({ length: n }, (_, i) => ({
    id: newSectionId(),
    title: `${base} ${i + 1}`,
    intent: '',
  }));
}

export function emptyTutorialDefinition(template: TutorialTemplate): TutorialDefinition {
  return { objective: '', sections: seedSectionsFromTemplate(template), embedPlans: {} };
}

export function planIsReady(def: TutorialDefinition | null | undefined): boolean {
  if (!def) return false;
  if (!String(def.objective || '').trim()) return false;
  const named = (def.sections || []).filter((s) => String(s.title || '').trim());
  return named.length > 0;
}

/** Derive a best-effort definition for old drafts (do not write back until author edits). */
export function deriveTutorialDefinition(opts: {
  template: TutorialTemplate;
  fv?: Record<string, any>;
  clusters?: ConceptCluster[];
  description?: string;
}): TutorialDefinition {
  const objective = String(opts.fv?.obj || opts.fv?.topic || opts.description || '').trim();
  const clusters = (opts.clusters || []).filter((c) => c.id !== UNASSIGNED_SECTION_ID && c.sectionId !== UNASSIGNED_SECTION_ID);
  if (clusters.length) {
    return {
      objective: objective || 'Untitled tutorial objective',
      sections: clusters.map((c, i) => ({
        id: c.sectionId || c.id || newSectionId(),
        title: c.name || `Section ${i + 1}`,
        intent: '',
      })),
      embedPlans: {},
    };
  }
  return {
    objective,
    sections: seedSectionsFromTemplate(opts.template),
    embedPlans: {},
  };
}

export function unassignedCluster(unitIds: string[] = []): ConceptCluster {
  return {
    id: UNASSIGNED_SECTION_ID,
    name: 'Unassigned',
    unitIds,
    sectionId: UNASSIGNED_SECTION_ID,
  };
}

/** Fixed clusters = defined sections (+ Unassigned). Assign units by sectionId. */
export function clustersFromDefinition(
  def: TutorialDefinition,
  units: { id: string; sectionId?: string }[],
): ConceptCluster[] {
  const sections = (def.sections || []).filter((s) => String(s.title || '').trim());
  const clusters: ConceptCluster[] = sections.map((s) => ({
    id: s.id,
    name: s.title.trim(),
    unitIds: [],
    sectionId: s.id,
  }));
  const unassigned = unassignedCluster([]);
  const byId = new Map(clusters.map((c) => [c.id, c]));
  for (const u of units) {
    const sid = u.sectionId && byId.has(u.sectionId) ? u.sectionId : UNASSIGNED_SECTION_ID;
    if (sid === UNASSIGNED_SECTION_ID) unassigned.unitIds.push(u.id);
    else byId.get(sid)!.unitIds.push(u.id);
  }
  return [...clusters, unassigned];
}

export function countEmptySections(
  def: TutorialDefinition,
  units: { sectionId?: string }[],
): number {
  const withUnits = new Set(units.map((u) => u.sectionId).filter(Boolean));
  return (def.sections || []).filter((s) => String(s.title || '').trim() && !withUnits.has(s.id)).length;
}

export function embedPlanKey(sectionId: string, recipeItemId: string): string {
  return `${sectionId}:${recipeItemId}`;
}

export type ListedEmbed = {
  key: string;
  sectionId: string;
  sectionTitle: string;
  sectionIntent: string;
  sectionIndex: number;
  recipeIndex: number;
  item: EmbeddedObjectItem;
  /** Mode after prompt_on_author resolution; null = still unresolved. */
  effectiveMode: EmbeddedObjectSourceMode | null;
  effectiveMeta: EmbeddedGenerateMeta | undefined;
  authoringNote?: string;
  override?: EmbedPlanOverride;
};

function resolveEffectiveMode(
  item: EmbeddedObjectItem,
  override?: EmbedPlanOverride,
): EmbeddedObjectSourceMode | null {
  if (item.sourceMode === 'prompt_on_author') {
    return override?.resolvedMode || null;
  }
  return item.sourceMode;
}

/**
 * List embedded recipe items tagged to each Plan section (default recipe + conditions).
 * When units are omitted, conditions that need source kinds/hints keep the item (optimistic).
 * Section type / archetypes are ignored — authors tag embeds onto sections instead.
 */
export function listEmbedsForDefinition(
  def: TutorialDefinition,
  template: TutorialTemplate,
  opts?: { unitsBySectionId?: Record<string, Pick<ContentUnit, 'kind' | 'text'>[]> },
): ListedEmbed[] {
  const plans = def.embedPlans || {};
  const out: ListedEmbed[] = [];
  const sections = (def.sections || []).filter((s) => String(s.title || '').trim());
  sections.forEach((sec, sectionIndex) => {
    const units = opts?.unitsBySectionId?.[sec.id] || [];
    const resolved = resolveSectionRecipe(template, undefined);
    // Without units, skip condition filtering so Plan still shows the authored slots.
    const recipe = filterRecipeEmbedsForSection(
      units.length ? filterRecipeByCondition(resolved, units) : resolved,
      sec,
    );
    recipe.forEach((ri, recipeIndex) => {
      if (ri.kind !== 'embedded') return;
      const key = embedPlanKey(sec.id, ri.id);
      const override = plans[key];
      const effectiveMode = resolveEffectiveMode(ri, override);
      const item: EmbeddedObjectItem = {
        ...ri,
        versionPin: override?.versionPin || ri.versionPin,
        libraryTitle: override?.libraryTitle || ri.libraryTitle,
      };
      out.push({
        key,
        sectionId: sec.id,
        sectionTitle: sec.title.trim(),
        sectionIntent: String(sec.intent || '').trim(),
        sectionIndex,
        recipeIndex,
        item,
        effectiveMode,
        effectiveMeta: ri.generateMeta,
        authoringNote: ri.authoringNote,
        override,
      });
    });
  });
  return out;
}

/** Embeds whose effective mode is generate (includes resolved prompt_on_author → generate). */
export function listGenerateEmbedsForDefinition(
  def: TutorialDefinition,
  template: TutorialTemplate,
  opts?: { unitsBySectionId?: Record<string, Pick<ContentUnit, 'kind' | 'text'>[]> },
): ListedEmbed[] {
  return listEmbedsForDefinition(def, template, opts).filter((e) => e.effectiveMode === 'generate');
}

/** Embeds resolved (or authored) as pick_from_library with a pin. */
export function listLibraryEmbedsForDefinition(
  def: TutorialDefinition,
  template: TutorialTemplate,
  opts?: { unitsBySectionId?: Record<string, Pick<ContentUnit, 'kind' | 'text'>[]> },
): ListedEmbed[] {
  return listEmbedsForDefinition(def, template, opts).filter(
    (e) => e.effectiveMode === 'pick_from_library' && !!e.item.versionPin?.objectId,
  );
}

/** Required prompt_on_author still unresolved, OR required library slot still unpinned. */
export function listUnresolvedRequiredEmbeds(
  def: TutorialDefinition,
  template: TutorialTemplate,
  opts?: { unitsBySectionId?: Record<string, Pick<ContentUnit, 'kind' | 'text'>[]> },
): ListedEmbed[] {
  return listEmbedsForDefinition(def, template, opts).filter((e) => {
    if (!e.item.required) return false;
    if (e.item.sourceMode === 'prompt_on_author' && e.effectiveMode == null) return true;
    if (
      (e.effectiveMode === 'pick_from_library' || e.item.sourceMode === 'pick_from_library')
      && !e.item.versionPin?.objectId
    ) {
      return true;
    }
    return false;
  });
}

export function patchEmbedPlan(
  def: TutorialDefinition,
  key: string,
  patch: Partial<EmbedPlanOverride>,
): TutorialDefinition {
  const prev = def.embedPlans || {};
  const next = { ...(prev[key] || {}), ...patch };
  return {
    ...def,
    embedPlans: { ...prev, [key]: next },
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
