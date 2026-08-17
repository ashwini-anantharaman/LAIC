/**
 * Local-first learning-object versions.
 * Head object in the library stays editable. Versions are numbered content
 * snapshots — like git commits: the first save creates v1; each later save
 * whose content differs from the tip becomes v2, v3, … (unlocked tip may be
 * amended briefly while the author is still typing).
 */

import type { LearningObject, ObjectVersionSnapshot, Version } from './types';
import { VERSIONS as SEED_VERSIONS } from './data';

const KEY = (userId: string) => `laic-object-versions:${userId || 'anon'}`;

/** While unlocked tip is this fresh, content-changing saves amend it instead of spawning vN. */
const AMEND_WINDOW_MS = 90_000;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeObjectVersions(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function versionIdFor(objectId: string, versionNumber: number): string {
  return `${objectId}__v${versionNumber}`;
}

export function snapshotFromObject(obj: LearningObject): ObjectVersionSnapshot {
  return {
    title: obj.title,
    description: obj.description || '',
    estimatedTime: obj.estimatedTime || '10 min',
    status: obj.status,
    type: obj.type,
    blocks: Array.isArray(obj.blocks) ? JSON.parse(JSON.stringify(obj.blocks)) : [],
    tags: [...(obj.tags || [])],
    sourceIds: [...(obj.sourceIds || [])],
    pipelineDraft: obj.pipelineDraft
      ? JSON.parse(JSON.stringify(obj.pipelineDraft))
      : undefined,
    tutorialV2Draft: obj.tutorialV2Draft
      ? JSON.parse(JSON.stringify(obj.tutorialV2Draft))
      : undefined,
    tutorialV3Draft: obj.tutorialV3Draft
      ? JSON.parse(JSON.stringify(obj.tutorialV3Draft))
      : undefined,
  };
}

/** Stable content hash — ignores UI-only draft fields so phase navigation isn’t a “commit”. */
export function contentFingerprint(snap: ObjectVersionSnapshot | LearningObject): string {
  const title = String((snap as any).title || '');
  const description = String((snap as any).description || '');
  const estimatedTime = String((snap as any).estimatedTime || '10 min');
  const status = String((snap as any).status || '');
  const type = String((snap as any).type || '');
  const blocks = (snap as any).blocks;
  const tags = (snap as any).tags || [];
  const sourceIds = (snap as any).sourceIds || [];
  const pipelineDraft = (snap as any).pipelineDraft;
  let tutorialV2Draft = (snap as any).tutorialV2Draft
    ? JSON.parse(JSON.stringify((snap as any).tutorialV2Draft))
    : undefined;
  if (tutorialV2Draft && typeof tutorialV2Draft === 'object') {
    delete tutorialV2Draft.phase;
    delete tutorialV2Draft.activeSectionId;
    delete tutorialV2Draft.activeSlotId;
    delete tutorialV2Draft.updatedAt;
    delete tutorialV2Draft.createdAt;
    delete tutorialV2Draft.assistantMessages;
  }
  let tutorialV3Draft = (snap as any).tutorialV3Draft
    ? JSON.parse(JSON.stringify((snap as any).tutorialV3Draft))
    : undefined;
  if (tutorialV3Draft && typeof tutorialV3Draft === 'object') {
    delete tutorialV3Draft.phase;
    delete tutorialV3Draft.activeSectionId;
    delete tutorialV3Draft.activeSlotId;
    delete tutorialV3Draft.updatedAt;
    delete tutorialV3Draft.createdAt;
    delete tutorialV3Draft.assistantMessages;
  }
  return JSON.stringify({
    title,
    description,
    estimatedTime,
    status,
    type,
    blocks: blocks || [],
    tags,
    sourceIds,
    pipelineDraft: pipelineDraft || null,
    tutorialV2Draft: tutorialV2Draft || null,
    tutorialV3Draft: tutorialV3Draft || null,
  });
}

function contentEqualsSnapshot(
  tipSnapshot: ObjectVersionSnapshot | undefined,
  obj: LearningObject,
): boolean {
  if (!tipSnapshot) return false;
  return contentFingerprint(tipSnapshot) === contentFingerprint(snapshotFromObject(obj));
}

function tipCreatedAtMs(tip: Version): number {
  const raw = (tip as any).createdAtMs;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  // Date-only createdAt → treat as old so the next real edit commits a new version.
  const d = Date.parse(tip.createdAt);
  return Number.isFinite(d) ? d : 0;
}

export function objectFromVersion(
  base: LearningObject,
  version: Version,
): LearningObject {
  const snap = version.snapshot;
  if (!snap) {
    return {
      ...base,
      title: version.objectTitle || base.title,
      status: version.status,
    };
  }
  return {
    ...base,
    title: snap.title,
    description: snap.description,
    estimatedTime: snap.estimatedTime,
    status: snap.status,
    type: snap.type,
    blocks: snap.blocks,
    tags: snap.tags,
    sourceIds: snap.sourceIds,
    pipelineDraft: snap.pipelineDraft,
    tutorialV2Draft: snap.tutorialV2Draft,
    tutorialV3Draft: snap.tutorialV3Draft,
    updatedAt: version.createdAt,
  };
}

function readAll(userId: string): Version[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => v && typeof v.id === 'string' && typeof v.objectId === 'string');
  } catch {
    return [];
  }
}

