/** Tutorial V2 template store — isolated from V1 (`laic-tutorial-templates`). */
import { OBJECTS, VERSIONS } from '../data';
import { listVersionsForObject } from '../objectVersionsStore';
import { readSessionUserId, DEMO_CD_USER_ID } from '../demoAuth';
import type {
  AssessmentPlacement,
  AtomicBlockItem,
  AtomicBlockType,
  BlockCondition,
  ContentUnit,
  ContentUnitKind,
  EmbeddedGenerateMeta,
  EmbeddedObjectItem,
  EmbeddedObjectSourceMode,
  EmbeddableObjectType,
  LearningObject,
  MediaSlot,
  ObjectStatus,
  ObjectType,
  RecipeItem,
  SectionArchetype,
  SectionBlockRecipe,
  SectionBlockRecipeItem,
  SectionConnectionRule,
  SectionRecipe,
  SectionRecipeBlockType,
  TutorialKnobLocks,
  TutorialTemplate,
  VersionPin,
} from '../types';

let recipeIdSeq = 0;
export function newRecipeItemId(prefix = 'ri'): string {
  recipeIdSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${recipeIdSeq}`;
}

export const ATOMIC_BLOCK_OPTIONS: { type: AtomicBlockType; label: string }[] = [
  { type: 'section-heading', label: 'Section' },
  { type: 'explanation', label: 'Explanation' },
  { type: 'worked-example', label: 'Worked example' },
  { type: 'source-excerpt', label: 'Source excerpt' },
  { type: 'instruction', label: 'Instruction' },
  { type: 'try-it', label: 'Try it' },
  { type: 'principle', label: 'Principle' },
  { type: 'misconception', label: 'Misconception' },
  { type: 'correction', label: 'Correction' },
  { type: 'scenario-advance', label: 'Scenario advance' },
  { type: 'media', label: 'Media slot' },
];

export const EMBEDDED_OBJECT_OPTIONS: { type: EmbeddableObjectType; label: string }[] = [
  { type: 'quiz', label: 'Quiz' },
  { type: 'flashcard-set', label: 'Flashcard set' },
  { type: 'concept-card', label: 'Concept card' },
  { type: 'scenario', label: 'Scenario' },
  { type: 'assignment', label: 'Assignment' },
  { type: 'reflection', label: 'Reflection' },
  { type: 'reused-from-library', label: 'Any library content (slot)' },
];

export const SOURCE_MODE_OPTIONS: { id: EmbeddedObjectSourceMode; label: string }[] = [
  { id: 'generate', label: 'Generate new' },
  { id: 'pick_from_library', label: 'Library slot (course developer picks)' },
  { id: 'prompt_on_author', label: 'Prompt when authoring' },
];

/** @deprecated Use ATOMIC_BLOCK_OPTIONS + EMBEDDED_OBJECT_OPTIONS. */
export const RECIPE_BLOCK_OPTIONS: { type: SectionRecipeBlockType; label: string }[] = [
  ...ATOMIC_BLOCK_OPTIONS.map((o) => ({ type: o.type as SectionRecipeBlockType, label: o.label })),
  { type: 'knowledge-check', label: 'Knowledge check' },
];

export const CONNECTION_OPTIONS: { id: SectionConnectionRule; label: string }[] = [
  { id: 'sequential', label: 'Sequential' },
  { id: 'standalone', label: 'Standalone' },
  { id: 'prerequisite_chain', label: 'Prerequisite chain' },
];

export const ASSESSMENT_OPTIONS: { id: AssessmentPlacement; label: string }[] = [
  { id: 'after_each_section', label: 'After each section' },
  { id: 'checkpoints_after_each', label: 'Checkpoints after each' },
  { id: 'end_only', label: 'End only' },
  { id: 'none', label: 'None' },
];

const ATOMIC_SET = new Set<string>(ATOMIC_BLOCK_OPTIONS.map((o) => o.type));
const EMBEDDED_SET = new Set<string>(EMBEDDED_OBJECT_OPTIONS.map((o) => o.type));
const SOURCE_MODE_SET = new Set<string>(SOURCE_MODE_OPTIONS.map((o) => o.id));

export function makeAtomicItem(
  blockType: AtomicBlockType,
  extras?: Partial<Omit<AtomicBlockItem, 'kind' | 'id' | 'blockType'>>,
): AtomicBlockItem {
  const required = extras?.required ?? (blockType !== 'media' && blockType !== 'source-excerpt');
  const item: AtomicBlockItem = {
    kind: 'atomic',
    id: newRecipeItemId('a'),
    blockType,
    required: blockType === 'media' ? false : required,
    preferKinds: extras?.preferKinds,
    authoringNote: extras?.authoringNote,
    condition: extras?.condition,
  };
  if (blockType === 'media') {
    item.media = extras?.media ?? { kind: 'either', hint: 'Optional media matched to this section' };
    item.condition = extras?.condition ?? { kind: 'always' };
  }
  return item;
}

export function makeEmbeddedItem(
  objectType: EmbeddableObjectType,
  extras?: Partial<Omit<EmbeddedObjectItem, 'kind' | 'id' | 'objectType'>>,
): EmbeddedObjectItem {
  const sourceMode =
    extras?.sourceMode
    ?? (objectType === 'reused-from-library' ? 'pick_from_library' : 'generate');
  const required = extras?.required ?? (objectType !== 'reflection');
  return {
    kind: 'embedded',
    id: newRecipeItemId('e'),
    objectType,
    sourceMode,
    required,
    authoringNote:
      extras?.authoringNote
      ?? (objectType === 'quiz' ? "test only this section's concept" : undefined),
    versionPin: extras?.versionPin,
    libraryTitle: extras?.libraryTitle,
    generateMeta: extras?.generateMeta,
    condition: extras?.condition,
  };
}

/** Deep-clone a recipe (new ids when `freshIds`). */
export function cloneRecipeItems(recipe: RecipeItem[], freshIds = false): RecipeItem[] {
  return recipe.map((item) => {
    if (item.kind === 'atomic') {
      return {
        ...item,
        id: freshIds ? newRecipeItemId('a') : item.id,
        preferKinds: item.preferKinds ? [...item.preferKinds] : undefined,
        media: item.media ? { ...item.media } : undefined,
        condition: item.condition ? { ...item.condition, ...(item.condition.kind === 'if_source_kinds' ? { kinds: [...item.condition.kinds] } : {}) } as BlockCondition : undefined,
      };
    }
    return {
      ...item,
      id: freshIds ? newRecipeItemId('e') : item.id,
      versionPin: item.versionPin ? { ...item.versionPin } : undefined,
      generateMeta: item.generateMeta
        ? {
            ...item.generateMeta,
            qtypes: item.generateMeta.qtypes ? [...item.generateMeta.qtypes] : undefined,
            cog: item.generateMeta.cog ? [...item.generateMeta.cog] : undefined,
            cc: item.generateMeta.cc ? [...item.generateMeta.cc] : undefined,
            pull: item.generateMeta.pull ? [...item.generateMeta.pull] : undefined,
          }
        : undefined,
      condition: item.condition ? { ...item.condition, ...(item.condition.kind === 'if_source_kinds' ? { kinds: [...item.condition.kinds] } : {}) } as BlockCondition : undefined,
    };
  });
}

/** Resolve the recipe for a Plan section — archetype override or template default. */
export function resolveSectionRecipe(
  template: TutorialTemplate,
  archetypeId?: string | null,
): SectionRecipe {
  const id = String(archetypeId || '').trim();
  if (id && Array.isArray(template.archetypes)) {
    const arch = template.archetypes.find((a) => a.id === id);
    if (arch?.recipe?.length) return arch.recipe;
  }
  return template.recipe || [];
}

/** Drop blocks whose condition is not satisfied by the section's source units. */
export function filterRecipeByCondition(
  recipe: RecipeItem[],
  units: Pick<ContentUnit, 'kind' | 'text'>[],
): RecipeItem[] {
  if (!recipe.length) return recipe;
  const kinds = new Set(units.map((u) => u.kind).filter(Boolean));
  const blob = units.map((u) => `${u.kind || ''} ${u.text || ''}`).join('\n').toLowerCase();
  return recipe.filter((item) => {
    const cond = item.condition;
    if (!cond || cond.kind === 'always') return true;
    if (cond.kind === 'if_source_kinds') {
      return (cond.kinds || []).some((k) => kinds.has(k));
    }
    if (cond.kind === 'if_source_hint') {
      const hint = String(cond.hint || '').trim().toLowerCase();
      if (!hint) return true;
      return blob.includes(hint);
    }
    return true;
  });
}

export type KnobLockKey = keyof TutorialKnobLocks;

/** Map Define-field ids → lock keys. */
export const KNOB_TO_LOCK: Record<string, KnobLockKey> = {
  secs: 'secs',
  prog: 'prog',
  dpth: 'dpth',
  end: 'end',
  chks: 'chks',
  excpts: 'chks',
  wex: 'chks',
  passOn: 'scoring',
  pass: 'scoring',
  hintsOn: 'scoring',
  hintN: 'scoring',
};

export const KNOB_LOCK_OPTIONS: { key: KnobLockKey; label: string; hint: string }[] = [
  { key: 'secs', label: 'Section count', hint: 'How many sections (non–define-first path)' },
  { key: 'dpth', label: 'Depth', hint: 'Overview / Standard / In-depth default' },
  { key: 'prog', label: 'Progression', hint: 'Linear / themed / prerequisite' },
  { key: 'end', label: 'End with', hint: 'Recap, end quiz, assignment, none' },
  { key: 'chks', label: 'Checks / section', hint: 'Questions per embedded quiz slot' },
  { key: 'scoring', label: 'Scoring & hints', hint: 'Pass mark on/off, threshold, and progressive hints' },
];

/**
 * Per-knob lock. Defaults unlocked when `knobLocks` is present.
 * Legacy templates without `knobLocks` honor `structureLocked` (all-or-nothing).
 */
export function isKnobLocked(template: TutorialTemplate, key: KnobLockKey): boolean {
  if (template.id === FREEFORM_TUTORIAL_TEMPLATE_ID) return false;
  if (template.id === BLANK_CANVAS_TUTORIAL_TEMPLATE_ID) return false;
  if (template.knobLocks && typeof template.knobLocks === 'object') {
    return template.knobLocks[key] === true;
  }
  return template.structureLocked !== false;
}

export function isFieldKnobLocked(template: TutorialTemplate, fieldId: string): boolean {
  const key = KNOB_TO_LOCK[fieldId];
  if (!key) return false;
  return isKnobLocked(template, key);
}

/** Merge author fv with template defaults for locked knobs only. */
export function applyKnobLocks(
  template: TutorialTemplate,
  fv: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...fv };
  const defaults = template.knobDefaults || {};
  for (const [fieldId, lockKey] of Object.entries(KNOB_TO_LOCK)) {
    if (!isKnobLocked(template, lockKey)) continue;
    if (fieldId in defaults) out[fieldId] = (defaults as Record<string, unknown>)[fieldId];
  }
  return out;
}

export function listTemplateValidationWarnings(template: {
  recipe: RecipeItem[];
  archetypes?: SectionArchetype[];
  assessmentPlacement: AssessmentPlacement;
}): string[] {
  const warn: string[] = [];
  const checkRecipe = (recipe: RecipeItem[], label: string) => {
    const hasCheck = recipe.some(isKnowledgeCheckStyle);
    if (
      (template.assessmentPlacement === 'after_each_section'
        || template.assessmentPlacement === 'checkpoints_after_each')
      && !hasCheck
    ) {
      warn.push(`${label}: Assessment = after each section, but no Quiz or Try-it block is in the recipe.`);
    }
    if (template.assessmentPlacement === 'none' && hasCheck) {
      warn.push(`${label}: Assessment is None, but the recipe still includes a Quiz or Try-it.`);
    }
    if (template.assessmentPlacement === 'end_only' && hasCheck) {
      warn.push(`${label}: Assessment is End only — per-section Quiz/Try-it may duplicate the end check.`);
    }
  };
  checkRecipe(template.recipe || [], 'Default recipe');
  for (const a of template.archetypes || []) {
    checkRecipe(a.recipe || [], `Archetype “${a.name}”`);
  }
  return warn;
}

export function formatGenerateMetaForPrompt(meta: EmbeddedGenerateMeta | undefined): string {
  if (!meta || typeof meta !== 'object') return '';
  const bits = [
    meta.title ? `title="${String(meta.title).replace(/"/g, "'")}"` : '',
    meta.objective ? `objective="${String(meta.objective).replace(/"/g, "'")}"` : '',
    meta.questionCount != null ? `questionCount=${meta.questionCount}` : '',
    meta.passOn === false ? 'passOn=false' : '',
    meta.passOn !== false && meta.passMark ? `passMark=${meta.passMark}` : '',
    meta.qtypes?.length ? `qtypes=[${meta.qtypes.join('|')}]` : '',
    meta.cog?.length ? `cog=[${meta.cog.join('|')}]` : '',
    meta.diff ? `diff=${meta.diff}` : '',
    meta.wrong ? `wrong="${String(meta.wrong).replace(/"/g, "'")}"` : '',
    meta.adaptive ? `adaptive=${meta.adaptive}` : '',
    meta.show ? `show=${meta.show}` : '',
    meta.perq != null ? `perq=${meta.perq}` : '',
    meta.cardCount != null ? `cardCount=${meta.cardCount}` : '',
    meta.cc?.length ? `cc=[${meta.cc.join('|')}]` : '',
    meta.pull?.length ? `pull=[${meta.pull.join('|')}]` : '',
    meta.dir ? `dir=${meta.dir}` : '',
    meta.hooks != null ? `hooks=${meta.hooks}` : '',
    meta.conceptFocus ? `conceptFocus="${String(meta.conceptFocus).replace(/"/g, "'")}"` : '',
    meta.voi ? `voi="${String(meta.voi).replace(/"/g, "'")}"` : '',
    meta.len ? `len=${meta.len}` : '',
    meta.tt ? `tt=${meta.tt}` : '',
    meta.del ? `del=${meta.del}` : '',
    meta.el ? `el=${meta.el}` : '',
    meta.cite != null ? `cite=${meta.cite}` : '',
    meta.instructions ? `instructions="${String(meta.instructions).replace(/"/g, "'")}"` : '',
  ].filter(Boolean);
  return bits.length ? ` generateMeta={${bits.join(' ')}}` : '';
}

