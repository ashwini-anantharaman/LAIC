/**
 * Section state machine + skeleton helpers for Tutorial V3 Approach-2.
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
import { configToBlockContent, readBridgeConfig } from './bridgeEmbed';
import type {
  SectionAuthorMode,
  SectionStatus,
  TutorialV3Draft,
  TutorialV3Part,
  TutorialV3Structure,
  V3Section,
  V3SourceRef,
  V3TopLevelSlot,
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
export function partHasContent(p: TutorialV3Part | Record<string, unknown> | null | undefined): boolean {
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

export function sectionHasContent(sec: V3Section): boolean {
  return (sec.parts || []).some((p) => partHasContent(p));
}

/** Section is ready for Review — explicit done checkbox or real content. */
export function sectionSatisfied(sec: V3Section): boolean {
  return !!sec.done || sectionHasContent(sec);
}

export function slotSatisfied(slot: {
  done?: boolean;
  parts?: TutorialV3Part[] | null;
  part?: TutorialV3Part | null;
}): boolean {
  if (slot.done) return true;
  if ((slot.parts || []).some((p) => partHasContent(p))) return true;
  return partHasContent(slot.part || null);
}

export function deriveSectionStatus(sec: V3Section): SectionStatus {
  if (sectionSatisfied(sec)) return 'done';
  const hasAuthored =
    (sec.parts && sec.parts.length > 0)
    || (sec.pickedSourceIds && sec.pickedSourceIds.length > 0)
    || (sec.highlights && sec.highlights.length > 0)
    || (sec.units && sec.units.length > 0);
  return hasAuthored ? 'in_progress' : 'not_started';
}

export function requiredSectionsRemaining(sections: V3Section[]): number {
  return (sections || []).filter((s) => s.required && !sectionSatisfied(s)).length;
}

