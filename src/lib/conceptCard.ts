import type { ConceptCardContent } from './types';

export type ConceptCategoryTone = 'green' | 'yellow' | 'blue' | 'pink' | 'purple' | 'orange' | 'red';

export interface ConceptCategoryDef {
  id: string;
  /** Display title on the sheet header. */
  label: string;
  /** Whether this category is included on the generated sheet. */
  enabled: boolean;
  /** Built-in template section vs author-added. */
  builtin: boolean;
  tone?: ConceptCategoryTone;
}

/** Default pedagogical categories — order matches the reference sheet. */
export const DEFAULT_CONCEPT_CATEGORIES: ConceptCategoryDef[] = [
  { id: 'meaning', label: 'One-sentence meaning', enabled: true, builtin: true, tone: 'green' },
  { id: 'why', label: 'Why it matters', enabled: true, builtin: true, tone: 'yellow' },
  { id: 'core', label: 'Core idea', enabled: true, builtin: true, tone: 'blue' },
  { id: 'components', label: 'Key components', enabled: true, builtin: true, tone: 'pink' },
  { id: 'example', label: 'Example', enabled: true, builtin: true, tone: 'green' },
  { id: 'nonExample', label: 'Non-example', enabled: true, builtin: true, tone: 'red' },
  { id: 'visual', label: 'Visual or formula', enabled: true, builtin: true, tone: 'purple' },
  { id: 'mistake', label: 'Common mistake', enabled: true, builtin: true, tone: 'blue' },
  { id: 'connection', label: 'Connection', enabled: true, builtin: true, tone: 'orange' },
  { id: 'recall', label: 'Recall question', enabled: true, builtin: true, tone: 'green' },
  { id: 'teachBack', label: 'Teach-back (explain in 30 seconds)', enabled: true, builtin: true, tone: 'purple' },
];

const BUILTIN_IDS = new Set(DEFAULT_CONCEPT_CATEGORIES.map((c) => c.id));

export function isBuiltinCategoryId(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

export function slugCategoryId(label: string): string {
  const base = String(label || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'section';
  return `custom-${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Resolve fv.categories (or fall back to defaults). */
export function resolveConceptCategories(raw: unknown): ConceptCategoryDef[] {
  if (!Array.isArray(raw) || !raw.length) {
    return DEFAULT_CONCEPT_CATEGORIES.map((c) => ({ ...c }));
  }
  const out: ConceptCategoryDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as any).id || '').trim();
    const label = String((item as any).label || '').trim();
    if (!id || !label) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const builtin = BUILTIN_IDS.has(id);
    const def = DEFAULT_CONCEPT_CATEGORIES.find((c) => c.id === id);
    out.push({
      id,
      label,
      enabled: (item as any).enabled !== false,
      builtin,
      tone: (item as any).tone || def?.tone || 'blue',
    });
  }
  // Ensure any missing builtins still appear (disabled) so authors can re-enable them
  for (const def of DEFAULT_CONCEPT_CATEGORIES) {
    if (seen.has(def.id)) continue;
    out.push({ ...def, enabled: false });
  }
  return out;
}

export function enabledCategoryIds(cats: ConceptCategoryDef[]): string[] {
  return cats.filter((c) => c.enabled).map((c) => c.id);
}

/** Normalize any generated / legacy concept card into the template shape. */
export function normalizeConceptCardContent(
  raw: Partial<ConceptCardContent> & Record<string, any> | null | undefined,
): ConceptCardContent {
  const c = raw || {};
  const term = String(c.term || c.concept || '').trim();
  const meaning = String(c.oneSentenceMeaning || c.definition || c.plain || '').trim();
  const components = Array.isArray(c.keyComponents)
    ? c.keyComponents.map((x: any) => String(x || '').trim()).filter(Boolean)
    : typeof c.keyComponents === 'string'
      ? String(c.keyComponents).split(/\n|•|;/).map((s) => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
      : [];

  const categories = resolveConceptCategories(c.categories);
  const extraSections = Array.isArray(c.extraSections)
    ? c.extraSections
      .map((s: any) => ({
        id: String(s?.id || '').trim(),
        title: String(s?.title || s?.label || '').trim(),
        body: String(s?.body || s?.text || '').trim(),
      }))
      .filter((s: { id: string; title: string }) => s.id && s.title)
    : [];

  return {
    term,
    oneSentenceMeaning: meaning,
    whyItMatters: String(c.whyItMatters || c.analogy || '').trim(),
    coreIdea: String(c.coreIdea || c.definition || meaning).trim(),
    keyComponents: components,
    example: String(c.example || '').trim(),
    nonExample: String(c.nonExample || '').trim(),
    visualOrFormula: String(c.visualOrFormula || c.visualSuggestion || '').trim(),
    visualChoice: String(c.visualChoice || '').trim() || undefined,
    visualAlternative: String(c.visualAlternative || '').trim() || undefined,
    visualFormula: String(c.visualFormula || '').trim() || undefined,
    commonMistake: String(c.commonMistake || c.misconception || '').trim(),
    connection: String(c.connection || '').trim(),
    recallQuestion: String(c.recallQuestion || '').trim(),
    teachBack: String(c.teachBack || '').trim(),
    categories,
    extraSections,
    definition: meaning,
    analogy: String(c.whyItMatters || c.analogy || '').trim() || undefined,
    visualSuggestion: String(c.visualOrFormula || c.visualSuggestion || '').trim() || undefined,
    misconception: String(c.commonMistake || c.misconception || '').trim() || undefined,
    voice: c.voice ? String(c.voice) : undefined,
    length: c.length ? String(c.length) : undefined,
    citations: c.citations && typeof c.citations === 'object' ? c.citations : undefined,
  };
}

export function conceptCardIsComplete(c: ConceptCardContent): boolean {
  return !!(c.term && (c.oneSentenceMeaning || c.definition) && c.coreIdea);
}

/** Map category id → body text for the sheet / editor. */
export function categoryBody(c: ConceptCardContent, id: string): string {
  switch (id) {
    case 'meaning': return c.oneSentenceMeaning || c.definition || '';
    case 'why': return c.whyItMatters || '';
    case 'core': return c.coreIdea || '';
    case 'components': return (c.keyComponents || []).join('\n');
    case 'example': return c.example || '';
    case 'nonExample': return c.nonExample || '';
    case 'visual': return c.visualFormula || c.visualOrFormula || '';
    case 'mistake': return c.commonMistake || '';
    case 'connection': return c.connection || '';
    case 'recall': return c.recallQuestion || '';
    case 'teachBack': return c.teachBack || '';
    default: {
      const extra = (c.extraSections || []).find((s) => s.id === id);
      return extra?.body || '';
    }
  }
}
