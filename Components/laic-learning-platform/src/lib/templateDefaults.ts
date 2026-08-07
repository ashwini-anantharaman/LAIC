/**
 * Per–object-type default template (Template Library).
 * Used when creating an object without an explicit “Use template” choice.
 */
import type { TemplateObjectType } from './objectTemplates';
import { listObjectTemplates } from './objectTemplates';
import { DEFAULT_TUTORIAL_TEMPLATE_ID, listTutorialTemplates } from './tutorialTemplates';
import {
  DEFAULT_TUTORIAL_TEMPLATE_ID as DEFAULT_TUTORIAL_V2_TEMPLATE_ID,
  listTutorialTemplates as listTutorialV2Templates,
} from './tutorialV2/tutorialTemplates';

const STORAGE_KEY = 'laic-default-template-ids';

/** Built-in fallbacks when nothing is stored yet. */
const FALLBACKS: Partial<Record<TemplateObjectType, string>> = {
  tutorial: DEFAULT_TUTORIAL_TEMPLATE_ID,
  'tutorial-v2': DEFAULT_TUTORIAL_V2_TEMPLATE_ID,
  quiz: 'quiz-formative',
  'flashcard-set': 'fc-key-terms',
  'concept-card': 'cc-standard-sheet',
  lesson: 'lesson-explain-check',
  summary: 'summary-keypoints',
  reflection: 'reflection-apply',
  assignment: 'assignment-short-essay',
  drill: 'drill-recall-ramp',
  scenario: 'scenario-branching',
  'video-script': 'video-standard-check',
};

function readStore(): Partial<Record<TemplateObjectType, string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(next: Partial<Record<TemplateObjectType, string>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function resolveFallback(objectType: TemplateObjectType): string {
  if (objectType === 'tutorial') {
    const all = listTutorialTemplates();
    const preferred = FALLBACKS.tutorial;
    if (preferred && all.some((t) => t.id === preferred)) return preferred;
    return all[0]?.id || DEFAULT_TUTORIAL_TEMPLATE_ID;
  }
  if (objectType === 'tutorial-v2') {
    const all = listTutorialV2Templates();
    const preferred = FALLBACKS['tutorial-v2'];
    if (preferred && all.some((t) => t.id === preferred)) return preferred;
    return all[0]?.id || DEFAULT_TUTORIAL_V2_TEMPLATE_ID;
  }
  const all = listObjectTemplates(objectType);
  const preferred = FALLBACKS[objectType];
  if (preferred && all.some((t) => t.id === preferred)) return preferred;
  const recommended = all.find((t) => t.recommended);
  return recommended?.id || all[0]?.id || preferred || '';
}

/** Current default template id for an object type (always resolves to a known id when possible). */
export function getDefaultTemplateId(objectType: TemplateObjectType): string {
  const stored = readStore()[objectType];
  if (stored) {
    if (objectType === 'tutorial') {
      if (listTutorialTemplates().some((t) => t.id === stored)) return stored;
    } else if (objectType === 'tutorial-v2') {
      if (listTutorialV2Templates().some((t) => t.id === stored)) return stored;
    } else if (listObjectTemplates(objectType).some((t) => t.id === stored)) {
      return stored;
    }
  }
  return resolveFallback(objectType);
}

export function setDefaultTemplateId(objectType: TemplateObjectType, templateId: string): void {
  if (!templateId?.trim()) return;
  const next = { ...readStore(), [objectType]: templateId.trim() };
  writeStore(next);
}

export function isDefaultTemplate(objectType: TemplateObjectType, templateId: string): boolean {
  return getDefaultTemplateId(objectType) === templateId;
}
