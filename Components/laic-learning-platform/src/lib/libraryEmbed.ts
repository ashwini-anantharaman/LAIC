/**
 * Embed an Activity-library (or freshly generated) content into a tutorial.
 */
import { OBJECTS } from './data';
import type { Block, LearningObject, LibraryEmbedContent, ObjectType, VersionPin } from './types';

export type LibraryEmbedPart = {
  id: string;
  type: 'library-embed';
  label: string;
  libraryTitle: string;
  objectType: ObjectType;
  versionPin: VersionPin;
  /** Content snapshot at pin time — tutorial stays readable if the source object later changes. */
  snapshotBlocks: Block[];
  authoringNote?: string;
  required?: boolean;
  /** True when snapshot came from a per-type generator (not a library pin). */
  generated?: boolean;
};

export function findLibraryLearningObject(
  objectId: string,
  extraObjects: LearningObject[] = [],
): LearningObject | null {
  return (
    extraObjects.find((o) => o.id === objectId)
    || OBJECTS.find((o) => o.id === objectId)
    || null
  );
}

function cloneBlocks(blocks: Block[], idPrefix: string): Block[] {
  return (blocks || []).map((b, i) => ({
    ...b,
    id: `${idPrefix}_${b.id || i}`,
    content: b.content && typeof b.content === 'object'
      ? JSON.parse(JSON.stringify(b.content))
      : b.content,
  }));
}

/** Build a tutorial editor part that embeds a pinned library content. */
export function makeLibraryEmbedPart(opts: {
  id?: string;
  object: LearningObject;
  versionId: string;
  authoringNote?: string;
  required?: boolean;
}): LibraryEmbedPart {
  const { object, versionId } = opts;
  const id = opts.id || `embed-${object.id}-${Date.now()}`;
  const blocks = Array.isArray(object.blocks) ? object.blocks : [];
  return {
    id,
    type: 'library-embed',
    label: `Embedded · ${object.title}`,
    libraryTitle: object.title,
    objectType: object.type,
    versionPin: { objectId: object.id, versionId },
    snapshotBlocks: cloneBlocks(blocks, id),
    authoringNote: opts.authoringNote,
    required: opts.required !== false,
    generated: false,
  };
}

/** Build a library-embed part from a freshly generated nested object (snapshot only). */
export function makeGeneratedEmbedPart(opts: {
  id?: string;
  objectType: ObjectType;
  title: string;
  snapshotBlocks: Block[];
  authoringNote?: string;
  required?: boolean;
}): LibraryEmbedPart {
  const id = opts.id || `embed-gen-${Date.now()}`;
  return {
    id,
    type: 'library-embed',
    label: `Embedded · ${opts.title}`,
    libraryTitle: opts.title,
    objectType: opts.objectType,
    versionPin: { objectId: 'generated', versionId: 'inline' },
    snapshotBlocks: cloneBlocks(opts.snapshotBlocks || [], id),
    authoringNote: opts.authoringNote,
    required: opts.required !== false,
    generated: true,
  };
}

export function libraryEmbedPartToBlock(part: LibraryEmbedPart | any): Block {
  const content: LibraryEmbedContent = {
    libraryTitle: part.libraryTitle || part.label || 'Embedded content',
    objectType: part.objectType || 'concept-card',
    versionPin: part.versionPin || { objectId: '', versionId: '' },
    snapshotBlocks: Array.isArray(part.snapshotBlocks) ? part.snapshotBlocks : [],
    authoringNote: part.authoringNote,
    required: part.required,
    label: part.label,
    generated: !!part.generated,
  };
  return {
    id: String(part.id || `embed-${Date.now()}`),
    type: 'library-embed',
    content,
  };
}

/** Expand an embed part/block into concrete tutorial blocks for learner preview. */
export function expandLibraryEmbedToBlocks(part: any): Block[] {
  if (!part) return [];
  const id = part.id || 'embed';
  const snaps: Block[] = Array.isArray(part.snapshotBlocks)
    ? part.snapshotBlocks
    : Array.isArray(part.content?.snapshotBlocks)
      ? part.content.snapshotBlocks
      : [];
  const title = part.libraryTitle || part.content?.libraryTitle || 'Embedded content';
  const objectType = part.objectType || part.content?.objectType || 'content';

  if (snaps.length) {
    return snaps.map((b: Block, i: number) => ({
      ...b,
      id: b.id || `${id}__${i}`,
      content: b.content && typeof b.content === 'object'
        ? JSON.parse(JSON.stringify(b.content))
        : b.content,
    }));
  }
  return [{
    id: `${id}__empty`,
    type: 'rich-text',
    content: {
      heading: title,
      text: `This embedded ${objectType} has no content blocks yet.`,
    },
  }];
}

