import type { ObjectType } from './types';

/** Learning-object types that have pedagogical templates in the library. */
export type TemplateObjectType = Exclude<ObjectType, 'course'>;

export interface ObjectTemplate {
  id: string;
  objectType: TemplateObjectType;
  name: string;
  description: string;
  builtin: boolean;
  /** Shown under “Recommended” in the library. */
  recommended?: boolean;
  /** Define-step field defaults applied when the template is used. */
  knobDefaults: Record<string, any>;
}

export const TEMPLATE_TYPE_LABELS: Record<TemplateObjectType, string> = {
  lesson: 'Lesson',
  tutorial: 'Tutorial',
  quiz: 'Quiz',
  'flashcard-set': 'Flashcard set',
  'concept-card': 'Concept card',
  summary: 'Summary',
  reflection: 'Reflection',
  scenario: 'Scenario',
  assignment: 'Assignment',
  drill: 'Drill',
  'video-script': 'Video script',
};

export const TEMPLATE_OBJECT_TYPES: TemplateObjectType[] = [
  'tutorial',
  'quiz',
  'flashcard-set',
  'concept-card',
  'lesson',
  'summary',
  'reflection',
  'assignment',
  'drill',
  'scenario',
  'video-script',
];

/** Recommended / built-in templates for non-tutorial object types. */
export const BUILTIN_OBJECT_TEMPLATES: ObjectTemplate[] = [
  // Quiz
  {
    id: 'quiz-formative',
    objectType: 'quiz',
    name: 'Formative check',
    description: 'Low-stakes practice quiz with mixed MC / T-F and explanations after each attempt.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      purpose: 'Formative check', nq: 8, pass: '70%', diff: 'Balanced',
      qtypes: ['Multiple choice', 'True/false'], cog: ['Recall', 'Understand'],
      show: 'After attempt', perq: true, adaptive: 'No',
    },
  },
  {
    id: 'quiz-readiness',
    objectType: 'quiz',
    name: 'Readiness gate',
    description: 'Higher bar before the next module — more questions, stricter pass mark.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      purpose: 'Readiness gate', nq: 12, pass: '80%', diff: 'Mostly hard',
      qtypes: ['Multiple choice', 'Scenario'], cog: ['Understand', 'Apply'],
      show: 'After completion', perq: true, adaptive: 'No',
    },
  },
  {
    id: 'quiz-diagnostic',
    objectType: 'quiz',
    name: 'Quick diagnostic',
    description: 'Short adaptive check to find gaps before teaching.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      purpose: 'Diagnostic', nq: 5, pass: '60%', diff: 'Mostly easy',
      qtypes: ['Multiple choice', 'True/false'], cog: ['Recall'],
      show: 'Immediately', perq: true, adaptive: 'Yes',
    },
  },
  // Flashcards
  {
    id: 'fc-key-terms',
    objectType: 'flashcard-set',
    name: 'Key terms → definitions',
    description: 'Classic term/definition deck pulled from glossary language in the source.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      cc: ['Key terms → definitions'],
      pull: ['Glossary / key terms in source'],
      dir: 'Front→back', nc: 12, hooks: false,
    },
  },
  {
    id: 'fc-image-label',
    objectType: 'flashcard-set',
    name: 'Image → label',
    description: 'Cards from uploaded images — vision describes the prompt side.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      cc: ['Image → label'],
      pull: ['Concepts I focus on'],
      dir: 'Front→back', nc: 8, hooks: false,
    },
  },
  {
    id: 'fc-mixed-recall',
    objectType: 'flashcard-set',
    name: 'Mixed recall',
    description: 'Terms, examples, and Q→A cards with memory hooks.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      cc: ['Key terms → definitions', 'Concept → example', 'Question → answer'],
      pull: ['Glossary / key terms in source', 'Examples & worked cases'],
      dir: 'Both', nc: 16, hooks: true,
    },
  },
  // Concept card
  {
    id: 'cc-standard-sheet',
    objectType: 'concept-card',
    name: 'Full concept sheet',
    description: 'Standard multi-category sheet — meaning, why it matters, example, mistake, teach-back.',
    builtin: true,
    recommended: true,
    knobDefaults: { len: 'Standard', voi: 'Plain & friendly', lvl: 'Basic' },
  },
  {
    id: 'cc-compact',
    objectType: 'concept-card',
    name: 'Compact concept',
    description: 'Shorter sheet focused on meaning, core idea, and one example.',
    builtin: true,
    recommended: true,
    knobDefaults: { len: 'Short', voi: 'Plain & friendly', lvl: 'Intro' },
  },
  // Lesson
  {
    id: 'lesson-explain-check',
    objectType: 'lesson',
    name: 'Explain → check',
    description: 'Two explanations, one worked example, two knowledge checks, short summary.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      how: 'Explain → check', open: 'Surprising fact', depth: 'Standard (~10)',
      expls: 2, exmps: 1, excpts: 1, chks: 2, refs: 0, summ: true, misc: true,
    },
  },
  {
    id: 'lesson-inquiry',
    objectType: 'lesson',
    name: 'Inquiry first',
    description: 'Open with a real-world question, then explain and check.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      how: 'Inquiry (question-first)', open: 'Real-world question', depth: 'Standard (~10)',
      expls: 2, exmps: 1, excpts: 0, chks: 2, refs: 1, summ: true, misc: true,
    },
  },
  // Summary
  {
    id: 'summary-keypoints',
    objectType: 'summary',
    name: 'Key points summary',
    description: 'Medium-length takeaway as a short list of key points.',
    builtin: true,
    recommended: true,
    knobDefaults: { shape: 'Key points', len: 'Medium', nkp: 5 },
  },
  {
    id: 'summary-tldr',
    objectType: 'summary',
    name: 'TL;DR + bullets',
    description: 'One-line TL;DR plus a compact bullet list.',
    builtin: true,
    recommended: true,
    knobDefaults: { shape: 'TL;DR + bullets', len: 'Short', nkp: 4 },
  },
  // Reflection
  {
    id: 'reflection-apply',
    objectType: 'reflection',
    name: 'Apply to real life',
    description: 'Two open prompts that push the learner to connect content to their world.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      goal: 'Apply to real life', style: 'Open-ended', voi: 'Encouraging',
      who: 'Private to learner', np: 2, starters: false,
    },
  },
  {
    id: 'reflection-guided',
    objectType: 'reflection',
    name: 'Guided with starters',
    description: 'Structured before/after reflection with sentence starters.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      goal: 'Metacognition', style: 'Guided with sentence starters', voi: 'Encouraging',
      who: 'Instructor-visible', np: 3, starters: true,
    },
  },
  // Assignment
  {
    id: 'assignment-short-essay',
    objectType: 'assignment',
    name: 'Short essay',
    description: 'Written short essay with citations, three requirements, three rubric criteria.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      tt: 'Short essay', del: 'Written text', el: '~300 words',
      cite: true, req: 3, rubric: 3, lvl: 'Intermediate',
    },
  },
  {
    id: 'assignment-analysis',
    objectType: 'assignment',
    name: 'Source analysis',
    description: 'Analyze source material with a clear rubric.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      tt: 'Analysis', del: 'Written text', el: '~500 words',
      cite: true, req: 4, rubric: 4, lvl: 'Intermediate',
    },
  },
  // Drill
  {
    id: 'drill-recall-ramp',
    objectType: 'drill',
    name: 'Recall ramp',
    description: 'Easy → hard recall items with immediate feedback.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      fmt: 'Recall', diff: 'Easy → hard', fb: 'Immediate',
      timed: false, rep: false, ni: 15, lvl: 'Basic',
    },
  },
  {
    id: 'drill-timed-mastery',
    objectType: 'drill',
    name: 'Timed mastery',
    description: 'Timed recognition drill that repeats until mastery.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      fmt: 'Recognition', diff: 'Flat', fb: 'Immediate',
      timed: true, rep: true, ni: 20, lvl: 'Basic',
    },
  },
  // Scenario
  {
    id: 'scenario-branching',
    objectType: 'scenario',
    name: 'Branching decisions',
    description: 'Realistic case with three decision points and debrief.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      struct: 'Branching decisions', frame: 'Realistic case',
      debrief: 'Both', dp: 3, lvl: 'Intermediate',
    },
  },
  {
    id: 'scenario-linear',
    objectType: 'scenario',
    name: 'Linear case',
    description: 'Straight-through scenario with feedback per choice.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      struct: 'Linear', frame: 'Realistic case',
      debrief: 'Feedback per choice', dp: 2, lvl: 'Basic',
    },
  },
  // Video script
  {
    id: 'video-standard-check',
    objectType: 'video-script',
    name: 'Standard checkpoints',
    description: 'Four pause-and-check questions with transcript and chat on.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      ncp: 4, showTranscript: true, enableChat: true, aud: 'High school', lvl: 'Basic',
    },
  },
  {
    id: 'video-dense-check',
    objectType: 'video-script',
    name: 'Dense checkpoints',
    description: 'More frequent checks; transcript on, chat optional.',
    builtin: true,
    recommended: true,
    knobDefaults: {
      ncp: 7, showTranscript: true, enableChat: false, aud: 'High school', lvl: 'Intermediate',
    },
  },
  {
    id: 'video-watch-focus',
    objectType: 'video-script',
    name: 'Watch-focused',
    description: 'Fewer checkpoints; keep learners in the video with chat for questions.',
    builtin: true,
    recommended: false,
    knobDefaults: {
      ncp: 2, showTranscript: false, enableChat: true, aud: 'High school', lvl: 'Basic',
    },
  },
];

