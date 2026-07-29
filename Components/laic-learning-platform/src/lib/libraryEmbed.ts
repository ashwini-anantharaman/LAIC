/**
 * Embed an Activity-library learning object into a tutorial (snapshot + pin).
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

/** Build a tutorial editor part that embeds a pinned library object. */
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
  };
}

export function libraryEmbedPartToBlock(part: LibraryEmbedPart | any): Block {
  const content: LibraryEmbedContent = {
    libraryTitle: part.libraryTitle || part.label || 'Embedded object',
    objectType: part.objectType || 'concept-card',
    versionPin: part.versionPin || { objectId: '', versionId: '' },
    snapshotBlocks: Array.isArray(part.snapshotBlocks) ? part.snapshotBlocks : [],
    authoringNote: part.authoringNote,
    required: part.required,
    label: part.label,
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
  const title = part.libraryTitle || part.content?.libraryTitle || 'Embedded object';
  const objectType = part.objectType || part.content?.objectType || 'object';

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
