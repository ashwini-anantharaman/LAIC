/**
 * Section state machine + skeleton helpers for Tutorial V2 Approach-2.
 */
import type { TutorialTemplate, RecipeItem, LearningObject, Block, CreatorPipelineDraft } from '../types';
import type { GeneratedPart } from '../api';
import {
  cloneRecipeItems,
  filterRecipeByCondition,
  resolveSectionRecipe,
  templateHasSectionBlock,
} from './tutorialTemplates';
import { filterRecipeEmbedsForSection, newSectionId } from './tutorialDefinition';
import type {
  SectionAuthorMode,
  SectionStatus,
  TutorialV2Draft,
  TutorialV2Part,
  TutorialV2Structure,
  V2Section,
  V2SourceRef,
  V2TopLevelSlot,
} from './types';
import type {
  DefinedSection,
  EmbeddedObjectItem,
  EmbeddableObjectType,
  TutorialDefinition,
  TutorialTemplate,
} from '../types';
import { embedTypeLabel } from './recipeStructure';

/** True when a part has real authored/generated content (not an empty scaffold). */
export function partHasContent(p: TutorialV2Part | Record<string, unknown> | null | undefined): boolean {
  if (!p || typeof p !== 'object') return false;
  const any = p as Record<string, any>;
  const t = String(any.type || '');
  if (typeof any.body === 'string' && any.body.trim()) return true;
  if (t === 'image' || any.mediaKind === 'image') return !!(any.url && String(any.url).trim());
  if (t === 'video' || any.mediaKind === 'video') {
    return !!(any.videoId && String(any.videoId).trim()) || !!(any.url && String(any.url).trim());
  }
  if (Array.isArray(any.questions) && any.questions.length) return true;
  if (Array.isArray(any.cards) && any.cards.length) return true;
  if (any.conceptCard || any.libraryObjectId || any.objectId || any.embedObjectId) return true;
  if (typeof any.prompt === 'string' && any.prompt.trim()) return true;
  if (typeof any.front === 'string' && any.front.trim()) return true;
  return false;
}

export function sectionHasContent(sec: V2Section): boolean {
  return (sec.parts || []).some((p) => partHasContent(p));
}

/** Section is ready for Review — explicit done checkbox or real content. */
export function sectionSatisfied(sec: V2Section): boolean {
  return !!sec.done || sectionHasContent(sec);
}

export function slotSatisfied(slot: {
  done?: boolean;
  parts?: TutorialV2Part[] | null;
  part?: TutorialV2Part | null;
}): boolean {
  if (slot.done) return true;
  if ((slot.parts || []).some((p) => partHasContent(p))) return true;
  return partHasContent(slot.part || null);
}

export function deriveSectionStatus(sec: V2Section): SectionStatus {
  if (sectionSatisfied(sec)) return 'done';
  const hasAuthored =
    (sec.parts && sec.parts.length > 0)
    || (sec.pickedSourceIds && sec.pickedSourceIds.length > 0)
    || (sec.highlights && sec.highlights.length > 0)
    || (sec.units && sec.units.length > 0);
  return hasAuthored ? 'in_progress' : 'not_started';
}

export function requiredSectionsRemaining(sections: V2Section[]): number {
  return (sections || []).filter((s) => s.required && !sectionSatisfied(s)).length;
}

export function allRequiredDone(
  sections: V2Section[],
  topLevelSlots?: { required: boolean; done: boolean; parts?: TutorialV2Part[] | null; part?: TutorialV2Part | null }[],
): boolean {
  const slots = topLevelSlots || [];
  const requiredSlots = slots.filter((s) => s.required);
  const slotsOk = requiredSlots.every((s) => slotSatisfied(s));
  const required = (sections || []).filter((s) => s.required);
  if (!required.length && !(sections || []).length) {
    return slotsOk && (slots.length === 0 || slots.every((s) => !s.required || slotSatisfied(s)));
  }
  if (!required.length) {
    return slotsOk && ((sections || []).every((s) => sectionSatisfied(s)) || (sections || []).length === 0);
  }
  return slotsOk && required.every((s) => sectionSatisfied(s));
}

export function doneCount(sections: V2Section[]): { done: number; total: number } {
  const list = sections || [];
  return { done: list.filter((s) => sectionSatisfied(s)).length, total: list.length };
}