const STORAGE_KEY = 'laic-object-templates';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'custom';
}

function normalizeCustom(raw: unknown): ObjectTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<ObjectTemplate>;
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;
  if (!t.objectType || !TEMPLATE_OBJECT_TYPES.includes(t.objectType as TemplateObjectType)) return null;
  if (t.objectType === 'tutorial') return null; // tutorials use tutorialTemplates.ts
  return {
    id: t.id,
    objectType: t.objectType as TemplateObjectType,
    name: t.name.trim() || 'Untitled template',
    description: typeof t.description === 'string' ? t.description : '',
    builtin: false,
    recommended: false,
    knobDefaults: t.knobDefaults && typeof t.knobDefaults === 'object' ? t.knobDefaults : {},
  };
}

export function loadCustomObjectTemplates(): ObjectTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCustom).filter(Boolean) as ObjectTemplate[];
  } catch {
    return [];
  }
}

function persistCustom(templates: ObjectTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.map((t) => ({ ...t, builtin: false }))));
}

export function isBuiltinObjectTemplateId(id: string): boolean {
  return BUILTIN_OBJECT_TEMPLATES.some((b) => b.id === id);
}

export function isObjectTemplateOverride(id: string): boolean {
  return isBuiltinObjectTemplateId(id) && loadCustomObjectTemplates().some((c) => c.id === id);
}

