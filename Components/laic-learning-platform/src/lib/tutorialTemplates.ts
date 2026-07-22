import type {
  AssessmentPlacement,
  SectionBlockRecipeItem,
  SectionConnectionRule,
  SectionRecipeBlockType,
  TutorialTemplate,
} from './types';

/** Built-in pedagogical templates. Custom templates use the same shape. */
export const BUILTIN_TUTORIAL_TEMPLATES: TutorialTemplate[] = [
  {
    id: 'concept-example-practice',
    name: 'Concept, Example, Practice',
    description: 'Each section teaches one concept, shows a source example, then checks understanding.',
    builtin: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'explanation', preferKinds: ['Definition', 'Key point'], required: true },
      { type: 'worked-example', preferKinds: ['Example'], required: true },
      { type: 'media' },
      { type: 'knowledge-check', preferKinds: ['Fact', 'Definition', 'Key point'], required: true },
    ],
    mediaSlots: [
      { id: 'worked-diagram', kind: 'image', afterRecipeIndex: 2, hint: 'Diagram for the worked example' },
    ],
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  },
  {
    id: 'guided-walkthrough',
    name: 'Guided Walkthrough',
    description: 'Step-by-step how-to: instruction, optional excerpt, then a try-it checkpoint.',
    builtin: true,
    sectionConnection: 'prerequisite_chain',
    assessmentPlacement: 'checkpoints_after_each',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'instruction', preferKinds: ['Procedure', 'Key point'], required: true },
      { type: 'source-excerpt', preferKinds: ['Quote', 'Procedure'] },
      { type: 'media' },
      { type: 'try-it', preferKinds: ['Fact', 'Procedure'], required: true },
    ],
    mediaSlots: [
      { id: 'demo-clip', kind: 'video', afterRecipeIndex: 1, hint: 'How-to clip for this step' },
    ],
    knobDefaults: {
      secs: 5, prog: 'Prerequisite chain', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 1, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  },
  {
    id: 'worked-example-first',
    name: 'Worked Example First',
    description: 'Open with a full source example, then name the principle, then check.',
    builtin: true,
    sectionConnection: 'standalone',
    assessmentPlacement: 'after_each_section',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'worked-example', preferKinds: ['Example'], required: true },
      { type: 'principle', preferKinds: ['Definition', 'Key point'], required: true },
      { type: 'knowledge-check', preferKinds: ['Fact', 'Key point'], required: true },
    ],
    mediaSlots: [
      { id: 'example-visual', kind: 'either', afterRecipeIndex: 1, hint: 'Visual for the worked example' },
    ],
    knobDefaults: {
      secs: 3, prog: 'Themed clusters', dpth: 'In-depth', end: 'Recap only',
      chks: 1, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  },
  {
    id: 'explain-misconception-correct',
    name: 'Explain, Misconception, Correct',
    description: 'Explain an idea, surface a common mistake, correct it, then probe the trap.',
    builtin: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'explanation', preferKinds: ['Definition', 'Key point'], required: true },
      { type: 'misconception', preferKinds: ['Key point', 'Fact'], required: true },
      { type: 'correction', preferKinds: ['Definition', 'Fact'], required: true },
      { type: 'knowledge-check', preferKinds: ['Fact', 'Definition'], required: true },
    ],
    mediaSlots: [],
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 0, wex: false, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  },
  {
    id: 'scenario-driven',
    name: 'Scenario Driven',
    description: 'One running case threads every section; cumulative assessment at the end.',
    builtin: true,
    sectionConnection: 'sequential',
    assessmentPlacement: 'end_only',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'scenario-advance', preferKinds: ['Example', 'Procedure', 'Key point'], required: true },
      { type: 'explanation', preferKinds: ['Definition', 'Key point'] },
      { type: 'media' },
    ],
    mediaSlots: [
      { id: 'scenario-visual', kind: 'either', afterRecipeIndex: 1, hint: 'Visual for the running scenario' },
    ],
    knobDefaults: {
      secs: 4, prog: 'Linear build-up', dpth: 'Standard', end: 'End quiz',
      chks: 0, excpts: 1, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  },
  {
    id: 'reference-cheatsheet',
    name: 'Reference / Cheat Sheet',
    description: 'Dense, example-light review sections; minimal or no checks.',
    builtin: true,
    sectionConnection: 'standalone',
    assessmentPlacement: 'end_only',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'explanation', preferKinds: ['Fact', 'Definition', 'Key point'], required: true },
      { type: 'source-excerpt', preferKinds: ['Quote', 'Fact'] },
    ],
    mediaSlots: [
      { id: 'reference-table', kind: 'image', afterRecipeIndex: 1, hint: 'Table or score guide image' },
    ],
    knobDefaults: {
      secs: 4, prog: 'Themed clusters', dpth: 'Overview', end: 'None',
      chks: 0, excpts: 2, wex: false, pass: '70%', hintsOn: false, hintN: 0, aiExtra: false,
    },
  },
];

