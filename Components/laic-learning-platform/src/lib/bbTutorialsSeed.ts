/**
 * Built-in bb-tutorials Content Library pack — merged into every user's library.
 */

import type { LearningObject } from './types';
import {
  BB_TUTORIALS_COLLECTION_ID,
  BB_TUTORIALS_LEGACY_COLLECTION_ID,
  objectCollectionIds,
} from './objectCollectionsStore';
import seedJson from './seed/bbTutorialsSeed.json';

const SEED = seedJson as LearningObject[];

function remapCollectionIds(ids: string[]): string[] {
  return [...new Set(
    ids.map((id) => (
      id === BB_TUTORIALS_LEGACY_COLLECTION_ID ? BB_TUTORIALS_COLLECTION_ID : id
    )).filter(Boolean),
  )];
}

/** Seed tutorials stamped for the signed-in user, always in bb-tutorials. */
export function bbTutorialsSeedObjects(userId: string): LearningObject[] {
  return SEED.map((o) => ({
    ...o,
    ownerId: userId,
    collectionIds: [BB_TUTORIALS_COLLECTION_ID],
    collectionId: undefined,
  }));
}

/**
 * Ensure every user has the built-in tutorials.
 * Seed objects are authoritative (upserted on hydrate) so image/content
 * updates ship to every role without relying on stale local copies.
 */
export function mergeBbTutorialsIntoLibrary(
  userId: string,
  objs: LearningObject[],
): LearningObject[] {
  const seed = bbTutorialsSeedObjects(userId);
  const seedById = new Map(seed.map((o) => [o.id, o]));
  let changed = false;

  const next = objs.map((o) => {
    const seeded = seedById.get(o.id);
    if (seeded) {
      changed = true;
      seedById.delete(o.id);
      return seeded;
    }
    let ids = remapCollectionIds(objectCollectionIds(o));
    const same =
      o.collectionIds?.length === ids.length
      && ids.every((id, i) => o.collectionIds?.[i] === id)
      && !o.collectionId;
    if (same) return o;
    changed = true;
    return { ...o, collectionIds: ids, collectionId: undefined };
  });

  const missing = [...seedById.values()];
  if (!missing.length && !changed) return objs;
  return missing.length ? [...next, ...missing] : next;
}