export function structureFromTemplate(template: TutorialTemplate): TutorialV2Structure {
  const k = template.knobDefaults || {};
  return {
    connection: template.sectionConnection || 'sequential',
    assessment: template.assessmentPlacement || 'after_each_section',
    depth: String(k.dpth || 'Standard'),
    endWith: String(k.end || 'Recap only'),
    sectionsCount: Math.max(1, Math.min(20, Number(k.secs) || 3)),
    checksPerSection: Math.max(0, Number(k.chks) || 0),
    progression: String(k.prog || 'Linear build-up'),
    pass: k.pass,
    hintsOn: k.hintsOn,
    hintN: k.hintN,
  };
}

/** Empty scaffold parts from recipe atomics (for write-yourself path). */
export function scaffoldPartsFromRecipe(recipe: RecipeItem[], sectionTitle: string): TutorialV2Part[] {
  const parts: TutorialV2Part[] = [];
  let qi = 0;
  for (const item of recipe || []) {
    if (item.kind === 'atomic') {
      const blockType = item.blockType || 'explanation';
      if (blockType === 'section-heading') {
        parts.push({
          id: `p-${item.id}`,
          type: 'rich-text',
          label: 'Section',
          heading: sectionTitle,
          body: '',
        });
      } else if (blockType === 'media') {
        const kind = item.media?.kind || 'either';
        const hint = item.media?.hint || item.authoringNote || '';
        const label = kind === 'image'
          ? 'Media · image'
          : kind === 'video'
            ? 'Media · YouTube'
            : 'Media slot';
        if (kind === 'image') {
          parts.push({
            id: `p-${item.id}`,
            type: 'image',
            label,
            url: '',
            caption: '',
            mediaKind: 'image',
            mediaHint: hint,
          });
        } else if (kind === 'video') {
          parts.push({
            id: `p-${item.id}`,
            type: 'video',
            label,
            url: '',
            videoId: '',
            caption: '',
            mediaKind: 'video',
            mediaHint: hint,
          });
        } else {
          parts.push({
            id: `p-${item.id}`,
            type: 'media',
            label,
            url: '',
            caption: '',
            mediaKind: 'either',
            mediaHint: hint,
          });
        }
      } else {
        parts.push({
          id: `p-${item.id}`,
          type: 'rich-text',
          label: String(blockType).replace(/-/g, ' '),
          heading: blockType === 'explanation' ? '' : undefined,
          body: '',
        });
      }
    } else if (item.kind === 'embedded') {
      if (item.objectType === 'quiz') {
        qi += 1;
        parts.push({
          id: `p-${item.id}`,
          type: 'section-quiz',
          label: `Section quiz ${qi}`,
          sourceMode: item.sourceMode || 'generate',
          authoringNote: item.authoringNote,
          required: item.required !== false,
          questions: [],
        });
      } else {
        parts.push({
          id: `p-${item.id}`,
          type: 'rich-text',
          label: `Embed · ${item.objectType}`,
          body: `(${item.objectType} — generate or pick from library)`,
        });
      }
    }
  }
  if (!parts.length) {
    parts.push({
      id: `p-empty-${Date.now().toString(36)}`,
      type: 'rich-text',
      label: 'Content',
      heading: sectionTitle,
      body: '',
    });
  }
  return parts;
}

export function seedV2SectionsFromTemplate(
  template: TutorialTemplate,
  titles?: { title: string; intent?: string; required?: boolean }[],
): V2Section[] {
  const base = template.name.includes('Concept') ? 'Concept' : 'Section';
  const n = templateHasSectionBlock(template)
    ? Math.max(1, Math.min(20, Number(template.knobDefaults?.secs) || 3))
    : 1;
  const outline = titles && titles.length
    ? titles
    : Array.from({ length: n }, (_, i) => ({
        title: `${base} ${i + 1}`,
        intent: '',
        required: true,
      }));

  return outline.map((row) => {
    const id = newSectionId();
    const recipe = cloneRecipeItems(resolveSectionRecipe(template), true);
    return {
      id,
      title: row.title,
      intent: row.intent || '',
      recipe,
      parts: [],
      pickedSourceIds: [],
      highlights: [],
      units: undefined,
      authorMode: 'empty' as SectionAuthorMode,
      done: false,
      required: row.required !== false,
    };
  });
}

/**
 * Build V2 section skeleton from a V1-style TutorialDefinition + template
 * (same recipe resolution / embed tagging as ObjectCreator Plan → generate).
 */
