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

function writeAll(userId: string, list: Version[]) {
  localStorage.setItem(KEY(userId), JSON.stringify(list));
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

/** Explicit “Save as new version” — appends a new numbered snapshot (skips if identical & no note). */
export function saveAsNewVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
  notes?: string,
): Version {
  const existing = listVersionsForObject(userId, obj.id);
  const tip = existing[0];
  if (tip?.snapshot && contentEqualsSnapshot(tip.snapshot, obj) && !(notes || '').trim()) {
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