/** Flat projection for ObjectCreator / section plans — does not mutate stored customs. */
export function toFlatSectionBlockRecipe(recipe: RecipeItem[]): SectionBlockRecipe {
  const out: SectionBlockRecipeItem[] = [];
  for (const item of recipe) {
    if (item.kind === 'atomic') {
      out.push({
        type: item.blockType,
        preferKinds: item.preferKinds,
        required: item.required,
      });
      continue;
    }
    if (item.objectType === 'quiz') {
      out.push({
        type: 'knowledge-check',
        preferKinds: ['Fact', 'Definition', 'Key point'],
        required: item.required,
      });
      continue;
    }
    // Other embeds have no flat equivalent; skip so scaffold stays stable.
  }
  return out;
}

/** Derive legacy mediaSlots[] from atomic media recipe rows (for older readers). */
export function deriveMediaSlots(recipe?: RecipeItem[]): MediaSlot[] {
  const slots: MediaSlot[] = [];
  (recipe || []).forEach((item, afterRecipeIndex) => {
    if (item.kind !== 'atomic' || item.blockType !== 'media') return;
    slots.push({
      id: item.id,
      kind: item.media?.kind || 'either',
      required: item.required === true,
      afterRecipeIndex,
      hint: item.media?.hint || item.authoringNote,
    });
  });
  return slots;
}