/**
 * Persist history, shedding weight rather than failing.
 *
 * Snapshots carry whole blocks, and images are inlined base64, so a handful of
 * illustrated versions fills the ~5MB localStorage budget. The old write threw
 * QuotaExceededError straight through: nothing was stored, and the history an
 * author could see vanished on the next refresh.
 *
 * The version LIST is what must never be lost — an author needs to see that v1…v9
 * exist even if the browser cannot hold nine copies of their images. So on
 * overflow we drop CONTENT from the least precious versions, oldest first, and
 * keep every row. Protected from trimming while anything else remains: the
 * published version (it is what readers are being served), locked versions (a
 * lock promises the content will not change), v1 (the original state), and the
 * newest version (the one being worked on).
 */
const SNAPSHOT_PROTECTED = (v: Version, newestPerObject: Map<string, number>) => (
  !!v.publishedAt
  || !!v.locked
  || v.versionNumber === 1
  || newestPerObject.get(v.objectId) === v.versionNumber
);

function trimForStorage(list: Version[], pass: number): Version[] {
  const newest = new Map<string, number>();
  for (const v of list) {
    newest.set(v.objectId, Math.max(newest.get(v.objectId) ?? 0, v.versionNumber));
  }
  // Oldest first, so the versions an author is least likely to reach for lose
  // their content before recent ones do.
  const order = [...list].sort((a, b) => a.versionNumber - b.versionNumber);
  const doomed = new Set<string>();
  for (const v of order) {
    if (!v.snapshot) continue;
    if (pass < 2 && SNAPSHOT_PROTECTED(v, newest)) continue;
    // Pass 2: published and locked versions keep their content, because losing
    // those loses something irreplaceable.
    if (pass === 2 && (v.publishedAt || v.locked)) continue;
    // Pass 3 spares nothing. A version ROW with no content still tells an
    // author it exists; refusing the write told them their history was empty —
    // which is how a new tutorial ended up with no v1 to publish on a browser
    // whose storage was already full.
    doomed.add(v.id);
    if (pass === 0) break;      // shed one at a time first — stay cheap
    if (pass === 1 && doomed.size >= 3) break;
  }
  if (!doomed.size) return list;
  return list.map((v) => (
    doomed.has(v.id)
      ? { ...v, snapshot: undefined, snapshotTrimmed: true }
      : v
  ));
}

function writeAll(userId: string, list: Version[]) {
  let candidate = list;
  // Escalate through the passes: a pass that finds nothing to shed must move
  // to a less forgiving one, not give up. Stopping at the first unhelpful pass
  // is what let a lone (and therefore fully protected) v1 fail to save at all.
  for (let pass = 0; pass <= 3; pass += 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        localStorage.setItem(KEY(userId), JSON.stringify(candidate));
        emit();
        return;
      } catch {
        const slimmer = trimForStorage(candidate, pass);
        if (slimmer === candidate) break; // this pass has nothing more to give
        candidate = slimmer;
      }
    }
  }
  // Even metadata-only did not fit. Leave whatever is already stored rather
  // than clearing it — a stale history beats no history.
  console.warn('[versions] could not persist history: storage is full');
  emit();
}

/** User versions for an object, newest first. Includes seed rows (no snapshot) when present. */
export function listVersionsForObject(userId: string, objectId: string): Version[] {
  const local = readAll(userId).filter((v) => v.objectId === objectId);
  const localIds = new Set(local.map((v) => v.id));
  const seeds = SEED_VERSIONS
    .filter((v) => v.objectId === objectId && !localIds.has(v.id))
    .map((v) => ({ ...v }));
  return [...local, ...seeds].sort((a, b) => b.versionNumber - a.versionNumber);
}

