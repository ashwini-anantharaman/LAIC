/**
 * Author-chosen order of content inside a Content Library folder.
 *
 * Object order used to be an accident: `addObject` prepends on every save, so
 * editing anything threw it to the top of its folder, and merges re-sort by
 * updatedAt. A course developer could not say "this lesson comes before that
 * one" and have it survive the next save, let alone a refresh.
 *
 * Order is per COLLECTION, not a field on the object, because one object can
 * be filed in several folders and can sit in a different place in each.
 *
 * Stored shape: { [collectionId]: objectId[] }. The list is a preference, not
 * a source of truth — ids that no longer exist are ignored on read, and
 * objects missing from it fall to the end, so a stale entry can never hide
 * content.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

const KEY = (userId: string) => `laic-object-order:${userId || 'anon'}`;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeObjectOrder(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

type OrderMap = Record<string, string[]>;

function readAll(userId: string): OrderMap {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: OrderMap = {};
    for (const [collectionId, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids)) out[collectionId] = ids.filter((id) => typeof id === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(userId: string, next: OrderMap): void {
  try {
    const before = localStorage.getItem(KEY(userId));
    const after = JSON.stringify(next);
    if (before === after) return; // no-op writes must not wake every subscriber
    localStorage.setItem(KEY(userId), after);
  } catch {
    /* quota / private mode — ordering is a preference, never worth throwing over */
  }
  emit();
}

/** The saved id order for one folder ('' when the author never reordered it). */
export function getObjectOrder(userId: string, collectionId: string): string[] {
  if (!collectionId) return [];
  return readAll(userId)[collectionId] || [];
}

export function setObjectOrder(userId: string, collectionId: string, objectIds: string[]): void {
  if (!collectionId) return;
  const all = readAll(userId);
  all[collectionId] = [...new Set(objectIds.filter(Boolean))];
  writeAll(userId, all);
}

/**
 * Sort a folder's objects by the author's saved order.
 *
 * Anything not in the saved order keeps its incoming relative order and goes
 * last — so newly created content appears at the bottom of a hand-sorted
 * folder instead of silently jumping the queue.
 */
export function applyObjectOrder<T extends { id: string }>(
  userId: string,
  collectionId: string,
  objects: T[],
): T[] {
  const order = getObjectOrder(userId, collectionId);
  if (!order.length) return objects;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...objects].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}