export function allRequiredDone(
  sections: V3Section[],
  topLevelSlots?: { required: boolean; done: boolean; parts?: TutorialV3Part[] | null; part?: TutorialV3Part | null }[],
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

export function doneCount(sections: V3Section[]): { done: number; total: number } {
  const list = sections || [];
  return { done: list.filter((s) => sectionSatisfied(s)).length, total: list.length };
}

export function structureFromTemplate(template: TutorialTemplate): TutorialV3Structure {
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
export function scaffoldPartsFromRecipe(recipe: RecipeItem[], sectionTitle: string): TutorialV3Part[] {
  const parts: TutorialV3Part[] = [];
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

export function seedV3SectionsFromTemplate(
  template: TutorialTemplate,
  titles?: { title: string; intent?: string; required?: boolean }[],
): V3Section[] {
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
 * Build V3 section skeleton from a V1-style TutorialDefinition + template
 * (same recipe resolution / embed tagging as ObjectCreator Plan → generate).
 */
export function seedV3SectionsFromDefinition(
  template: TutorialTemplate,
  def: TutorialDefinition,
): V3Section[] {
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

export function emptyTutorialV3Draft(partial: {
  id?: string;
  title?: string;
  templateId: string;
  structure: TutorialV3Structure;
  phase?: TutorialV3Draft['phase'];
  metadata?: TutorialV3Draft['metadata'];
}): TutorialV3Draft {
  const now = Date.now();
  return {
    id: partial.id || `tv3-${now.toString(36)}`,
    type: 'tutorial-v3',
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

export function touchDraft(draft: TutorialV3Draft, patch: Partial<TutorialV3Draft>): TutorialV3Draft {
  return { ...draft, ...patch, updatedAt: Date.now() };
}

export function updateSection(
  draft: TutorialV3Draft,
  sectionId: string,
  patch: Partial<V3Section>,
): TutorialV3Draft {
  return touchDraft(draft, {
    sections: draft.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
  });
}

export function updateTopLevelSlot(
  draft: TutorialV3Draft,
  slotId: string,
  patch: Partial<V3TopLevelSlot>,
): TutorialV3Draft {
  return touchDraft(draft, {
    topLevelSlots: (draft.topLevelSlots || []).map((s) => (
      s.id === slotId ? { ...s, ...patch } : s
    )),
  });
}

/** Recipe for a top-level generate slot (single embed). */
export function recipeForTopLevelSlot(slot: V3TopLevelSlot): EmbeddedObjectItem[] {
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
export function topLevelSlotAsSection(slot: V3TopLevelSlot): V3Section {
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
  slot: V3TopLevelSlot,
  patch: Partial<V3Section>,
): V3TopLevelSlot {
  const next: V3TopLevelSlot = { ...slot };
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
export function collectRecipeParts(draft: TutorialV3Draft): TutorialV3Part[] {
  const out: TutorialV3Part[] = [];
  for (const slot of draft.topLevelSlots || []) {
    if (slot.parts?.length) out.push(...slot.parts);
    else if (slot.part) out.push(slot.part);
  }
  for (const sec of draft.sections || []) {
    if (sec.parts?.length) out.push(...sec.parts);
  }
  return out;
}

/**
 * Stamp `pageBreakBefore` from Structure learnerPage grouping.
 * Only runs when at least one slot/section has an explicit learnerPage.
 */
export function applyLearnerPageBreaksToParts(
  draft: TutorialV3Draft,
  parts: TutorialV3Part[],
): TutorialV3Part[] {
  const list = parts || [];
  if (!list.length) return list;
  // Review-level page edits win — keep the parts' own break flags.
  if (draft.manualPageBreaks) return list;

  const slots = draft.topLevelSlots || [];
  const sections = draft.sections || [];
  const anyExplicit = slots.some((s) => s.learnerPage != null)
    || sections.some((s) => s.learnerPage != null);
  if (!anyExplicit) {
    return list.map((p) => {
      if (!p.pageBreakBefore) return p;
      const next = { ...p };
      delete next.pageBreakBefore;
      return next;
    });
  }

  const pageByPartId = new Map<string, number>();
  const outline = [
    ...slots.map((s, i) => ({
      page: s.learnerPage ?? (i + 1),
      partIds: (s.parts?.length ? s.parts : (s.part ? [s.part] : [])).map((p) => p.id),
    })),
    ...sections.map((s, i) => ({
      page: s.learnerPage ?? (slots.length + i + 1),
      partIds: (s.parts || []).map((p) => p.id),
    })),
  ];
  for (const item of outline) {
    for (const id of item.partIds) pageByPartId.set(id, Math.max(1, Number(item.page) || 1));
  }

  let prevPage: number | null = null;
  return list.map((p) => {
    const page = pageByPartId.has(p.id) ? pageByPartId.get(p.id)! : prevPage;
    if (page == null) {
      if (!p.pageBreakBefore) return p;
      const next = { ...p };
      delete next.pageBreakBefore;
      return next;
    }
    const breakBefore = prevPage !== null && page !== prevPage;
    prevPage = page;
    if (breakBefore) return { ...p, pageBreakBefore: true };
    if (!p.pageBreakBefore) return p;
    const next = { ...p };
    delete next.pageBreakBefore;
    return next;
  });
}

/** Concatenate top-level embed parts + section parts for review / publish. */
export function assembleAllParts(draft: TutorialV3Draft): TutorialV3Part[] {
  const base = draft.assembledParts?.length ? draft.assembledParts : collectRecipeParts(draft);
  return applyLearnerPageBreaksToParts(draft, base);
}

/**
 * Push Review (assembledParts) edits back into section / slot parts by id
 * so revisiting Plan → Structure → Author keeps authored content.
 */
export function syncAssembledPartsIntoDraft(draft: TutorialV3Draft): TutorialV3Draft {
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
export function pipelineDraftFromV3(
  draft: TutorialV3Draft,
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

export function sourcePoolToMarkupSources(pool: V3SourceRef[], pickedIds?: string[]): {
  sources: {
    id: string;
    label: string;
    kind: V3SourceRef['kind'];
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

export function draftFromLearningObject(obj: LearningObject): TutorialV3Draft | null {
  const raw = (obj as any).tutorialV3Draft as TutorialV3Draft | undefined;
  if (raw && raw.type === 'tutorial-v3' && Array.isArray(raw.sections)) {
    return { ...raw, id: obj.id, title: obj.title || raw.title };
  }
  return null;
}

/** Convert editor parts → library blocks (same shapes as V1 ObjectCreator). */
export function partsToBlocks(parts: TutorialV3Part[] | GeneratedPart[], fv: Record<string, any> = {}): Block[] {
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
    const pageBreakBefore = p.pageBreakBefore ? true : undefined;
    // A Bridge table travels as its CONFIG. Without this case it fell through to
    // the rich-text default at the end and a published tutorial carried the
    // words "Bridge table" where the table should be.
    //
    // NOTE: ObjectCreator.tsx has its own partsToBlocks with the same case —
    // V1 uses that one, Tutorial V3 uses this one. Both delegate the field
    // mapping to configToBlockContent so a new knob cannot land in one and
    // not the other.
    if (p.type === 'bridge-embed') {
      return {
        id,
        type: 'bridge-table',
        pageBreakBefore,
        content: configToBlockContent(readBridgeConfig(p), p.caption || ''),
      };
    }
    if (p.type === 'concept-card') {
      return {
        id,
        type: 'concept-card',
        pageBreakBefore,
        content: { term: p.concept || p.label || '', definition: p.plain || '', example: p.misc || '' },
      };
    }
    if (p.type === 'question') {
      return {
        id,
        type: 'quiz',
        pageBreakBefore,
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
        pageBreakBefore,
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
        pageBreakBefore,
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
      return {
        id,
        type: 'image',
        pageBreakBefore,
        content: { url: p.url || '', caption: p.caption || '', alt: p.caption || '' },
      };
    }
    if (p.type === 'video') {
      return {
        id,
        type: 'video-embed',
        pageBreakBefore,
        content: { provider: 'youtube', url: p.url || '', videoId: p.videoId || '', caption: p.caption || '' },
      };
    }
    return {
      id,
      type: 'rich-text',
      pageBreakBefore,
      content: {
        text: p.body || p.plain || p.label || '',
        heading: p.heading || undefined,
        subheads: Array.isArray(p.subheads) && p.subheads.length ? p.subheads : undefined,
      },
    };
  }) as Block[];
}


/* ── Review-stage per-part page control ─────────────────────── */

/** 1-based student page for each part, derived from pageBreakBefore flags. */
export function partPageNumbers(parts: TutorialV3Part[]): number[] {
  let page = 1;
  return (parts || []).map((p, i) => {
    if (i > 0 && p.pageBreakBefore) page += 1;
    return page;
  });
}

/**
 * Move one part onto a student page (1-based). The part is placed at the end
 * of that page; `page` beyond the last page starts a new one. Break flags are
 * rewritten so the first part of every page after the first carries
 * pageBreakBefore.
 */
export function movePartToPage(
  parts: TutorialV3Part[],
  partId: string,
  page: number,
): TutorialV3Part[] {
  const list = parts || [];
  const idx = list.findIndex((p) => p.id === partId);
  if (idx < 0) return list;

  // Split into page groups by the current flags.
  const groups: TutorialV3Part[][] = [];
  for (let i = 0; i < list.length; i++) {
    if (i === 0 || list[i].pageBreakBefore) groups.push([]);
    groups[groups.length - 1].push(list[i]);
  }
  if (!groups.length) groups.push([]);

  // Pull the part out of its group.
  let moved: TutorialV3Part | null = null;
  for (const g of groups) {
    const gi = g.findIndex((p) => p.id === partId);
    if (gi >= 0) { moved = g.splice(gi, 1)[0]; break; }
  }
  if (!moved) return list;

  const target = Math.max(1, Math.round(Number(page) || 1));
  while (groups.length < target) groups.push([]);
  groups[target - 1].push(moved);

  // Rebuild, dropping now-empty pages, and rewrite the break flags.
  const rebuilt = groups.filter((g) => g.length);
  const out: TutorialV3Part[] = [];
  rebuilt.forEach((g, gi) => {
    g.forEach((p, pi) => {
      const wantBreak = gi > 0 && pi === 0;
      if (!!p.pageBreakBefore === wantBreak) { out.push(p); return; }
      const next = { ...p };
      if (wantBreak) next.pageBreakBefore = true;
      else delete next.pageBreakBefore;
      out.push(next);
    });
  });
  return out;
}