/** @deprecated Media slots are first-class again — identity pass for call-site compatibility. */
export function stripMediaFromRecipe(recipe: RecipeItem[] | undefined | null): RecipeItem[] {
  return recipe || [];
}

/** In-memory only: map legacy flat rows → composite recipe. Never writes back to storage. */
export function legacyFlatToRecipe(flat: SectionBlockRecipeItem[]): RecipeItem[] {
  return flat.map((row) => {
    if (row.type === 'knowledge-check') {
      return makeEmbeddedItem('quiz', {
        required: row.required !== false,
        sourceMode: 'generate',
        authoringNote: "test only this section's concept",
      });
    }
    if (ATOMIC_SET.has(row.type)) {
      return makeAtomicItem(row.type as AtomicBlockType, {
        required: row.type === 'media' ? false : row.required,
        preferKinds: row.preferKinds,
        media: row.type === 'media'
          ? { kind: 'either', hint: 'Optional media matched to this section' }
          : undefined,
      });
    }
    // Unknown legacy type → treat as explanation so the recipe stays content-bearing.
    return makeAtomicItem('explanation', { required: true, preferKinds: row.preferKinds });
  });
}

function isAtomicItem(x: unknown): x is AtomicBlockItem {
  if (!x || typeof x !== 'object') return false;
  const r = x as AtomicBlockItem;
  return r.kind === 'atomic' && typeof r.id === 'string' && ATOMIC_SET.has(r.blockType);
}

function isEmbeddedItem(x: unknown): x is EmbeddedObjectItem {
  if (!x || typeof x !== 'object') return false;
  const r = x as EmbeddedObjectItem;
  return (
    r.kind === 'embedded'
    && typeof r.id === 'string'
    && EMBEDDED_SET.has(r.objectType)
    && SOURCE_MODE_SET.has(r.sourceMode)
    && typeof r.required === 'boolean'
  );
}

function isRecipeItem(x: unknown): x is RecipeItem {
  return isAtomicItem(x) || isEmbeddedItem(x);
}

function isLegacyFlatItem(x: unknown): x is SectionBlockRecipeItem {
  if (!x || typeof x !== 'object') return false;
  const t = (x as SectionBlockRecipeItem).type;
  return RECIPE_BLOCK_OPTIONS.some((o) => o.type === t);
}

/** Resolve recipe from either new `recipe` or legacy `sectionBlockRecipe` — in memory only. */
export function resolveTemplateRecipe(raw: {
  recipe?: unknown;
  sectionBlockRecipe?: unknown;
}): RecipeItem[] {
  if (Array.isArray(raw.recipe) && raw.recipe.length && raw.recipe.every(isRecipeItem)) {
    return raw.recipe as RecipeItem[];
  }
  if (Array.isArray(raw.recipe) && raw.recipe.some(isRecipeItem)) {
    return (raw.recipe as unknown[]).filter(isRecipeItem);
  }
  const flat = Array.isArray(raw.sectionBlockRecipe)
    ? (raw.sectionBlockRecipe as unknown[]).filter(isLegacyFlatItem)
    : [];
  if (flat.length) return legacyFlatToRecipe(flat);
  return [];
}

