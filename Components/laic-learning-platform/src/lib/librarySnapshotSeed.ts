/**
 * Baked Content Library snapshot — demo baseline for every visitor.
 *
 * Flow: an author builds folders + content on the deployed site, clicks
 * "Export snapshot" in Content Library (downloads a JSON file), and that file
 * is committed as src/lib/seed/librarySnapshot.json. On every app load the
 * snapshot is merged into the visitor's local library (stamped to their user),
 * so a fresh browser always starts from the same library.
 *
 * Snapshot objects are authoritative on hydrate (same rule as bb-tutorials):
 * redeploying an updated snapshot refreshes every visitor's copy.
 */
import type { LearningObject } from './types';
import {
  getObjectCollections,
  setObjectCollections,
  objectCollectionIds,
  type ObjectCollection,
} from './objectCollectionsStore';
import { bbTutorialsSeedObjects } from './bbTutorialsSeed';
import snapshotJson from './seed/librarySnapshot.json';

export interface LibrarySnapshot {
  version: number;
  savedAt: string | null;
  collections: ObjectCollection[];
  objects: LearningObject[];
}

const SNAPSHOT = snapshotJson as unknown as LibrarySnapshot;

export function librarySnapshotActive(): boolean {
  return !!SNAPSHOT.savedAt && (SNAPSHOT.objects.length > 0 || SNAPSHOT.collections.length > 0);
}

/** Snapshot objects stamped for the signed-in user (keeps folder membership). */
function snapshotObjects(userId: string): LearningObject[] {
  return SNAPSHOT.objects.map((o) => ({
    ...o,
    ownerId: userId,
    collectionId: undefined,
  }));
}

/**
 * Folders retired from the demo baseline — removed on every hydrate.
 * Name match is exact (case-sensitive) so the seeded lowercase "quiz"
 * folder is untouched; builtin and snapshot folders are always kept.
 */
const RETIRED_COLLECTION_NAMES = new Set([
  'video script',
  'Flashcard Set',
  'Quiz',
  'Concept Card',
]);

function pruneRetiredCollections(userId: string): void {
  const existing = getObjectCollections(userId);
  const keepIds = new Set(SNAPSHOT.collections.map((c) => c.id));
  const retired = existing.filter((c) => (
    !c.builtin && !keepIds.has(c.id) && RETIRED_COLLECTION_NAMES.has(c.name.trim())
  ));
  if (!retired.length) return;
  const retiredIds = new Set(retired.map((c) => c.id));
  const parentOf = new Map(retired.map((c) => [c.id, c.parentId ?? null]));
  const next = existing
    .filter((c) => !retiredIds.has(c.id))
    .map((c) => {
      let p = c.parentId ?? null;
      while (p && retiredIds.has(p)) p = parentOf.get(p) ?? null;
      return p === (c.parentId ?? null) ? c : { ...c, parentId: p };
    });
  if (next.length) setObjectCollections(userId, next);
}

/** Create any snapshot folders the user doesn't have yet (ids preserved). */
export function ensureSnapshotCollections(userId: string): void {
  pruneRetiredCollections(userId);
  if (!librarySnapshotActive() || !SNAPSHOT.collections.length) return;
  const existing = getObjectCollections(userId);
  const have = new Set(existing.map((c) => c.id));
  const missing = SNAPSHOT.collections.filter((c) => c && c.id && !have.has(c.id));
  if (!missing.length) return;
  setObjectCollections(userId, [...existing, ...missing.map((c) => ({ ...c }))]);
}

/**
 * Merge the baked snapshot into a user's library. Snapshot objects are
 * upserted by id (authoritative). Snapshot folders are locked to their
 * snapshot contents: any other object filed in one is evicted — removed
 * from the folder, deleted outright if that was its only folder.
 * Objects living entirely outside snapshot folders are left untouched.
 */
export function mergeLibrarySnapshot(
  userId: string,
  objs: LearningObject[],
): LearningObject[] {
  if (!librarySnapshotActive() || !SNAPSHOT.objects.length) return objs;
  const seed = snapshotObjects(userId);
  const seedById = new Map(seed.map((o) => [o.id, o]));
  const lockedFolderIds = new Set(
    SNAPSHOT.collections.filter((c) => !c.builtin).map((c) => c.id),
  );
  let changed = false;

  const next: LearningObject[] = [];
  for (const o of objs) {
    const seeded = seedById.get(o.id);
    if (seeded) {
      seedById.delete(o.id);
      changed = true;
      next.push(seeded);
      continue;
    }
    // Snapshot folders were locked to their seeded contents as a one-time
    // cleanup. That now deletes an author's own flashcards and quizzes the
    // moment they are filed by type, so the folders are ordinary again.
    next.push(o);
  }

  const missing = [...seedById.values()];
  if (!missing.length && !changed) return objs;
  return missing.length ? [...next, ...missing] : next;
}

/**
 * Build the export blob from the CURRENT library state and download it.
 * bb-tutorials built-ins are excluded — they're already baked separately.
 */
export function exportLibrarySnapshot(
  userId: string,
  objects: LearningObject[],
): void {
  const bbIds = new Set(bbTutorialsSeedObjects(userId).map((o) => o.id));
  const snapshot: LibrarySnapshot = {
    version: (SNAPSHOT.version || 0) + 1,
    savedAt: new Date().toISOString(),
    collections: getObjectCollections(userId),
    objects: objects.filter((o) => !bbIds.has(o.id)),
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'librarySnapshot.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