export function listAllVersions(userId: string): Version[] {
  const local = readAll(userId);
  const localIds = new Set(local.map((v) => v.id));
  const seeds = SEED_VERSIONS.filter((v) => !localIds.has(v.id)).map((v) => ({ ...v }));
  return [...local, ...seeds].sort((a, b) => {
    if (a.objectId !== b.objectId) return a.objectTitle.localeCompare(b.objectTitle);
    return b.versionNumber - a.versionNumber;
  });
}

export function getVersion(userId: string, versionId: string): Version | null {
  const local = readAll(userId).find((v) => v.id === versionId);
  if (local) return local;
  return SEED_VERSIONS.find((v) => v.id === versionId) || null;
}

function nextVersionNumber(existing: Version[]): number {
  if (!existing.length) return 1;
  return Math.max(...existing.map((v) => v.versionNumber)) + 1;
}

function upsertLocal(userId: string, version: Version) {
  const all = readAll(userId);
  const next = [version, ...all.filter((v) => v.id !== version.id)];
  writeAll(userId, next);
}

function makeVersion(
  obj: LearningObject,
  createdBy: string,
  n: number,
  notes: string,
): Version {
  const now = Date.now();
  return {
    id: versionIdFor(obj.id, n),
    objectId: obj.id,
    objectTitle: obj.title,
    versionNumber: n,
    status: obj.status,
    createdAt: today(),
    createdBy,
    isLive: n === 1 && (obj.status === 'published' || obj.status === 'approved'),
    notes,
    locked: false,
    snapshot: snapshotFromObject(obj),
    // Internal amend clock (persisted; ignored by readers that don’t know it).
    ...( { createdAtMs: now } as any ),
  };
}

/**
 * Git-style sync on every library save:
 * - No history → commit v1
 * - Same content as tip → no-op
 * - Different content + unlocked tip still in amend window → update tip snapshot
 * - Different content otherwise → commit next version (v2, v3, …)
 */
export function syncWorkingVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
): Version {
  const localOnly = readAll(userId).filter((v) => v.objectId === obj.id);
  const tip = localOnly.length
    ? localOnly.reduce((a, b) => (a.versionNumber >= b.versionNumber ? a : b))
    : null;

  if (!tip) {
    const existing = listVersionsForObject(userId, obj.id);
    const n = existing.length ? nextVersionNumber(existing) : 1;
    const v = makeVersion(
      obj,
      createdBy,
      n,
      n === 1 ? 'Initial version' : `Version ${n}`,
    );
    upsertLocal(userId, v);
    return v;
  }

  if (contentEqualsSnapshot(tip.snapshot, obj)) {
    return tip;
  }

  const age = Date.now() - tipCreatedAtMs(tip);
  const canAmend = !tip.locked && age >= 0 && age < AMEND_WINDOW_MS;

  if (canAmend) {
    const amended: Version = {
      ...tip,
      objectTitle: obj.title,
      status: obj.status,
      createdAt: today(),
      createdBy: tip.createdBy || createdBy,
      snapshot: snapshotFromObject(obj),
      notes: tip.notes || (tip.versionNumber === 1 ? 'Initial version' : `Version ${tip.versionNumber}`),
      ...( { createdAtMs: (tip as any).createdAtMs || Date.now() } as any ),
    };
    upsertLocal(userId, amended);
    return amended;
  }

  const n = nextVersionNumber(listVersionsForObject(userId, obj.id));
  const v = makeVersion(obj, createdBy, n, `Version ${n}`);
  upsertLocal(userId, v);
  return v;
}

/**
 * Guarantee every object has a v1, and keep it publishable.
 *
 * Draft saves deliberately do not add versions — that is what stopped history
 * growing on its own. But it also left a brand-new object with an empty
 * history and nothing to publish until the author happened to submit.
 *
 * So: the first save commits v1, and while v1 is still the ONLY version it
 * tracks the working copy, so it always holds real content rather than the
 * empty shell the object was created as. The moment an author deliberately
 * makes a v2, v1 freezes — from then on it is the original state, which is
 * exactly what the rest of the model promises about it.
 *
 * Never adds a second version, so this cannot reintroduce surprise versions.
 */
export function ensureInitialVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
): Version | null {
  const existing = listVersionsForObject(userId, obj.id);

  if (!existing.length) {
    const v = makeVersion(obj, createdBy, 1, 'Initial version');
    upsertLocal(userId, v);
    return v;
  }

  // Only ever touch a lone v1 — and not once it is locked or published, where
  // the content has been promised to someone.
  if (existing.length !== 1) return null;
  const v1 = existing[0];
  if (v1.versionNumber !== 1 || v1.locked || v1.publishedAt) return null;
  if (!readAll(userId).some((v) => v.id === v1.id)) return null; // seed row
  if (v1.snapshot && contentEqualsSnapshot(v1.snapshot, obj)) return null;

  const refreshed: Version = {
    ...v1,
    objectTitle: obj.title,
    status: obj.status,
    snapshot: snapshotFromObject(obj),
  };
  upsertLocal(userId, refreshed);
  return refreshed;
}