export function listObjectTemplates(objectType?: TemplateObjectType): ObjectTemplate[] {
  const customs = loadCustomObjectTemplates();
  const byId = new Map(customs.map((c) => [c.id, c]));
  const mergedBuiltins = BUILTIN_OBJECT_TEMPLATES.map((b) => {
    const override = byId.get(b.id);
    return override ? { ...override, builtin: false, recommended: b.recommended } : b;
  });
  const pureCustom = customs.filter((c) => !isBuiltinObjectTemplateId(c.id));
  const all = [...mergedBuiltins, ...pureCustom];
  return objectType ? all.filter((t) => t.objectType === objectType) : all;
}

export function getObjectTemplate(id?: string | null, objectType?: TemplateObjectType): ObjectTemplate | null {
  const all = listObjectTemplates(objectType);
  if (id) {
    const hit = all.find((t) => t.id === id);
    if (hit) return hit;
  }
  if (objectType) {
    return all.find((t) => t.recommended) || all[0] || null;
  }
  return all[0] || null;
}

export function saveCustomObjectTemplate(
  input: Omit<ObjectTemplate, 'id' | 'builtin' | 'recommended'> & { id?: string },
): ObjectTemplate {
  if (input.objectType === 'tutorial') {
    throw new Error('Use tutorial template APIs for tutorials.');
  }
  const customs = loadCustomObjectTemplates();
  const id = input.id?.trim() || `custom-${input.objectType}-${slugify(input.name)}-${Date.now().toString(36)}`;
  const next: ObjectTemplate = {
    id,
    objectType: input.objectType,
    name: input.name.trim() || 'Untitled template',
    description: (input.description || '').trim(),
    builtin: false,
    recommended: false,
    knobDefaults: input.knobDefaults || {},
  };
  const idx = customs.findIndex((c) => c.id === id);
  if (idx >= 0) customs[idx] = next;
  else customs.push(next);
  persistCustom(customs);
  return next;
}

export function deleteCustomObjectTemplate(id: string): void {
  persistCustom(loadCustomObjectTemplates().filter((t) => t.id !== id));
}

export function blankObjectTemplateDraft(objectType: TemplateObjectType): Omit<ObjectTemplate, 'id' | 'builtin'> {
  const sample = BUILTIN_OBJECT_TEMPLATES.find((t) => t.objectType === objectType);
  return {
    objectType,
    name: '',
    description: '',
    recommended: false,
    knobDefaults: sample ? { ...sample.knobDefaults } : {},
  };
}