export const DEFAULT_TUTORIAL_TEMPLATE_ID = 'concept-example-practice';

const STORAGE_KEY = 'laic-tutorial-templates';

export const RECIPE_BLOCK_OPTIONS: { type: SectionRecipeBlockType; label: string }[] = [
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
  { type: 'knowledge-check', label: 'Knowledge check' },
  { type: 'media', label: 'Media slot' },
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'custom';
}

function isRecipeItem(x: unknown): x is SectionBlockRecipeItem {
  if (!x || typeof x !== 'object') return false;
  const t = (x as SectionBlockRecipeItem).type;
  return RECIPE_BLOCK_OPTIONS.some((o) => o.type === t);
}

function normalizeCustom(raw: unknown): TutorialTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<TutorialTemplate>;
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;
  const recipe = Array.isArray(t.sectionBlockRecipe)
    ? t.sectionBlockRecipe.filter(isRecipeItem)
    : [];
  if (!recipe.length) return null;
  return {
    id: t.id,
    name: t.name.trim() || 'Untitled template',
    description: typeof t.description === 'string' ? t.description : '',
    builtin: false,
    sectionConnection: (CONNECTION_OPTIONS.some((o) => o.id === t.sectionConnection)
      ? t.sectionConnection
      : 'sequential') as SectionConnectionRule,
    assessmentPlacement: (ASSESSMENT_OPTIONS.some((o) => o.id === t.assessmentPlacement)
      ? t.assessmentPlacement
      : 'after_each_section') as AssessmentPlacement,
    sectionBlockRecipe: recipe,
    mediaSlots: Array.isArray(t.mediaSlots) ? t.mediaSlots : [],
    knobDefaults: {
      secs: typeof t.knobDefaults?.secs === 'number' ? t.knobDefaults.secs : 3,
      prog: t.knobDefaults?.prog || 'Linear build-up',
      dpth: t.knobDefaults?.dpth || 'Standard',
      end: t.knobDefaults?.end || 'Recap only',
      chks: typeof t.knobDefaults?.chks === 'number' ? t.knobDefaults.chks : 1,
      excpts: typeof t.knobDefaults?.excpts === 'number' ? t.knobDefaults.excpts : 0,
      wex: t.knobDefaults?.wex !== false,
      pass: t.knobDefaults?.pass || '70%',
      hintsOn: t.knobDefaults?.hintsOn !== false,
      hintN: typeof t.knobDefaults?.hintN === 'number' ? t.knobDefaults.hintN : 4,
      aiExtra: t.knobDefaults?.aiExtra === true,
    },
  };
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
  const next: TutorialTemplate = {
    ...input,
    id,
    builtin: false,
    name: input.name.trim() || 'Untitled template',
    description: (input.description || '').trim(),
    sectionBlockRecipe: input.sectionBlockRecipe.length
      ? input.sectionBlockRecipe
      : [{ type: 'section-heading', required: true }, { type: 'explanation', required: true }],
    mediaSlots: input.mediaSlots || [],
    knobDefaults: input.knobDefaults || { secs: 3 },
  };
  const idx = customs.findIndex((c) => c.id === id);
  if (idx >= 0) customs[idx] = next;
  else customs.push(next);
  persistCustom(customs);
  return next;
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
    return override ? { ...override, builtin: false } : b;
  });
  const pureCustom = customs.filter((c) => !isBuiltinTemplateId(c.id));
  return [...mergedBuiltins, ...pureCustom];
}

export function getTutorialTemplate(id?: string | null): TutorialTemplate {
  const all = listTutorialTemplates();
  return all.find((t) => t.id === id) || BUILTIN_TUTORIAL_TEMPLATES[0];
}

export function blankCustomTemplateDraft(): Omit<TutorialTemplate, 'id' | 'builtin'> {
  return {
    name: '',
    description: '',
    sectionConnection: 'sequential',
    assessmentPlacement: 'after_each_section',
    sectionBlockRecipe: [
      { type: 'section-heading', required: true },
      { type: 'explanation', required: true },
      { type: 'worked-example', required: true },
      { type: 'knowledge-check', required: true },
    ],
    mediaSlots: [],
    knobDefaults: {
      secs: 3, prog: 'Linear build-up', dpth: 'Standard', end: 'Recap only',
      chks: 1, excpts: 0, wex: true, pass: '70%', hintsOn: true, hintN: 4, aiExtra: false,
    },
  };
}
