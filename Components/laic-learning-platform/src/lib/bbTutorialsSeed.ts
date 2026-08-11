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

/**
 * Seed tutorials removed from the pack. Merging is upsert-only, so returning
 * visitors still carry these in their local library — prune them on hydrate.
 */
const RETIRED_SEED_IDS = new Set(['tv2-msj0e47v', 'tv2-msidkvk1']);

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
 * Ensure every user has the built-in tutorials — and ONLY them in the
 * bb-tutorials folder. Seed objects are authoritative (upserted on hydrate)
 * so image/content updates ship to every role without relying on stale local
 * copies. Non-seed objects filed in bb-tutorials are evicted: dropped from
 * the folder if they also live elsewhere, deleted outright if bb-tutorials
 * was their only folder. (Snapshot objects are safe — mergeLibrarySnapshot
 * runs after this and restores them into their snapshot folders.)
 */
export function mergeBbTutorialsIntoLibrary(
  userId: string,
  objs: LearningObject[],
): LearningObject[] {
  const seed = bbTutorialsSeedObjects(userId);
  const seedById = new Map(seed.map((o) => [o.id, o]));
  let changed = false;

  const live = objs.filter((o) => !RETIRED_SEED_IDS.has(o.id));
  if (live.length !== objs.length) changed = true;

  const next: LearningObject[] = [];
  for (const o of live) {
    const seeded = seedById.get(o.id);
    if (seeded) {
      changed = true;
      seedById.delete(o.id);
      next.push(seeded);
      continue;
    }
    let ids = remapCollectionIds(objectCollectionIds(o));
    if (ids.includes(BB_TUTORIALS_COLLECTION_ID)) {
      changed = true;
      ids = ids.filter((id) => id !== BB_TUTORIALS_COLLECTION_ID);
      if (!ids.length) continue; // bb-tutorials-only stray — permanently removed
      next.push({ ...o, collectionIds: ids, collectionId: undefined });
      continue;
    }
    const same =
      o.collectionIds?.length === ids.length
      && ids.every((id, i) => o.collectionIds?.[i] === id)
      && !o.collectionId;
    if (same) {
      next.push(o);
      continue;
    }
    changed = true;
    next.push({ ...o, collectionIds: ids, collectionId: undefined });
  }

  const missing = [...seedById.values()];
  if (!missing.length && !changed) return objs;
  return missing.length ? [...next, ...missing] : next;
}