/** Editable Define knobs shown in the simple template editor (per type). */
export const TEMPLATE_EDITOR_FIELDS: Record<
  Exclude<TemplateObjectType, 'tutorial'>,
  { id: string; label: string; type: 'text' | 'num' | 'bool' | 'sel'; options?: string[] }[]
> = {
  quiz: [
    { id: 'purpose', label: 'Purpose', type: 'sel', options: ['Formative check', 'Readiness gate', 'Diagnostic'] },
    { id: 'nq', label: 'Number of questions', type: 'num' },
    { id: 'pass', label: 'Pass mark', type: 'sel', options: ['50%', '60%', '70%', '80%', '90%'] },
    { id: 'diff', label: 'Difficulty mix', type: 'sel', options: ['Mostly easy', 'Balanced', 'Mostly hard', 'Ramped easy→hard'] },
    { id: 'adaptive', label: 'Adaptive', type: 'sel', options: ['Yes', 'No'] },
  ],
  'flashcard-set': [
    { id: 'nc', label: 'Number of cards', type: 'num' },
    { id: 'dir', label: 'Review direction', type: 'sel', options: ['Front→back', 'Back→front', 'Both'] },
    { id: 'hooks', label: 'Memory hooks', type: 'bool' },
  ],
  'concept-card': [
    { id: 'len', label: 'Length', type: 'sel', options: ['Short', 'Standard', 'Long'] },
    { id: 'voi', label: 'Voice', type: 'sel', options: ['Plain & friendly', 'Neutral / academic', 'Encouraging', 'Socratic'] },
    { id: 'lvl', label: 'Level', type: 'sel', options: ['Intro', 'Basic', 'Intermediate', 'Advanced'] },
  ],
  lesson: [
    { id: 'how', label: 'How it teaches', type: 'sel', options: ['Explain → check', 'Story / case-based', 'Inquiry (question-first)', 'Worked example'] },
    { id: 'depth', label: 'Depth', type: 'sel', options: ['Quick (~5 min)', 'Standard (~10)', 'Deep (~20)'] },
    { id: 'expls', label: 'Explanation sections', type: 'num' },
    { id: 'chks', label: 'Knowledge checks', type: 'num' },
  ],
  summary: [
    { id: 'shape', label: 'Shape', type: 'sel', options: ['Key points', 'TL;DR + bullets', 'Narrative'] },
    { id: 'len', label: 'Length', type: 'sel', options: ['Short', 'Medium', 'Long'] },
    { id: 'nkp', label: 'Key points', type: 'num' },
  ],
  reflection: [
    { id: 'goal', label: 'Goal', type: 'text' },
    { id: 'style', label: 'Style', type: 'sel', options: ['Open-ended', 'Guided with sentence starters', 'Before / after structured'] },
    { id: 'np', label: 'Number of prompts', type: 'num' },
    { id: 'starters', label: 'Sentence starters', type: 'bool' },
  ],
  assignment: [
    { id: 'tt', label: 'Task type', type: 'sel', options: ['Short essay', 'Analysis', 'Problem set', 'Project', 'Critique'] },
    { id: 'el', label: 'Expected length', type: 'sel', options: ['~150 words', '~300 words', '~500 words', '~800 words'] },
    { id: 'req', label: 'Requirements', type: 'num' },
    { id: 'rubric', label: 'Rubric criteria', type: 'num' },
  ],
  drill: [
    { id: 'fmt', label: 'Item format', type: 'sel', options: ['Recognition', 'Recall', 'Application'] },
    { id: 'diff', label: 'Difficulty', type: 'sel', options: ['Flat', 'Easy → hard'] },
    { id: 'ni', label: 'Number of items', type: 'num' },
    { id: 'timed', label: 'Timed', type: 'bool' },
    { id: 'rep', label: 'Repeat until mastery', type: 'bool' },
  ],
  scenario: [
    { id: 'struct', label: 'Structure', type: 'sel', options: ['Linear', 'Branching decisions'] },
    { id: 'frame', label: 'Framing', type: 'sel', options: ['Realistic case', 'Roleplay', 'Abstract'] },
    { id: 'dp', label: 'Decision points', type: 'num' },
  ],
  'video-script': [
    { id: 'ncp', label: 'Checkpoints', type: 'num' },
    { id: 'showTranscript', label: 'Transcript available', type: 'bool' },
    { id: 'enableChat', label: 'AI chatbot available', type: 'bool' },
    { id: 'lvl', label: 'Level', type: 'sel', options: ['Intro', 'Basic', 'Intermediate', 'Advanced'] },
  ],
};
