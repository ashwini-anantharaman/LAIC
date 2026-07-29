import { OBJECTS, VERSIONS } from './data';
import type {
  AssessmentPlacement,
  AtomicBlockItem,
  AtomicBlockType,
  ContentUnitKind,
  EmbeddedObjectItem,
  EmbeddedObjectSourceMode,
  EmbeddableObjectType,
  LearningObject,
  MediaSlot,
  ObjectStatus,
  ObjectType,
  RecipeItem,
  SectionBlockRecipe,
  SectionBlockRecipeItem,
  SectionConnectionRule,
  SectionRecipeBlockType,
  TutorialTemplate,
  VersionPin,
} from './types';

let recipeIdSeq = 0;
export function newRecipeItemId(prefix = 'ri'): string {
  recipeIdSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${recipeIdSeq}`;
}

export const ATOMIC_BLOCK_OPTIONS: { type: AtomicBlockType; label: string }[] = [
  { type: 'section-heading', label: 'Section heading' },
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
  { type: 'reused-from-library', label: 'Reused object from library' },
];

export const SOURCE_MODE_OPTIONS: { id: EmbeddedObjectSourceMode; label: string }[] = [
  { id: 'generate', label: 'Generate new' },
  { id: 'pick_from_library', label: 'Pick from library' },
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
  };
  if (blockType === 'media') {
    item.media = extras?.media ?? { kind: 'either', hint: 'Optional media matched to this section' };
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
  };
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

export function deriveMediaSlots(recipe: RecipeItem[]): MediaSlot[] {
  const slots: MediaSlot[] = [];
  recipe.forEach((item, i) => {
    if (item.kind !== 'atomic' || item.blockType !== 'media') return;
    const n = slots.length + 1;
    slots.push({
      id: `media-${n}`,
      kind: item.media?.kind ?? 'either',
      required: false,
      afterRecipeIndex: i,
      hint: item.media?.hint || 'Optional media matched to this section',
    });
  });
  return slots;
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

export function isContentBearing(item: RecipeItem): boolean {
  if (item.kind === 'embedded') return true;
  return item.blockType !== 'section-heading';
}

export function isKnowledgeCheckStyle(item: RecipeItem): boolean {
  if (item.kind === 'embedded' && item.objectType === 'quiz') return true;
  if (item.kind === 'atomic' && item.blockType === 'try-it') return true;
  return false;
}

export function needsLibraryPin(item: EmbeddedObjectItem): boolean {
  return (
    item.sourceMode === 'pick_from_library'
    || item.objectType === 'reused-from-library'
  );
}

/* ─── Library boundary (Activity objects → embed picker) ──────────── */

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
}

/** Map an embedded-slot type to Activity objects type filter (null = any type). */
export function embedTypeToLibraryTypes(objectType: EmbeddableObjectType): ObjectType[] | null {
  if (objectType === 'reused-from-library') return null;
  return [objectType];
}

function versionsForObject(obj: LearningObject): LibraryObjectVersionChoice[] {
  const fromStore = VERSIONS
    .filter((v) => v.objectId === obj.id)
    .map((v) => ({
      versionId: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      isLive: v.isLive,
    }))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  if (fromStore.length) return fromStore;
  // Live reference for objects without a Versions row yet (e.g. newly created).
  return [{
    versionId: `${obj.id}__v1`,
    versionNumber: 1,
    status: obj.status,
    isLive: obj.status === 'published' || obj.status === 'approved',
  }];
}

/**
 * Typed boundary for embedding / version-pinning from the Activity objects.
 * Reads the in-app library (seed catalog + optional account objects). No fabricated rows.
 * TODO: replace with GET /api/objects?reusable=true when the backend is wired.
 */
export async function listEmbeddableLibraryObjects(filter?: {
  types?: ObjectType[];
  search?: string;
  /** Account library objects from App context (createdObjects). */
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
  makeAtomicItem('media', {
    required: false,
    media: { kind: 'either', hint: 'Optional media matched to this section' },
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
  const recipe = partial.recipe;
  return {
    ...partial,
    recipe,
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
export function formatRecipeItemForPrompt(item: RecipeItem, index: number): string {
  if (item.kind === 'atomic') {
    const prefer = item.preferKinds?.length ? ` (prefer: ${item.preferKinds.join(', ')})` : '';
    const req = item.required === false ? ' [optional]' : '';
    return `${index + 1}. atomic:${item.blockType}${prefer}${req}`;
  }
  if (item.objectType === 'quiz') {
    const note = item.authoringNote
      ? ` authoringNote="${item.authoringNote.replace(/"/g, "'")}"`
      : '';
    const req = item.required ? ' required=true' : ' required=false';
    return (
      `${index + 1}. EMBEDDED_QUIZ objectType=quiz sourceMode=${item.sourceMode}${req}${note}`
      + ' → emit ONE section-quiz object for THIS section only (see part shape)'
    );
  }
  // Deferred cleanly — visible in the prompt, not a silent omission.
  return (
    `${index + 1}. EMBEDDED_${item.objectType.toUpperCase()} `
    + `[DEFERRED — not yet wired for generation; do NOT emit a part for this slot]`
  );
}