/** Explicit “Save as new version” — appends a new numbered snapshot (skips if identical & no note). */
export function saveAsNewVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
  notes?: string,
  /** Commit even when the content is unchanged — the author asked for a version. */
  force = false,
): Version {
  const existing = listVersionsForObject(userId, obj.id);
  const tip = existing[0];
  if (!force && tip?.snapshot && contentEqualsSnapshot(tip.snapshot, obj) && !(notes || '').trim()) {
    return tip;
  }
  const n = nextVersionNumber(existing);
  const v = makeVersion(
    obj,
    createdBy,
    n,
    (notes || '').trim() || (n === 1 ? 'Initial version' : `Version ${n}`),
  );
  upsertLocal(userId, v);
  return v;
}

/**
 * Overwrite an EXISTING version in place, keeping its id and number.
 *
 * Submitting always minted a new version, so an author fixing a typo three
 * times ended up at v5 with four dead versions behind it. "Submit as → v2"
 * replaces v2's snapshot instead of growing the history.
 *
 * Refuses on a locked version and on seed rows (which live in data.ts and have
 * no local record to replace) rather than silently creating a new version —
 * the author asked to overwrite a specific one, and quietly doing something
 * else is worse than saying no.
 */
export function overwriteVersion(
  userId: string,
  versionId: string,
  obj: LearningObject,
  createdBy: string,
  notes?: string,
): { ok: boolean; version?: Version; error?: string } {
  const target = listVersionsForObject(userId, obj.id).find((v) => v.id === versionId);
  if (!target) return { ok: false, error: 'That version no longer exists.' };
  if (target.locked) return { ok: false, error: `v${target.versionNumber} is locked.` };
  // v1 is the original state — the one thing you can always compare against.
  if (target.versionNumber === 1) {
    return { ok: false, error: 'v1 is the original state and cannot be replaced. Submit as a new version instead.' };
  }

  const version: Version = {
    ...target,
    objectTitle: obj.title,
    status: obj.status,
    createdAt: today(),
    createdBy,
    notes: (notes || '').trim() || target.notes,
    editCount: (target.editCount || 0) + 1,
    snapshot: snapshotFromObject(obj),
    // Amend clock reset: an overwrite is a deliberate commit, not the tail of
    // an earlier edit burst, so the next save must not fold into it.
    ...({ createdAtMs: 0 } as any),
  };
  upsertLocal(userId, version);
  return { ok: true, version };
}

/**
 * Close the amend window on the tip so the next content-differing save
 * commits a new version (e.g. author reopened the object from the library).
 */
export function sealVersionTip(userId: string, objectId: string): void {
  const localOnly = readAll(userId).filter((v) => v.objectId === objectId);
  if (!localOnly.length) return;
  const tip = localOnly.reduce((a, b) => (a.versionNumber >= b.versionNumber ? a : b));
  if (tip.locked) return;
  if ((tip as any).createdAtMs === 0) return;
  upsertLocal(userId, { ...tip, ...( { createdAtMs: 0 } as any ) });
}

export function setVersionLocked(
  userId: string,
  versionId: string,
  locked: boolean,
): Version | null {
  const all = readAll(userId);
  const hit = all.find((v) => v.id === versionId);
  if (!hit) return null;
  if (hit.locked === locked) return hit;
  const next = { ...hit, locked };
  writeAll(userId, all.map((v) => (v.id === versionId ? next : v)));
  return next;
}

/** Drop every local version for an object (e.g. when the object itself is deleted). */
export function deleteVersionsForObject(userId: string, objectId: string): void {
  const all = readAll(userId);
  const next = all.filter((v) => v.objectId !== objectId);
  if (next.length !== all.length) writeAll(userId, next);
}

/**
 * Discard every version above `versionNumber` — the history side of a restore.
 *
 * Restoring to v2 with v3 and v4 still listed leaves the author looking at
 * versions newer than the content they now have, so the list stops describing
 * the object. Truncating makes the restored version the tip again.
 *
 * Refuses rather than partially applying when something above cannot be
 * discarded: a locked version is a promise it will not change, and deleting it
 * breaks that promise more thoroughly than editing would. Seed catalogue rows
 * are likewise not ours to remove. The caller reports the reason so the author
 * can unlock and retry.
 */