/** True when the recipe includes a Section heading block (drives multi-section template knobs). */
export function recipeHasSectionBlock(recipe: RecipeItem[] | undefined | null): boolean {
  return (recipe || []).some((r) => r.kind === 'atomic' && r.blockType === 'section-heading');
}

/** True when the default recipe uses a Section heading (template-level section knobs). */
export function templateHasSectionBlock(template: {
  recipe?: RecipeItem[];
  archetypes?: SectionArchetype[];
}): boolean {
  return recipeHasSectionBlock(template.recipe);
}

/** Ids previously auto-seeded as Teaching / Checkpoint / Capstone — always stripped. */
const SEEDED_ARCHETYPE_IDS = new Set(['teaching', 'checkpoint', 'capstone']);

/** Drop the old auto-seeded section types (and same-name leftovers) from any template. */
export function stripSeededSectionArchetypes(
  archetypes: SectionArchetype[] | undefined | null,
): SectionArchetype[] {
  return (archetypes || []).filter((a) => {
    if (!a || !a.id) return false;
    if (SEEDED_ARCHETYPE_IDS.has(String(a.id).toLowerCase())) return false;
    const name = String(a.name || '').trim().toLowerCase();
    if (name === 'teaching' || name === 'checkpoint' || name === 'capstone') return false;
    return true;
  });
}

export function isContentBearing(item: RecipeItem): boolean {
  if (item.kind === 'embedded') return true;
  return item.blockType !== 'section-heading';
}

export function isKnowledgeCheckStyle(item: RecipeItem): boolean {
  if (item.kind === 'embedded' && item.objectType === 'quiz') return true;
  if (item.kind === 'atomic' && item.blockType === 'try-it') return true;
  return false;
}

/** True when this embed is a library placeholder (course developer pins later). */
export function isLibraryPlaceholderMode(item: EmbeddedObjectItem): boolean {
  return (
    item.sourceMode === 'pick_from_library'
    || item.objectType === 'reused-from-library'
  );
}

/**
 * @deprecated Prefer isLibraryPlaceholderMode for templates.
 * Kept for call sites that mean “library-sourced embed”.
 */
export function needsLibraryPin(item: EmbeddedObjectItem): boolean {
  return isLibraryPlaceholderMode(item);
}

/** Required library slot still missing a concrete pin (Plan / Generate gate). */
export function needsAuthorLibraryPin(item: EmbeddedObjectItem): boolean {
  return isLibraryPlaceholderMode(item)
    && !!item.required
    && !(item.versionPin?.objectId && item.versionPin?.versionId);
}

/* ─── Library boundary (Content Library → embed picker) ──────────── */

export interface LibraryObjectVersionChoice {
  versionId: string;
  versionNumber: number;
  status: ObjectStatus;
  isLive: boolean;
}

export interface LibraryObjectChoice {
  id: string;
  title: string;
  type: ObjectType;
  status: ObjectStatus;
  versions: LibraryObjectVersionChoice[];
  /** Content Library folder membership (empty = unfiled). */
  collectionIds?: string[];
}

/** Map an embedded-slot type to Content Library type filter (null = any type). */
/**
 * The embed types that exist as objects in the Content Library. The Tutorial V3
 * block types deliberately do not: nothing puts a `matching` on a shelf, so
 * there is nothing for a library slot to point at and the picker has no
 * candidates to offer.
 */
const LIBRARY_PICKABLE = new Set<string>([
  'quiz', 'flashcard-set', 'concept-card', 'scenario', 'assignment', 'reflection',
]);

export function embedTypeToLibraryTypes(objectType: EmbeddableObjectType): ObjectType[] | null {
  if (objectType === 'reused-from-library') return null;
  if (!LIBRARY_PICKABLE.has(objectType)) return [];
  return [objectType as ObjectType];
}

function versionsForObject(obj: LearningObject): LibraryObjectVersionChoice[] {
  const userId = readSessionUserId() || DEMO_CD_USER_ID;
  const fromLocal = listVersionsForObject(userId, obj.id).map((v) => ({
    versionId: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    isLive: v.isLive,
  }));
  if (fromLocal.length) return fromLocal;
  const fromSeed = VERSIONS
    .filter((v) => v.objectId === obj.id)
    .map((v) => ({
      versionId: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      isLive: v.isLive,
    }))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  if (fromSeed.length) return fromSeed;
  return [{
    versionId: `${obj.id}__v1`,
    versionNumber: 1,
    status: obj.status,
    isLive: obj.status === 'published' || obj.status === 'approved',
  }];
}

/**
 * Typed boundary for embedding / version-pinning from the Content Library.
 * Reads the in-app library (seed catalog + optional account objects). No fabricated rows.
 * TODO: replace with GET /api/objects?reusable=true when the backend is wired.
 */
export async function listEmbeddableLibraryObjects(filter?: {
  types?: ObjectType[];
  search?: string;
  /** Account library content from App context (createdObjects). */
  extraObjects?: LearningObject[];
}): Promise<LibraryObjectChoice[]> {
  const extras = filter?.extraObjects ?? [];
  const all = [
    ...extras,
    ...OBJECTS.filter((o) => !extras.some((e) => e.id === o.id)),
  ];

  const search = (filter?.search || '').trim().toLowerCase();
  const typeSet = filter?.types?.length ? new Set(filter.types) : null;

  return all
    .filter((o) => {
      if (typeSet && !typeSet.has(o.type)) return false;
      if (search && !o.title.toLowerCase().includes(search)) return false;
      return true;
    })
    .map((o) => ({
      id: o.id,
      title: o.title,
      type: o.type,
      status: o.status,
      versions: versionsForObject(o),
      collectionIds: Array.isArray(o.collectionIds) && o.collectionIds.length
        ? [...o.collectionIds]
        : (o.collectionId ? [o.collectionId] : []),
    }));
}

/** True when pin references a live objectId + Version.id in the library snapshot. */
export function versionPinResolves(
  pin: VersionPin | undefined,
  library: LibraryObjectChoice[],
): boolean {
  if (!pin?.objectId || !pin?.versionId) return false;
  const obj = library.find((o) => o.id === pin.objectId);
  if (!obj) return false;
  return obj.versions.some((v) => v.versionId === pin.versionId);
}

/* ─── Built-in templates ─────────────────────────────────────────── */

