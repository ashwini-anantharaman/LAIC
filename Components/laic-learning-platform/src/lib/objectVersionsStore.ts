/**
 * Local-first learning-object versions.
 * Head object in the library stays editable; versions are immutable numbered
 * snapshots (created on first save, then only via “Save as new version”).
 * They can be locked, previewed, or deleted — never overwritten by later edits.
 */

import type { LearningObject, ObjectVersionSnapshot, Version } from './types';
import { VERSIONS as SEED_VERSIONS } from './data';

const KEY = (userId: string) => `laic-object-versions:${userId || 'anon'}`;

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

/**
 * Ensure the object has at least one frozen local version (v1 on first save).
 * Does not rewrite existing snapshots — later edits live on the head object only.
 * Use saveAsNewVersion to checkpoint the current head as v2, v3, …
 */
export function syncWorkingVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
): Version {
  const localOnly = readAll(userId).filter((v) => v.objectId === obj.id);
  if (localOnly.length) {
    return localOnly.reduce((a, b) => (a.versionNumber >= b.versionNumber ? a : b));
  }

  const existing = listVersionsForObject(userId, obj.id);
  const n = existing.length ? nextVersionNumber(existing) : 1;
  const v: Version = {
    id: versionIdFor(obj.id, n),
    objectId: obj.id,
    objectTitle: obj.title,
    versionNumber: n,
    status: obj.status,
    createdAt: obj.updatedAt || today(),
    createdBy,
    isLive: n === 1 && (obj.status === 'published' || obj.status === 'approved'),
    notes: n === 1 ? 'Initial version' : `Local snapshot (v${n})`,
    locked: false,
    snapshot: snapshotFromObject(obj),
  };
  upsertLocal(userId, v);
  return v;
}

/** Explicit “Save as new version” — always appends a new numbered snapshot. */
export function saveAsNewVersion(
  userId: string,
  obj: LearningObject,
  createdBy: string,
  notes?: string,
): Version {
  const existing = listVersionsForObject(userId, obj.id);
  const n = nextVersionNumber(existing);
  const v: Version = {
    id: versionIdFor(obj.id, n),
    objectId: obj.id,
    objectTitle: obj.title,
    versionNumber: n,
    status: obj.status,
    createdAt: today(),
    createdBy,
    isLive: n === 1 && (obj.status === 'published' || obj.status === 'approved'),
    notes: (notes || '').trim() || (n === 1 ? 'Initial version' : `Version ${n}`),
    locked: false,
    snapshot: snapshotFromObject(obj),
  };
  upsertLocal(userId, v);
  return v;
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