/** Built-in freeform template — course developers may edit structure knobs. */
export const FREEFORM_TUTORIAL_TEMPLATE_ID = 'author-freeform';

/** Structure / scoring knobs owned by the template when `structureLocked` is true. */
export const TEMPLATE_LOCKED_KNOB_IDS = [
  'secs', 'words', 'prog', 'dpth', 'end',
  'chks', 'excpts', 'wex',
  'pass', 'hintsOn', 'hintN', 'aiExtra',
] as const;

export function isTutorialStructureLocked(template: TutorialTemplate): boolean {
  // Freeform builtin is always editable for authors, even if a local override
  // tried to lock it.
  if (template.id === FREEFORM_TUTORIAL_TEMPLATE_ID) return false;
  return template.structureLocked !== false;
}

/** Built-in pedagogical templates. Custom templates use the same shape. */
export const BUILTIN_TUTORIAL_TEMPLATES: TutorialTemplate[] = [
  packTemplate({
    id: 'concept-example-practice',
    name: 'Concept, Example, Practice',
    description:
      "Each section explains one concept, shows a worked example, optionally attaches matched media, then embeds a real Quiz object to check understanding.",
    builtin: true,
    structureLocked: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: CEP_RECIPE,
    knobDefaults: {
      secs: 6, words: 4200, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 2, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'guided-walkthrough',
    name: 'Guided Walkthrough',
    description: 'Step-by-step how-to: instruction, optional excerpt, then a try-it checkpoint.',
    builtin: true,
    structureLocked: true,
    sectionConnection: 'prerequisite_chain',
    assessmentPlacement: 'checkpoints_after_each',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('instruction', { required: true, preferKinds: ['Procedure', 'Key point'] }),
      makeAtomicItem('source-excerpt', { preferKinds: ['Quote', 'Procedure'] }),
      makeAtomicItem('media', {
        required: false,
        media: { kind: 'video', hint: 'How-to clip for this step' },
      }),
      makeAtomicItem('try-it', { required: true, preferKinds: ['Fact', 'Procedure'] }),
    ],
    knobDefaults: {
      secs: 5, words: 3000, prog: 'Prerequisite chain', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'worked-example-first',
    name: 'Worked Example First',
    description: 'Open with a full source example, then name the principle, then check with an embedded Quiz.',
    builtin: true,
    structureLocked: true,
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
      secs: 3, words: 2700, prog: 'Themed clusters', dpth: 'In-depth', end: 'Recap only',
      chks: 1, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'explain-misconception-correct',
    name: 'Explain, Misconception, Correct',
    description: 'Explain an idea, surface a common mistake, correct it, then probe with an embedded Quiz.',
    builtin: true,
    structureLocked: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('explanation', { required: true, preferKinds: ['Definition', 'Key point'] }),
      makeAtomicItem('misconception', { required: true, preferKinds: ['Key point', 'Fact'] }),
      makeAtomicItem('correction', { required: true, preferKinds: ['Definition', 'Fact'] }),
      makeEmbeddedItem('quiz', {
        required: true,
        sourceMode: 'generate',
        authoringNote: 'probe the misconception trap for this section',
      }),
    ],
    knobDefaults: {
      secs: 3, words: 2100, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 0, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'scenario-driven',
    name: 'Scenario Driven',
    description: 'One running case threads every section; cumulative assessment at the end.',
    builtin: true,
    structureLocked: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'end_only',
    recipe: [
      makeAtomicItem('section-heading', { required: true }),
      makeAtomicItem('scenario-advance', {
        required: true,
        preferKinds: ['Example', 'Procedure', 'Key point'],
      }),
      makeAtomicItem('explanation', { preferKinds: ['Definition', 'Key point'] }),
      makeAtomicItem('media', {
        required: false,
        media: { kind: 'either', hint: 'Visual for the running scenario' },
      }),
    ],
    knobDefaults: {
      secs: 4, words: 2800, prog: 'Linear build-up', dpth: 'Standard', end: 'End quiz',
      chks: 0, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
  packTemplate({
    id: 'reference-cheatsheet',
    name: 'Reference / Cheat Sheet',
    description: 'Dense, example-light review sections; minimal or no checks.',
    builtin: true,
    structureLocked: true,
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
      secs: 4, words: 1600, prog: 'Themed clusters', dpth: 'Overview', end: 'None',
      chks: 0, excpts: 2, wex: false, pass: '70%', hintsOn: false, hintN: 0, aiExtra: false,
    },
  }),
  packTemplate({
    id: FREEFORM_TUTORIAL_TEMPLATE_ID,
    name: 'Freeform',
    description:
      'Course developers choose section count, word target, progression, and related structure themselves.',
    builtin: true,
    structureLocked: false,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe: CEP_RECIPE,
    knobDefaults: {
      secs: 3, words: 0, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  }),
];

export const DEFAULT_TUTORIAL_TEMPLATE_ID = 'concept-example-practice';

const STORAGE_KEY = 'laic-tutorial-templates';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'custom';
}

function defaultKnobDefaults(): TutorialTemplate['knobDefaults'] {
  return {
    secs: 3, words: 0, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
    chks: 1, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
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
  return packTemplate({
    id: t.id,
    name: t.name.trim() || 'Untitled template',
    description: typeof t.description === 'string' ? t.description : '',
    builtin: false,
    // Customs default locked; freeform id always stays unlocked for authors.
    structureLocked: isFreeform ? false : t.structureLocked !== false,
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
      words: typeof t.knobDefaults?.words === 'number' && t.knobDefaults.words >= 0
        ? t.knobDefaults.words
        : 0,
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
    return parsed.map(normalizeCustom).filter(Boolean) as TutorialTemplate[];
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

  const packed = packTemplate({
    ...input,
    id,
    builtin: false,
    name: input.name.trim() || 'Untitled template',
    description: (input.description || '').trim(),
    structureLocked: id === FREEFORM_TUTORIAL_TEMPLATE_ID
      ? false
      : input.structureLocked !== false,
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
    // Freeform must remain author-editable even if a local override exists.
    if (b.id === FREEFORM_TUTORIAL_TEMPLATE_ID) {
      return { ...override, builtin: false, structureLocked: false };
    }
    return { ...override, builtin: false };
  });
  const pureCustom = customs.filter((c) => !isBuiltinTemplateId(c.id));
  return [...mergedBuiltins, ...pureCustom];
}

export function getTutorialTemplate(id?: string | null): TutorialTemplate {
  const all = listTutorialTemplates();
  return all.find((t) => t.id === id) || BUILTIN_TUTORIAL_TEMPLATES[0];
}

export function blankCustomTemplateDraft(): Omit<TutorialTemplate, 'id' | 'builtin'> {
  const recipe = [
    makeAtomicItem('section-heading', { required: true }),
    makeAtomicItem('explanation', { required: true, preferKinds: ['Definition', 'Key point'] as ContentUnitKind[] }),
    makeAtomicItem('worked-example', { required: true, preferKinds: ['Example'] }),
    makeAtomicItem('media', {
      required: false,
      media: { kind: 'either', hint: 'Optional media matched to this section' },
    }),
    makeEmbeddedItem('quiz', {
      required: true,
      sourceMode: 'generate',
      authoringNote: "test only this section's concept",
    }),
  ];
  return {
    name: '',
    description: '',
    structureLocked: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    recipe,
    sectionBlockRecipe: toFlatSectionBlockRecipe(recipe),
    mediaSlots: deriveMediaSlots(recipe),
    knobDefaults: {
      secs: 6, words: 4200, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 2, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  };
}