const CEP_RECIPE: RecipeItem[] = [
  makeAtomicItem('section-heading', { required: true }),
  makeAtomicItem('explanation', {
    required: true,
    preferKinds: ['Definition', 'Key point'],
  }),
  makeAtomicItem('worked-example', {
    required: true,
    preferKinds: ['Example'],
  }),
  makeEmbeddedItem('quiz', {
    required: true,
    sourceMode: 'generate',
    authoringNote: "test only this section's concept",
  }),
];

function packTemplate(
  partial: Omit<TutorialTemplate, 'recipe' | 'sectionBlockRecipe' | 'mediaSlots'> & {
    recipe: RecipeItem[];
  },
): TutorialTemplate {
  const recipe = partial.recipe || [];
  const archetypes = stripSeededSectionArchetypes(
    Array.isArray(partial.archetypes)
      ? partial.archetypes
        .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.recipe))
        .map((a) => ({
          id: a.id,
          name: a.name.trim() || a.id,
          description: typeof a.description === 'string' ? a.description : undefined,
          recipe: a.recipe,
        }))
      : [],
  );
  return {
    ...partial,
    recipe,
    archetypes: archetypes?.length ? archetypes : undefined,
    sectionBlockRecipe: toFlatSectionBlockRecipe(recipe),
    mediaSlots: deriveMediaSlots(recipe),
    // Builtins and editor saves are composite-authored; callers may override to false for legacy.
    usesCompositeRecipe: partial.usesCompositeRecipe !== false,
  };
}

/** True when generation should read composite recipe (not the flat shadow). */
export function templateUsesCompositeRecipe(template: TutorialTemplate): boolean {
  return template.usesCompositeRecipe === true
    && Array.isArray(template.recipe)
    && template.recipe.length > 0;
}

/**
 * Serialize one recipe item for the generate prompt.
 * Quiz embeds are first-class; other embeds are explicitly deferred (not silent skips).
 */
function formatConditionForPrompt(cond?: BlockCondition): string {
  if (!cond || cond.kind === 'always') return '';
  if (cond.kind === 'if_source_kinds') {
    return ` condition=if_source_kinds:[${(cond.kinds || []).join('|')}]`;
  }
  if (cond.kind === 'if_source_hint') {
    return ` condition=if_source_hint:"${String(cond.hint || '').replace(/"/g, "'")}"`;
  }
  return '';
}

export function formatRecipeItemForPrompt(item: RecipeItem, index: number): string {
  const cond = formatConditionForPrompt(item.condition);
  if (item.kind === 'atomic') {
    const prefer = item.preferKinds?.length ? ` (prefer: ${item.preferKinds.join(', ')})` : '';
    const req = item.required === false ? ' [optional]' : '';
    const note = item.authoringNote
      ? ` authoringNote="${item.authoringNote.replace(/"/g, "'")}"`
      : '';
    const media = item.blockType === 'media' && item.media?.kind
      ? ` mediaKind=${item.media.kind}`
      : '';
    return `${index + 1}. atomic:${item.blockType}${prefer}${req}${note}${media}${cond}`;
  }
  const req = item.required ? ' required=true' : ' required=false';
  const note = item.authoringNote
    ? ` authoringNote="${item.authoringNote.replace(/"/g, "'")}"`
    : '';
  const metaSuffix = formatGenerateMetaForPrompt(item.generateMeta);

  if (item.sourceMode === 'pick_from_library') {
    const pin = item.versionPin?.objectId
      ? ` libraryObject="${(item.libraryTitle || item.versionPin.objectId).replace(/"/g, "'")}"`
      : (item.libraryTitle ? ` slotTitle="${String(item.libraryTitle).replace(/"/g, "'")}"` : '');
    return (
      `${index + 1}. EMBEDDED_${item.objectType.toUpperCase()} sourceMode=pick_from_library${req}${pin}${note}${cond}`
      + (item.versionPin?.objectId
        ? ' → do NOT emit a part; the platform inserts the pinned library content'
        : ' → do NOT emit a part; course developer chooses the library content at authoring time')
    );
  }

  if (item.objectType === 'quiz') {
    return (
      `${index + 1}. EMBEDDED_QUIZ objectType=quiz sourceMode=${item.sourceMode}${req}${note}${metaSuffix}${cond}`
      + ' → emit ONE section-quiz content for THIS section only (honor generateMeta when present)'
    );
  }

  // Non-quiz generate / prompt_on_author: reserve a slot — platform fills via per-type generators.
  // Callers that have a sectionId should prefer the server formatCompositeRecipe which prefixes sectionId.
  return (
    `${index + 1}. EMBEDDED_${item.objectType.toUpperCase()} sourceMode=${item.sourceMode}${req}${note}${metaSuffix}${cond}`
    + ` → emit ONE rich-text with heading exactly "⟦EMBED_SLOT:<sectionId>:${item.id}⟧" and body "${item.objectType} (generated separately)"; do NOT invent a full nested object`
  );
}

/** Built-in freeform template — course developers may edit structure knobs. */
export const FREEFORM_TUTORIAL_TEMPLATE_ID = 'v2-author-freeform';

/**
 * Internal blank shape for the “Write it yourself” authoring path.
 * Not listed in Template Library — resolved only via getTutorialTemplate.
 */
export const WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID = 'v2-write-yourself';

export function isWriteYourselfTutorial(templateId?: string | null): boolean {
  return templateId === WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID;
}

/**
 * Blank canvas — no set section count or prescribed content. Structure lets
 * the author add any number of sections plus quiz / flashcard / concept-card /
 * library-embed slots; Sources and AI generation stay available (unlike the
 * Write-it-yourself path).
 */
export const BLANK_CANVAS_TUTORIAL_TEMPLATE_ID = 'v2-blank-canvas';

export function isBlankCanvasTutorial(templateId?: string | null): boolean {
  return templateId === BLANK_CANVAS_TUTORIAL_TEMPLATE_ID;
}

/** @deprecated Prefer KNOB_LOCK_OPTIONS + isKnobLocked. Field ids historically locked together. */
export const TEMPLATE_LOCKED_KNOB_IDS = [
  'secs', 'prog', 'dpth', 'end',
  'chks', 'excpts', 'wex',
  'pass', 'hintsOn', 'hintN', 'aiExtra',
] as const;