export function truncateVersionsAfter(
  userId: string,
  objectId: string,
  versionNumber: number,
): { ok: boolean; removed: number; error?: string } {
  const above = listVersionsForObject(userId, objectId)
    .filter((v) => v.versionNumber > versionNumber);
  if (!above.length) return { ok: true, removed: 0 };

  const locked = above.filter((v) => v.locked);
  if (locked.length) {
    const names = locked.map((v) => `v${v.versionNumber}`).join(', ');
    return { ok: false, removed: 0, error: `Unlock ${names} before restoring past ${names.includes(',') ? 'them' : 'it'}.` };
  }

  const localIds = new Set(readAll(userId).map((v) => v.id));
  const undeletable = above.filter((v) => !localIds.has(v.id));
  if (undeletable.length) {
    const names = undeletable.map((v) => `v${v.versionNumber}`).join(', ');
    return { ok: false, removed: 0, error: `Demo catalog versions (${names}) can’t be removed.` };
  }

  const discard = new Set(above.map((v) => v.id));
  const kept = readAll(userId).filter((v) => !discard.has(v.id));
  // The restored version becomes the tip, and carries the live flag if the
  // version that held it was just discarded.
  const tookLive = above.some((v) => v.isLive);
  writeAll(
    userId,
    tookLive
      ? kept.map((v) => (
        v.objectId === objectId
          ? { ...v, isLive: v.versionNumber === versionNumber }
          : v
      ))
      : kept,
  );
  return { ok: true, removed: above.length };
}

/**
 * Record which version is live in the shared library.
 *
 * Exactly one per object: the shared table holds a single row per object, so
 * two versions marked published would be a claim the data cannot support. The
 * flag is cleared from every sibling as it is set here.
 *
 * Call this only after the upload succeeds — a version marked published that
 * never reached the library is worse than one that is silently up to date.
 */
export function markVersionPublished(
  userId: string,
  objectId: string,
  versionId: string,
): Version | null {
  const all = readAll(userId);
  const hit = all.find((v) => v.id === versionId);
  if (!hit) return null;
  const stamp = new Date().toISOString();
  writeAll(
    userId,
    all.map((v) => {
      if (v.objectId !== objectId) return v;
      if (v.id === versionId) return { ...v, publishedAt: stamp };
      return v.publishedAt ? { ...v, publishedAt: undefined } : v;
    }),
  );
  return { ...hit, publishedAt: stamp };
}

/** Clear the published mark for an object (nothing of ours is live anymore). */
export function clearVersionPublished(userId: string, objectId: string): void {
  const all = readAll(userId);
  if (!all.some((v) => v.objectId === objectId && v.publishedAt)) return;
  writeAll(
    userId,
    all.map((v) => (
      v.objectId === objectId && v.publishedAt ? { ...v, publishedAt: undefined } : v
    )),
  );
}

export function deleteVersion(userId: string, versionId: string): { ok: boolean; error?: string } {
  const all = readAll(userId);
  const hit = all.find((v) => v.id === versionId);
  if (!hit) {
    // Seed rows can't be deleted from the demo catalog.
    if (SEED_VERSIONS.some((v) => v.id === versionId)) {
      return { ok: false, error: 'Demo catalog versions can’t be deleted.' };
    }
    return { ok: false, error: 'Version not found.' };
  }
  if (hit.locked) {
    return { ok: false, error: 'Unlock this version before deleting it.' };
  }
  const siblings = all.filter((v) => v.objectId === hit.objectId);
  if (siblings.length <= 1) {
    return { ok: false, error: 'Keep at least one version for this content.' };
  }
  const next = all.filter((v) => v.id !== versionId);
  // If we removed the live pointer, promote the newest remaining sibling.
  if (hit.isLive) {
    const remaining = next
      .filter((v) => v.objectId === hit.objectId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    if (remaining[0]) {
      writeAll(
        userId,
        next.map((v) => (
          v.objectId === hit.objectId
            ? { ...v, isLive: v.id === remaining[0].id }
            : v
        )),
      );
      return { ok: true };
    }
  }
  writeAll(userId, next);
  return { ok: true };
}

export function setLiveVersion(userId: string, versionId: string): Version | null {
  const all = readAll(userId);
  const hit = all.find((v) => v.id === versionId);
  if (!hit) return null;
  writeAll(
    userId,
    all.map((v) => (
      v.objectId === hit.objectId
        ? { ...v, isLive: v.id === versionId }
        : v
    )),
  );
  return { ...hit, isLive: true };
}
