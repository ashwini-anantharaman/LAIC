import type { LearningObject } from './types';

/** Hard-coded demo logins for local / prototype use. */
export const DEMO_ACCOUNTS = [
  {
    userId: 'demo-cd',
    email: '1@gmail.com',
    password: '123456',
    label: 'Course Developer',
  },
] as const;

export const DEMO_CD_USER_ID = 'demo-cd';

/** Content-developer personas whose local saves should roll into the email demo account. */
const CONTENT_DEV_USER_IDS = ['demo-cd', 'sam', 'chen'] as const;

const SESSION_KEY = 'laic-session-user';
const objectsKey = (userId: string) => `laic-created-objects:${userId}`;

export function authenticateDemo(email: string, password: string): string | null {
  const e = email.trim().toLowerCase();
  const hit = DEMO_ACCOUNTS.find((a) => a.email === e && a.password === password);
  return hit ? hit.userId : null;
}

export function isDemoCdUser(userId: string): boolean {
  return userId === DEMO_CD_USER_ID;
}

export function readSessionUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeSessionUserId(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadUserObjects(userId: string): LearningObject[] {
  try {
    const raw = localStorage.getItem(objectsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserObjects(userId: string, objects: LearningObject[]) {
  try {
    localStorage.setItem(objectsKey(userId), JSON.stringify(objects));
  } catch (err) {
    console.warn('[demoAuth] could not persist objects:', err);
  }
}

/** Merge by id; keep the newer updatedAt when both exist. */
export function mergeObjects(a: LearningObject[], b: LearningObject[]): LearningObject[] {
  const map = new Map<string, LearningObject>();
  for (const o of [...a, ...b]) {
    const prev = map.get(o.id);
    if (!prev || String(o.updatedAt) >= String(prev.updatedAt)) map.set(o.id, o);
  }
  return [...map.values()].sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
}

function claimForDemoCd(objects: LearningObject[]): LearningObject[] {
  return objects.map((o) => ({
    ...o,
    ownerId: DEMO_CD_USER_ID,
    ownerName: o.ownerName || 'Course Dev Demo',
  }));
}

/** Collect every locally persisted library (all user keys). */
function loadAllLocalObjectStores(): LearningObject[] {
  let merged: LearningObject[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('laic-created-objects:')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) merged = mergeObjects(merged, parsed);
      } catch {
        /* skip bad entries */
      }
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/**
 * Hydrate the 1@gmail.com (demo-cd) library: merge this account's saves with
 * other content-dev local stores, re-own them, and persist under demo-cd.
 */
export function loadDemoCdLibrary(): LearningObject[] {
  let merged: LearningObject[] = [];
  for (const id of CONTENT_DEV_USER_IDS) {
    merged = mergeObjects(merged, loadUserObjects(id));
  }
  // Also pick up anything under other keys (e.g. older sessions).
  merged = mergeObjects(merged, loadAllLocalObjectStores());
  const claimed = claimForDemoCd(merged);
  saveUserObjects(DEMO_CD_USER_ID, claimed);
  return claimed;
}

/** Which remote objects belong on the demo CD account. */
export function remoteObjectsForDemoCd(all: LearningObject[]): LearningObject[] {
  const cdIds = new Set<string>(CONTENT_DEV_USER_IDS);
  return all.filter((o) => cdIds.has(o.ownerId) || !o.ownerId);
}