/** True when any structure knob is locked (legacy all-or-nothing or granular). */
export function isTutorialStructureLocked(template: TutorialTemplate): boolean {
  if (template.id === FREEFORM_TUTORIAL_TEMPLATE_ID) return false;
  if (template.id === BLANK_CANVAS_TUTORIAL_TEMPLATE_ID) return false;
  if (template.knobLocks && typeof template.knobLocks === 'object') {
    return KNOB_LOCK_OPTIONS.some((o) => template.knobLocks?.[o.key] === true);
  }
  return template.structureLocked !== false;
}

/** Built-in pedagogical templates. Custom templates use the same shape. */
/** Legacy all-locked map — builtins that previously used structureLocked:true. */
const ALL_KNOBS_LOCKED: TutorialKnobLocks = {
  secs: true, prog: true, dpth: true, end: true, chks: true, scoring: true,
};

const ALL_KNOBS_UNLOCKED: TutorialKnobLocks = {
  secs: false, prog: false, dpth: false, end: false, chks: false, scoring: false,
};

/** Locks helper for builtins — no pre-seeded Teaching/Checkpoint/Capstone archetypes. */
function withArchetypes(_recipe: RecipeItem[], locked: boolean): Pick<TutorialTemplate, 'archetypes' | 'structureLocked' | 'knobLocks'> {
  return {
    archetypes: [],
    structureLocked: locked,
    knobLocks: locked ? { ...ALL_KNOBS_LOCKED } : { ...ALL_KNOBS_UNLOCKED },
  };
}

export const BUILTIN_TUTORIAL_TEMPLATES: TutorialTemplate[] = [
  packTemplate({
    id: 'v2-concept-example-practice',
    name: 'Concept, Example, Practice',
    description:
      'Each section explains one concept, shows a worked example, then embeds a real Quiz content to check understanding.',
    builtin: true,
    ...withArchetypes(CEP_RECIPE, true),
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: CEP_RECIPE,
    knobDefaults: {
      secs: 6, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 2, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'v2-guided-walkthrough',
    name: 'Guided Walkthrough',
    description: 'Step-by-step how-to: instruction, optional excerpt, then a try-it checkpoint.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('instruction', { required: true, preferKinds: ['Procedure', 'Key point'] }),
      makeAtomicItem('source-excerpt', { preferKinds: ['Quote', 'Procedure'] }),
      makeAtomicItem('try-it', { required: true, preferKinds: ['Fact', 'Procedure'] }),
    ], true),
    sectionConnection: 'prerequisite_chain',
    assessmentPlacement: 'checkpoints_after_each',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('instruction', { required: true, preferKinds: ['Procedure', 'Key point'] }),
      makeAtomicItem('source-excerpt', { preferKinds: ['Quote', 'Procedure'] }),
      makeAtomicItem('try-it', { required: true, preferKinds: ['Fact', 'Procedure'] }),
    ],
    knobDefaults: {
      secs: 5, prog: 'Prerequisite chain', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'v2-worked-example-first',
    name: 'Worked Example First',
    description: 'Open with a full source example, then name the principle, then check with an embedded Quiz.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('worked-example', { required: true, preferKinds: ['Example'] }),
      makeAtomicItem('principle', { required: true, preferKinds: ['Definition', 'Key point'] }),
      makeEmbeddedItem('quiz', {
        required: true,
        sourceMode: 'generate',
        authoringNote: "test only this section's concept",
      }),
    ], true),
    sectionConnection: 'standalone',
    assessmentPlacement: 'after_each_section',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('worked-example', { required: true, preferKinds: ['Example'] }),
      makeAtomicItem('principle', { required: true, preferKinds: ['Definition', 'Key point'] }),
      makeEmbeddedItem('quiz', {
        required: true,
        sourceMode: 'generate',
        authoringNote: "test only this section's concept",
      }),
    ],
    knobDefaults: {
      secs: 3, prog: 'Themed clusters', dpth: 'In-depth', end: 'Recap only',
      chks: 1, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'v2-explain-misconception-correct',
    name: 'Explain, Misconception, Correct',
    description: 'Explain an idea, surface a common mistake, correct it, then probe with an embedded Quiz.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: true, preferKinds: ['Definition', 'Key point'] }),
      makeAtomicItem('misconception', {
        required: false,
        preferKinds: ['Key point', 'Fact'],
        condition: { kind: 'if_source_hint', hint: 'misconception' },
        authoringNote: 'Only when the source surfaces a common mistake',
      }),
      makeAtomicItem('correction', { required: true, preferKinds: ['Definition', 'Fact'] }),
      makeEmbeddedItem('quiz', {
        required: true,
        sourceMode: 'generate',
        authoringNote: 'probe the misconception trap for this section',
      }),
    ], true),
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: true, preferKinds: ['Definition', 'Key point'] }),
      makeAtomicItem('misconception', {
        required: false,
        preferKinds: ['Key point', 'Fact'],
        condition: { kind: 'if_source_hint', hint: 'misconception' },
        authoringNote: 'Only when the source surfaces a common mistake',
      }),
      makeAtomicItem('correction', { required: true, preferKinds: ['Definition', 'Fact'] }),
      makeEmbeddedItem('quiz', {
        required: true,
        sourceMode: 'generate',
        authoringNote: 'probe the misconception trap for this section',
      }),
    ],
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 0, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'v2-scenario-driven',
    name: 'Scenario Driven',
    description: 'One running case threads every section; cumulative assessment at the end.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('scenario-advance', {
        required: true,
        preferKinds: ['Example', 'Procedure', 'Key point'],
      }),
      makeAtomicItem('explanation', { preferKinds: ['Definition', 'Key point'] }),
    ], true),
    sectionConnection: 'sequential',
    assessmentPlacement: 'end_only',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('scenario-advance', {
        required: true,
        preferKinds: ['Example', 'Procedure', 'Key point'],
      }),
      makeAtomicItem('explanation', { preferKinds: ['Definition', 'Key point'] }),
    ],
    knobDefaults: {
      secs: 4, prog: 'Linear build-up', dpth: 'Standard', end: 'End quiz',
      chks: 0, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'v2-reference-cheatsheet',
    name: 'Reference / Cheat Sheet',
    description: 'Dense, example-light review sections; minimal or no checks.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', {
        required: true,
        preferKinds: ['Fact', 'Definition', 'Key point'],
      }),
      makeAtomicItem('source-excerpt', { preferKinds: ['Quote', 'Fact'] }),
    ], true),
    sectionConnection: 'standalone',
    assessmentPlacement: 'end_only',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', {
        required: true,
        preferKinds: ['Fact', 'Definition', 'Key point'],
      }),
      makeAtomicItem('source-excerpt', { preferKinds: ['Quote', 'Fact'] }),
    ],
    knobDefaults: {
      secs: 4, prog: 'Themed clusters', dpth: 'Overview', end: 'None',
      chks: 0, excpts: 2, wex: false, pass: '70%', hintsOn: false, hintN: 0, aiExtra: false,
    },
  }),
  packTemplate({
    id: BLANK_CANVAS_TUTORIAL_TEMPLATE_ID,
    name: 'Blank canvas',
    description:
      'No set structure — add any number of sections plus quizzes, flashcards, concept cards, library embeds, and media wherever you want. Sources and AI generation stay available.',
    builtin: true,
    ...withArchetypes([
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: false }),
    ], false),
    sectionConnection: 'sequential',
    assessmentPlacement: 'end_only',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: false }),
    ],
    knobDefaults: {
      secs: 1, prog: 'Linear build-up', dpth: 'Standard', end: 'None',
      chks: 0, excpts: 0, wex: false, pass: '70%', hintsOn: false, hintN: 0, aiExtra: false,
    },
  }),
  packTemplate({
    id: FREEFORM_TUTORIAL_TEMPLATE_ID,
    name: 'Freeform',
    description:
      'Course developers choose section count, depth, progression, and related structure themselves. Plan can still assign section archetypes.',
    builtin: true,
    ...withArchetypes(CEP_RECIPE, false),
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: CEP_RECIPE,
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
];

export const DEFAULT_TUTORIAL_TEMPLATE_ID = 'v2-concept-example-practice';

const STORAGE_KEY = 'laic-tutorial-v2-templates';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'custom';
}