export function seedV2SectionsFromDefinition(
  template: TutorialTemplate,
  def: TutorialDefinition,
): V2Section[] {
  const named = (def.sections || []).filter((s) => String(s.title || '').trim());
  const sections = named.length ? named : seedSectionsAsDefined(template);
  return sections.map((sec) => {
    const resolved = resolveSectionRecipe(template, sec.archetypeId);
    const recipeForSection = filterRecipeEmbedsForSection(
      filterRecipeByCondition(resolved, []),
      sec,
    );
    return {
      id: sec.id || newSectionId(),
      title: String(sec.title || '').trim() || 'Section',
      intent: String(sec.intent || '').trim(),
      recipe: cloneRecipeItems(recipeForSection.length ? recipeForSection : template.recipe || [], true),
      parts: [],
      pickedSourceIds: [],
      highlights: [],
      units: undefined,
      authorMode: 'empty' as SectionAuthorMode,
      done: false,
      required: true,
    };
  });
}

function seedSectionsAsDefined(template: TutorialTemplate): DefinedSection[] {
  const base = template.name.includes('Concept') ? 'Concept' : 'Section';
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

export function emptyTutorialV2Draft(partial: {
  id?: string;
  title?: string;
  templateId: string;
  structure: TutorialV2Structure;
  phase?: TutorialV2Draft['phase'];
  metadata?: TutorialV2Draft['metadata'];
}): TutorialV2Draft {
  const now = Date.now();
  return {
    id: partial.id || `tv2-${now.toString(36)}`,
    type: 'tutorial-v2',
    title: partial.title || '',
    metadata: partial.metadata || {},
    templateId: partial.templateId,
    structure: partial.structure,
    sections: [],
    topLevelSlots: [],
    sourcePool: [],
    status: 'draft',
    // New creates land on Plan (path choice happens in the Create modal).
    phase: partial.phase || 'start',
    activeSectionId: null,
    activeSlotId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchDraft(draft: TutorialV2Draft, patch: Partial<TutorialV2Draft>): TutorialV2Draft {
  return { ...draft, ...patch, updatedAt: Date.now() };
}

export function updateSection(
  draft: TutorialV2Draft,
  sectionId: string,
  patch: Partial<V2Section>,
): TutorialV2Draft {
  return touchDraft(draft, {
    sections: draft.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
  });
}

export function updateTopLevelSlot(
  draft: TutorialV2Draft,
  slotId: string,
  patch: Partial<V2TopLevelSlot>,
): TutorialV2Draft {
  return touchDraft(draft, {
    topLevelSlots: (draft.topLevelSlots || []).map((s) => (
      s.id === slotId ? { ...s, ...patch } : s
    )),
  });
}

/** Recipe for a top-level generate slot (single embed). */
export function recipeForTopLevelSlot(slot: V2TopLevelSlot): EmbeddedObjectItem[] {
  return [{
    kind: 'embedded',
    id: slot.id,
    objectType: slot.objectType as EmbeddableObjectType,
    sourceMode: 'generate',
    required: slot.required,
    authoringNote: slot.authoringNote,
    generateMeta: slot.generateMeta,
  }];
}

/** View a generate slot as a section so the section workspace can author it. */
export function topLevelSlotAsSection(slot: V2TopLevelSlot): V2Section {
  const parts = slot.parts?.length
    ? slot.parts
    : (slot.part ? [slot.part] : []);
  const hasAuthored = parts.length > 0
    || !!(slot.pickedSourceIds?.length)
    || !!(slot.highlights?.length)
    || !!(slot.units?.length);
  return {
    id: slot.id,
    title: embedTypeLabel(String(slot.objectType)),
    intent: slot.authoringNote || slot.generateMeta?.objective || '',
    recipe: recipeForTopLevelSlot(slot),
    parts,
    pickedSourceIds: slot.pickedSourceIds || [],
    highlights: slot.highlights || [],
    markupFlags: slot.markupFlags || [],
    units: slot.units,
    authorMode: slot.done && parts.length
      ? 'generated'
      : hasAuthored
        ? 'mixed'
        : 'empty',
    done: slot.done,
    required: slot.required,
  };
}

/** Map section-workspace edits back onto a top-level generate slot. */
export function applySectionPatchToSlot(
  slot: V2TopLevelSlot,
  patch: Partial<V2Section>,
): V2TopLevelSlot {
  const next: V2TopLevelSlot = { ...slot };
  if (patch.parts !== undefined) {
    next.parts = patch.parts;
    next.part = patch.parts[0];
    if (patch.parts.length) next.done = true;
  }
  if (patch.pickedSourceIds !== undefined) next.pickedSourceIds = patch.pickedSourceIds;
  if (patch.highlights !== undefined) next.highlights = patch.highlights;
  if (patch.markupFlags !== undefined) next.markupFlags = patch.markupFlags;
  if (patch.units !== undefined) next.units = patch.units;
  if (patch.done !== undefined) next.done = patch.done;
  return next;
}

export function bumpAuthorMode(
  current: SectionAuthorMode,
  next: 'written' | 'generated',
): SectionAuthorMode {
  if (current === 'empty') return next;
  if (current === next) return current;
  return 'mixed';
}

/** Collect parts from recipe slots + sections (ignores assembledParts override). */
export function collectRecipeParts(draft: TutorialV2Draft): TutorialV2Part[] {
  const out: TutorialV2Part[] = [];
  for (const slot of draft.topLevelSlots || []) {
    if (slot.parts?.length) out.push(...slot.parts);
    else if (slot.part) out.push(slot.part);
  }
  for (const sec of draft.sections || []) {
    if (sec.parts?.length) out.push(...sec.parts);
  }
  return out;
}

/** Concatenate top-level embed parts + section parts for review / publish. */
export function assembleAllParts(draft: TutorialV2Draft): TutorialV2Part[] {
  if (draft.assembledParts?.length) return draft.assembledParts;
  return collectRecipeParts(draft);
}

/**
 * Push Review (assembledParts) edits back into section / slot parts by id
 * so revisiting Plan → Structure → Author keeps authored content.
 */
export function syncAssembledPartsIntoDraft(draft: TutorialV2Draft): TutorialV2Draft {
  const assembled = draft.assembledParts;
  if (!assembled?.length) return draft;
  const byId = new Map(assembled.map((p) => [p.id, p]));

  const sections = (draft.sections || []).map((sec) => {
    if (!sec.parts?.length) return sec;
    let changed = false;
    const parts = sec.parts.map((p) => {
      const next = byId.get(p.id);
      if (next && next !== p) {
        changed = true;
        return next;
      }
      return p;
    });
    return changed ? { ...sec, parts } : sec;
  });

  const topLevelSlots = (draft.topLevelSlots || []).map((slot) => {
    const list = slot.parts?.length ? slot.parts : (slot.part ? [slot.part] : []);
    if (!list.length) return slot;
    let changed = false;
    const parts = list.map((p) => {
      const next = byId.get(p.id);
      if (next && next !== p) {
        changed = true;
        return next;
      }
      return p;
    });
    if (!changed) return slot;
    return {
      ...slot,
      parts,
      part: parts[0],
      done: !!(slot.done || parts.length),
    };
  });

  return { ...draft, sections, topLevelSlots };
}

/** Build a V1-shaped pipeline draft so Hoot can see sources / markup on Review. */
export function pipelineDraftFromV2(
  draft: TutorialV2Draft,
  opts?: { highlights?: any[] },
): CreatorPipelineDraft {
  const pool = draft.sourcePool || [];
  const first = pool[0];
  const highlights = opts?.highlights ?? draft.refineHighlights ?? [];
  const allSentences = pool.flatMap((s) => s.sentences || []);
  return {
    srcMode: first?.kind === 'youtube' ? 'youtube'
      : first?.kind === 'web' ? 'web'
        : first?.kind === 'pdf' ? 'pdf'
          : first ? 'text' : 'manual',
    pasteText: pool.filter((s) => s.kind === 'text').map((s) => (s.sentences || []).map((x) => x.text).join('\n')).join('\n\n'),
    ytUrl: first?.kind === 'youtube' ? first.sourceUrl : undefined,
    webUrl: first?.kind === 'web' ? first.sourceUrl : undefined,
    doc: allSentences.length
      ? {
        fileName: first?.label || 'Sources',
        pageCount: Math.max(1, ...allSentences.map((s) => s.page || 1)),
        sentences: allSentences,
        html: first?.html,
        sourceUrl: first?.sourceUrl,
      }
      : null,
    highlights,
    templateId: draft.templateId,
    fv: {
      obj: draft.metadata.objective,
      aud: draft.metadata.audience,
      lvl: draft.metadata.level,
      pass: draft.structure.pass,
      hintsOn: draft.structure.hintsOn,
      hintN: draft.structure.hintN,
      templateId: draft.templateId,
    },
    assistantMessages: draft.assistantMessages,
  };
}

export function sourcePoolToMarkupSources(pool: V2SourceRef[], pickedIds?: string[]): {
  sources: {
    id: string;
    label: string;
    kind: V2SourceRef['kind'];
    sentences: { text: string; page: number }[];
    offset: number;
    html?: string;
    sourceUrl?: string;
  }[];
  docParas: string[];
  pages: number[];
} {
  const selected = pickedIds?.length
    ? pool.filter((s) => pickedIds.includes(s.id))
    : pool;
  let offset = 0;
  const sources = selected.map((s) => {
    const entry = {
      id: s.id,
      label: s.label,
      kind: s.kind,
      sentences: s.sentences || [],
      offset,
      html: s.html,
      sourceUrl: s.sourceUrl,
    };
    offset += (s.sentences || []).length;
    return entry;
  });
  const docParas: string[] = [];
  const pages: number[] = [];
  for (const s of sources) {
    for (const sent of s.sentences) {
      docParas.push(sent.text);
      pages.push(sent.page);
    }
  }
  return { sources, docParas, pages };
}

export function draftFromLearningObject(obj: LearningObject): TutorialV2Draft | null {
  const raw = (obj as any).tutorialV2Draft as TutorialV2Draft | undefined;
  if (raw && raw.type === 'tutorial-v2' && Array.isArray(raw.sections)) {
    return { ...raw, id: obj.id, title: obj.title || raw.title };
  }
  return null;
}

/** Convert editor parts → library blocks (same shapes as V1 ObjectCreator). */
export function partsToBlocks(parts: TutorialV2Part[] | GeneratedPart[], fv: Record<string, any> = {}): Block[] {
  const passRequired = fv.passOn !== false && fv.passOn !== 'false';
  const passMark = typeof fv.pass === 'string'
    ? parseInt(String(fv.pass).replace('%', ''), 10) || 70
    : (Number(fv.passMark) || 70);
  const quizScoreMeta = {
    passRequired,
    ...(passRequired ? { passMark } : {}),
  };
  return (parts || []).map((p: any, i: number) => {
    const id = String(p.id || `blk-${i}`);
    if (p.type === 'concept-card') {
      return { id, type: 'concept-card', content: { term: p.concept || p.label || '', definition: p.plain || '', example: p.misc || '' } };
    }
    if (p.type === 'question') {
      return {
        id,
        type: 'quiz',
        content: {
          ...quizScoreMeta,
          questions: [{
            question: p.prompt || '',
            type: 'multiple-choice',
            options: p.options || [],
            correct: p.correct ?? 0,
            explanation: p.exp || '',
            label: p.label || undefined,
          }],
        },
      };
    }
    if (p.type === 'section-quiz') {
      const qs = Array.isArray(p.questions) ? p.questions : [];
      return {
        id,
        type: 'quiz',
        content: {
          ...quizScoreMeta,
          embeddedQuiz: true,
          sourceMode: p.sourceMode || 'generate',
          authoringNote: p.authoringNote,
          required: p.required !== false,
          label: p.label || 'Section quiz',
          questions: qs.map((q: any) => ({
            question: q.question || q.prompt || '',
            type: 'multiple-choice',
            options: q.options || [],
            correct: q.correct ?? 0,
            explanation: q.explanation || q.exp || '',
            label: q.label || undefined,
          })),
        },
      };
    }
    if (p.type === 'library-embed') {
      return {
        id,
        type: 'library-embed',
        content: {
          label: p.label,
          libraryTitle: p.libraryTitle,
          objectType: p.objectType,
          versionPin: p.versionPin,
          snapshotBlocks: p.snapshotBlocks || [],
        },
      };
    }
    if (p.type === 'image') {
      return { id, type: 'image', content: { url: p.url || '', caption: p.caption || '', alt: p.caption || '' } };
    }
    if (p.type === 'video') {
      return { id, type: 'video-embed', content: { provider: 'youtube', url: p.url || '', videoId: p.videoId || '', caption: p.caption || '' } };
    }
    return {
      id,
      type: 'rich-text',
      content: {
        text: p.body || p.plain || p.label || '',
        heading: p.heading || undefined,
        subheads: Array.isArray(p.subheads) && p.subheads.length ? p.subheads : undefined,
      },
    };
  }) as Block[];
}