/** Expand any library-embed blocks inline for learner / preview rendering. */
export function expandTutorialBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks || []) {
    if (b?.type === 'library-embed') {
      out.push(...expandLibraryEmbedToBlocks(b));
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Marker heading the tutorial model emits for a reserved non-quiz generate slot. */
export function embedSlotHeading(slotKey: string): string {
  return `⟦EMBED_SLOT:${slotKey}⟧`;
}

export function parseEmbedSlotHeading(heading: unknown): string | null {
  const h = String(heading || '').trim();
  const m = /^⟦EMBED_SLOT:(.+)⟧$/.exec(h);
  return m ? m[1] : null;
}

export function isEmbedSlotPart(p: any): boolean {
  if (!p) return false;
  if (p.type === 'embed-slot' && p.slotKey) return true;
  return !!parseEmbedSlotHeading(p.heading);
}

export function slotKeyFromPart(p: any): string | null {
  if (p?.type === 'embed-slot' && p.slotKey) return String(p.slotKey);
  return parseEmbedSlotHeading(p?.heading);
}

export type SectionEmbedSlot = {
  /** `${sectionId}:${recipeItemId}` — matches embedPlans keys / reserved markers. */
  slotKey: string;
  sectionIndex: number;
  sectionTitle: string;
  recipeIndex: number;
  objectType: string;
  mode: 'pick_from_library' | 'generate';
  versionPin?: VersionPin;
  libraryTitle?: string;
  authoringNote?: string;
  required?: boolean;
  /** Pre-built part (generated snapshot, library pin, or failure placeholder). */
  part?: any;
};

type EmbedRecipeSlot = {
  id: string;
  objectType: string;
  sourceMode?: string;
  required?: boolean;
  authoringNote?: string;
  libraryTitle?: string;
  versionPin?: VersionPin;
};

const isClosing = (p: any) => {
  const h = String(p?.heading || '').trim().toLowerCase();
  return h === 'recap' || h === 'summary';
};

const isSectionStart = (p: any) => {
  if (isEmbedSlotPart(p)) return false;
  if (p?.type === 'library-embed') return false;
  if (p?.type !== 'rich-text') return false;
  const h = String(p.heading || '').trim();
  if (!h) return false;
  const lower = h.toLowerCase();
  if (parseEmbedSlotHeading(h)) return false;
  return lower !== 'introduction' && lower !== 'intro' && !isClosing(p);
};

function resolveSlotPart(
  slot: SectionEmbedSlot,
  libraryObjects: LearningObject[],
  sectionKey: string,
): any {
  if (slot.part) return { ...slot.part, id: slot.part.id || `embed-${sectionKey}-${slot.slotKey}` };

  if (slot.mode === 'pick_from_library' && slot.versionPin?.objectId) {
    const obj = findLibraryLearningObject(slot.versionPin.objectId, libraryObjects);
    if (obj) {
      return makeLibraryEmbedPart({
        id: `embed-${sectionKey}-${slot.slotKey}`,
        object: obj,
        versionId: slot.versionPin.versionId || `${obj.id}__v1`,
        authoringNote: slot.authoringNote,
        required: slot.required,
      });
    }
    return {
      id: `embed-missing-${sectionKey}-${slot.slotKey}`,
      type: 'library-embed',
      label: `Embedded · ${slot.libraryTitle || slot.objectType}`,
      libraryTitle: slot.libraryTitle || '',
      objectType: slot.objectType === 'reused-from-library' ? 'concept-card' : slot.objectType,
      versionPin: slot.versionPin,
      snapshotBlocks: [],
      authoringNote: slot.authoringNote || 'Pinned library content was not found — re-pick in Template Library.',
      required: slot.required,
      generated: false,
    };
  }

  return {
    id: `embed-ph-${sectionKey}-${slot.slotKey}`,
    type: 'rich-text',
    label: `Embedded ${slot.objectType}`,
    heading: undefined,
    body: slot.authoringNote
      || `${slot.objectType} — placeholder (not generated).`,
  };
}

/**
 * Inject pinned + generated embeds using per-section slots (from sectionRecipe).
 * Prefer replacing reserved embed-slot markers; else insert near recipe order / end of section.
 */
export function injectEmbedsIntoParts(
  parts: any[],
  sectionSlots: SectionEmbedSlot[],
  libraryObjects: LearningObject[] = [],
): any[] {
  if (!Array.isArray(parts) || !parts.length || !sectionSlots?.length) return parts;

  const quizPinned = sectionSlots.some(
    (s) => s.mode === 'pick_from_library'
      && (s.objectType === 'quiz' || s.objectType === 'reused-from-library')
      && s.versionPin?.objectId,
  );
  let list = quizPinned ? parts.filter((p) => p?.type !== 'section-quiz') : [...parts];

  // 1) Replace reserved markers in place.
  const usedKeys = new Set<string>();
  list = list.map((p) => {
    const key = slotKeyFromPart(p);
    if (!key) return p;
    const slot = sectionSlots.find((s) => s.slotKey === key);
    if (!slot) return p;
    usedKeys.add(key);
    return resolveSlotPart(slot, libraryObjects, `slot`);
  });

  const remaining = sectionSlots.filter((s) => !usedKeys.has(s.slotKey));
  if (!remaining.length) return list;

  // 2) Group remaining by sectionIndex and insert at end of matching section.
  const bySection = new Map<number, SectionEmbedSlot[]>();
  for (const s of remaining) {
    if (!bySection.has(s.sectionIndex)) bySection.set(s.sectionIndex, []);
    bySection.get(s.sectionIndex)!.push(s);
  }
  for (const slots of bySection.values()) {
    slots.sort((a, b) => a.recipeIndex - b.recipeIndex);
  }

  const sectionStarts = list
    .map((p, i) => (isSectionStart(p) ? i : -1))
    .filter((i) => i >= 0);

  if (!sectionStarts.length) {
    const embeds = remaining.map((s, i) => resolveSlotPart(s, libraryObjects, `all-${i}`));
    const closeIdx = list.findIndex(isClosing);
    const at = closeIdx >= 0 ? closeIdx : list.length;
    return [...list.slice(0, at), ...embeds, ...list.slice(at)];
  }

  const result = [...list];
  // Walk sections from the end so splice indices stay valid.
  const sectionIndices = [...bySection.keys()].sort((a, b) => b - a);
  for (const secIdx of sectionIndices) {
    const slots = bySection.get(secIdx) || [];
    if (!slots.length) continue;
    const startIdx = sectionStarts[secIdx];
    if (startIdx == null) {
      // Fallback: append before closing
      const embeds = slots.map((s, i) => resolveSlotPart(s, libraryObjects, `fb-${secIdx}-${i}`));
      const closeIdx = result.findIndex(isClosing);
      const at = closeIdx >= 0 ? closeIdx : result.length;
      result.splice(at, 0, ...embeds);
      continue;
    }
    let endIdx = secIdx + 1 < sectionStarts.length ? sectionStarts[secIdx + 1] : result.length;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      if (isClosing(result[i])) {
        endIdx = i;
        break;
      }
    }
    // Prefer inserting after ~recipeIndex teaching parts inside the section.
    let insertAt = endIdx;
    const firstSlot = slots[0];
    if (firstSlot && typeof firstSlot.recipeIndex === 'number') {
      // Count non-embed content parts after the heading; place near recipeIndex.
      let contentCount = 0;
      let candidate = startIdx + 1;
      for (let i = startIdx + 1; i < endIdx; i += 1) {
        if (result[i]?.type === 'library-embed' || isEmbedSlotPart(result[i])) continue;
        contentCount += 1;
        candidate = i + 1;
        if (contentCount >= Math.max(1, firstSlot.recipeIndex)) break;
      }
      insertAt = Math.min(candidate, endIdx);
    }
    const embeds = slots.map((s, i) => resolveSlotPart(s, libraryObjects, `s${secIdx}-${i}`));
    result.splice(insertAt, 0, ...embeds);
  }
  return result;
}

/**
 * Legacy helper: same pick_from_library slots for every section from a flat recipe.
 * Prefer injectEmbedsIntoParts with per-section slots.
 */
export function injectPinnedEmbedsIntoParts(
  parts: any[],
  recipe: EmbedRecipeSlot[] | undefined,
  libraryObjects: LearningObject[] = [],
): any[] {
  const slots = (recipe || []).filter(
    (r) => r && r.sourceMode === 'pick_from_library' && r.versionPin?.objectId,
  );
  if (!slots.length || !Array.isArray(parts) || !parts.length) return parts;

  // Discover section count from parts so we still pin into each section.
  const sectionStarts = parts
    .map((p, i) => (isSectionStart(p) ? i : -1))
    .filter((i) => i >= 0);
  const sectionCount = Math.max(1, sectionStarts.length);
  const sectionSlots: SectionEmbedSlot[] = [];
  for (let s = 0; s < sectionCount; s += 1) {
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      sectionSlots.push({
        slotKey: `legacy-s${s}:${slot.id || i}`,
        sectionIndex: s,
        sectionTitle: '',
        recipeIndex: 999 + i,
        objectType: slot.objectType,
        mode: 'pick_from_library',
        versionPin: slot.versionPin,
        libraryTitle: slot.libraryTitle,
        authoringNote: slot.authoringNote,
        required: slot.required,
      });
    }
  }
  return injectEmbedsIntoParts(parts, sectionSlots, libraryObjects);
}