function defaultKnobDefaults(): TutorialTemplate['knobDefaults'] {
  return {
    secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
    chks: 1, excpts: 0, wex: true, passOn: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
  };
}

/**
 * Normalize a stored/raw template into the in-memory composite shape.
 * Non-destructive: never writes back to storage. Legacy `sectionBlockRecipe`
 * is mapped to `recipe` only for presentation; Save is what persists the new shape.
 */
function normalizeCustom(raw: unknown): TutorialTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<TutorialTemplate> & { sectionBlockRecipe?: unknown; recipe?: unknown };
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;

  let recipe = resolveTemplateRecipe(t);
  if (!recipe.length) {
    recipe = [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: true }),
    ];
  }

  // Only treat as composite-authored when storage already had RecipeItem[].
  // Flat-only customs stay on the legacy generate path until re-saved from the editor.
  const authoredComposite = Array.isArray(t.recipe)
    && (t.recipe as unknown[]).length > 0
    && (t.recipe as unknown[]).some(isRecipeItem);

  const isFreeform = t.id === FREEFORM_TUTORIAL_TEMPLATE_ID;
  const hasKnobLocks = t.knobLocks && typeof t.knobLocks === 'object';
  // New customs default unlocked; legacy rows without knobLocks keep structureLocked semantics.
  const structureLocked = isFreeform
    ? false
    : hasKnobLocks
      ? Object.values(t.knobLocks!).some(Boolean)
      : t.structureLocked !== false;
  const knobLocks: TutorialKnobLocks | undefined = isFreeform
    ? { ...ALL_KNOBS_UNLOCKED }
    : hasKnobLocks
      ? { ...ALL_KNOBS_UNLOCKED, ...t.knobLocks }
      : undefined;

  const archetypes = stripSeededSectionArchetypes(
    Array.isArray(t.archetypes)
      ? t.archetypes
        .filter((a): a is SectionArchetype => !!a && typeof a.id === 'string' && Array.isArray(a.recipe))
        .map((a) => ({
          id: a.id,
          name: String(a.name || a.id),
          description: typeof a.description === 'string' ? a.description : undefined,
          recipe: resolveTemplateRecipe(a),
        }))
        .filter((a) => a.recipe.length > 0)
      : [],
  );

  return packTemplate({
    id: t.id,
    name: t.name.trim() || 'Untitled template',
    description: typeof t.description === 'string' ? t.description : '',
    builtin: false,
    structureLocked,
    knobLocks,
    archetypes,
    sectionConnection: (CONNECTION_OPTIONS.some((o) => o.id === t.sectionConnection)
      ? t.sectionConnection
      : 'sequential') as SectionConnectionRule,
    assessmentPlacement: (ASSESSMENT_OPTIONS.some((o) => o.id === t.assessmentPlacement)
      ? t.assessmentPlacement
      : 'after_each_section') as AssessmentPlacement,
    recipe,
    usesCompositeRecipe: authoredComposite || t.usesCompositeRecipe === true,
    knobDefaults: {
      ...defaultKnobDefaults(),
      ...(t.knobDefaults || {}),
      secs: typeof t.knobDefaults?.secs === 'number' ? t.knobDefaults.secs : 3,
      // words retired — length follows curated units + depth
      chks: typeof t.knobDefaults?.chks === 'number' ? t.knobDefaults.chks : 1,
      wex: t.knobDefaults?.wex !== false,
      hintsOn: t.knobDefaults?.hintsOn !== false,
      hintN: typeof t.knobDefaults?.hintN === 'number' ? t.knobDefaults.hintN : 4,
      aiExtra: t.knobDefaults?.aiExtra === true,
    },
  });
}

export function loadCustomTutorialTemplates(): TutorialTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map(normalizeCustom).filter(Boolean) as TutorialTemplate[];
    // Persist strips only retired seeded archetypes (teaching/checkpoint/capstone).
    // Media slots are first-class again — do not strip them from storage.
    const needsRewrite = parsed.some((row: any) => {
      const arch = Array.isArray(row?.archetypes) ? row.archetypes : [];
      return arch.some((a: any) => {
        const id = String(a?.id || '').toLowerCase();
        const name = String(a?.name || '').trim().toLowerCase();
        return SEEDED_ARCHETYPE_IDS.has(id)
          || name === 'teaching' || name === 'checkpoint' || name === 'capstone';
      });
    });
    if (needsRewrite && normalized.length) persistCustom(normalized);
    return normalized;
  } catch {
    return [];
  }
}

function persistCustom(templates: TutorialTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.map((t) => ({ ...t, builtin: false }))));
}

export function saveCustomTutorialTemplate(
  input: Omit<TutorialTemplate, 'id' | 'builtin'> & { id?: string },
): TutorialTemplate {
  const customs = loadCustomTutorialTemplates();
  // Same id as a builtin → override that builtin for this browser.
  const id = input.id?.trim()
    || `custom-${slugify(input.name)}-${Date.now().toString(36)}`;

  const recipe = input.recipe?.length
    ? input.recipe
    : resolveTemplateRecipe(input);

  const knobLocks = id === FREEFORM_TUTORIAL_TEMPLATE_ID
    ? { ...ALL_KNOBS_UNLOCKED }
    : input.knobLocks
      ? { ...ALL_KNOBS_UNLOCKED, ...input.knobLocks }
      : { ...ALL_KNOBS_UNLOCKED };
  const structureLocked = id === FREEFORM_TUTORIAL_TEMPLATE_ID
    ? false
    : Object.values(knobLocks).some(Boolean);

  const packed = packTemplate({
    ...input,
    id,
    builtin: false,
    name: input.name.trim() || 'Untitled template',
    description: (input.description || '').trim(),
    structureLocked,
    knobLocks,
    archetypes: stripSeededSectionArchetypes(input.archetypes),
    recipe: recipe.length
      ? recipe
      : [
          makeAtomicItem('section-heading', { required: true }),
          makeAtomicItem('explanation', { required: true }),
        ],
    usesCompositeRecipe: true,
    knobDefaults: input.knobDefaults || defaultKnobDefaults(),
  });

  const idx = customs.findIndex((c) => c.id === id);
  if (idx >= 0) customs[idx] = packed;
  else customs.push(packed);
  persistCustom(customs);
  return packed;
}

export function deleteCustomTutorialTemplate(id: string): void {
  persistCustom(loadCustomTutorialTemplates().filter((t) => t.id !== id));
}

/** Duplicate any template as a new custom (fresh ids, unlocked knobs by default). */
export function duplicateTutorialTemplate(sourceId: string, nameSuffix = ' copy'): TutorialTemplate | null {
  const src = getTutorialTemplate(sourceId);
  if (!src) return null;
  return saveCustomTutorialTemplate({
    name: `${src.name}${nameSuffix}`,
    description: src.description,
    structureLocked: false,
    knobLocks: { ...ALL_KNOBS_UNLOCKED },
    sectionConnection: src.sectionConnection,
    assessmentPlacement: src.assessmentPlacement,
    recipe: cloneRecipeItems(src.recipe || [], true),
    archetypes: (src.archetypes || []).map((a) => ({
      id: `${a.id}-${Date.now().toString(36)}`,
      name: a.name,
      description: a.description,
      recipe: cloneRecipeItems(a.recipe || [], true),
    })),
    sectionBlockRecipe: toFlatSectionBlockRecipe(src.recipe || []),
    mediaSlots: deriveMediaSlots(src.recipe || []),
    knobDefaults: { ...src.knobDefaults },
  });
}

export function isBuiltinTemplateId(id: string): boolean {
  return BUILTIN_TUTORIAL_TEMPLATES.some((b) => b.id === id);
}

/** True when a stored custom row overrides a built-in id. */
export function isBuiltinOverride(id: string): boolean {
  return isBuiltinTemplateId(id) && loadCustomTutorialTemplates().some((c) => c.id === id);
}

export function listTutorialTemplates(): TutorialTemplate[] {
  const customs = loadCustomTutorialTemplates();
  const byId = new Map(customs.map((c) => [c.id, c]));
  const mergedBuiltins = BUILTIN_TUTORIAL_TEMPLATES.map((b) => {
    const override = byId.get(b.id);
    if (!override) return b;
    // Freeform / Blank canvas must remain author-editable even if a local override exists.
    if (b.id === FREEFORM_TUTORIAL_TEMPLATE_ID || b.id === BLANK_CANVAS_TUTORIAL_TEMPLATE_ID) {
      return {
        ...override,
        builtin: false,
        structureLocked: false,
        knobLocks: { ...ALL_KNOBS_UNLOCKED },
      };
    }
    return { ...override, builtin: false };
  });
  const pureCustom = customs.filter((c) => !isBuiltinTemplateId(c.id));
  return [...mergedBuiltins, ...pureCustom];
}

export function writeYourselfTutorialTemplate(): TutorialTemplate {
  const recipe: RecipeItem[] = [
    makeAtomicItem('section-heading', { required: true }),
    makeAtomicItem('explanation', { required: true }),
  ];
  return packTemplate({
    id: WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID,
    name: 'Write it yourself',
    description: 'No template — name your own sections and author text, images, and videos by hand.',
    builtin: true,
    ...withArchetypes(recipe, false),
    sectionConnection: 'sequential',
    assessmentPlacement: 'end_only',
    recipe,
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'None',
      chks: 0, excpts: 0, wex: false, pass: '70%', hintsOn: false, hintN: 0, aiExtra: false,
    },
  });
}

export function getTutorialTemplate(id?: string | null): TutorialTemplate {
  if (id === WRITE_YOURSELF_TUTORIAL_TEMPLATE_ID) return writeYourselfTutorialTemplate();
  const all = listTutorialTemplates();
  return all.find((t) => t.id === id) || BUILTIN_TUTORIAL_TEMPLATES[0];
}

export function blankCustomTemplateDraft(): Omit<TutorialTemplate, 'id' | 'builtin'> {
  const recipe = [
    makeAtomicItem('section-heading', { required: true }),
    makeAtomicItem('explanation', { required: true, preferKinds: ['Definition', 'Key point'] as ContentUnitKind[] }),
    makeAtomicItem('worked-example', { required: true, preferKinds: ['Example'] }),
    makeEmbeddedItem('quiz', {
      required: true,
      sourceMode: 'generate',
      authoringNote: "test only this section's concept",
      generateMeta: {
        questionCount: 2,
        passMark: '70%',
        qtypes: ['Multiple choice', 'True/false'],
        cog: ['Recall', 'Understand'],
        diff: 'Balanced',
        wrong: 'Plausible common errors',
      },
    }),
  ];
  return {
    name: '',
    description: '',
    // Opt-in locks — new templates start fully unlocked.
    structureLocked: false,
    knobLocks: { ...ALL_KNOBS_UNLOCKED },
    archetypes: [],
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe,
    sectionBlockRecipe: toFlatSectionBlockRecipe(recipe),
    mediaSlots: deriveMediaSlots(recipe),
    knobDefaults: {
      secs: 6, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 2, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  };
}
