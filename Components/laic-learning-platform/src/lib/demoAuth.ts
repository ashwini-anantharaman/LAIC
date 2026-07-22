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
/** Canonical backup key for the email demo account (survives user-id renames). */
const DEMO_EMAIL_OBJECTS_KEY = 'laic-created-objects:1@gmail.com';

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

function parseObjects(raw: string | null): LearningObject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadUserObjects(userId: string): LearningObject[] {
  try {
    return parseObjects(localStorage.getItem(objectsKey(userId)));
  } catch {
    return [];
  }
}

/**
 * Strip heavy inline media from pipeline drafts so libraries fit in localStorage.
 * Keeps structure needed to reopen the editor; media can be re-uploaded.
 */
function slimForStorage(objects: LearningObject[]): LearningObject[] {
  return objects.map((o) => {
    if (!o.pipelineDraft) return o;
    const d = { ...o.pipelineDraft } as any;
    if (Array.isArray(d.sources)) {
      d.sources = d.sources.map((s: any) => {
        if (!s || typeof s !== 'object') return s;
        const next = { ...s };
        // Drop huge base64 / data-URL payloads; keep names + metadata.
        if (typeof next.dataUrl === 'string' && next.dataUrl.length > 2000) delete next.dataUrl;
        if (typeof next.content === 'string' && next.content.length > 50_000) {
          next.content = next.content.slice(0, 50_000);
          next.contentTruncated = true;
        }
        if (typeof next.text === 'string' && next.text.length > 50_000) {
          next.text = next.text.slice(0, 50_000);
          next.textTruncated = true;
        }
        if (Array.isArray(next.images)) {
          next.images = next.images.map((img: any) => {
            if (!img || typeof img !== 'object') return img;
            const i = { ...img };
            if (typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:') && i.dataUrl.length > 2000) {
              delete i.dataUrl;
              i.stripped = true;
            }
            return i;
          });
        }
        return next;
      });
    }
    if (Array.isArray(d.media)) {
      d.media = d.media.map((m: any) => {
        if (!m || typeof m !== 'object') return m;
        const next = { ...m };
        if (typeof next.dataUrl === 'string' && next.dataUrl.startsWith('data:') && next.dataUrl.length > 2000) {
          delete next.dataUrl;
          next.stripped = true;
        }
        return next;
      });
    }
    return { ...o, pipelineDraft: d };
  });
}

export type SaveObjectsResult = { ok: boolean; slimmed: boolean; error?: string };

/**
 * Persist a user's library. Never overwrites existing non-empty data with an
 * empty array (that race was wiping the demo account on every login).
 */
export function saveUserObjects(
  userId: string,
  objects: LearningObject[],
  opts?: { allowEmpty?: boolean },
): SaveObjectsResult {
  try {
    if (!opts?.allowEmpty && objects.length === 0) {
      const existing = loadUserObjects(userId);
      if (existing.length > 0) {
        console.warn('[demoAuth] refused to wipe non-empty library with empty list for', userId);
        return { ok: false, slimmed: false, error: 'refused-empty-overwrite' };
      }
    }

    const key = objectsKey(userId);
    const write = (payload: LearningObject[]) => {
      const json = JSON.stringify(payload);
      localStorage.setItem(key, json);
      if (isDemoCdUser(userId)) {
        localStorage.setItem(DEMO_EMAIL_OBJECTS_KEY, json);
      }
    };

    try {
      write(objects);
      return { ok: true, slimmed: false };
    } catch (err: any) {
      // Quota exceeded — retry without heavy inline media.
      if (err?.name === 'QuotaExceededError' || /quota/i.test(String(err?.message || err))) {
        const slimmed = slimForStorage(objects);
        write(slimmed);
        console.warn('[demoAuth] persisted slimmed library (quota)');
        return { ok: true, slimmed: true };
      }
      throw err;
    }
  } catch (err: any) {
    console.warn('[demoAuth] could not persist objects:', err);
    return { ok: false, slimmed: false, error: String(err?.message || err) };
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
      merged = mergeObjects(merged, parseObjects(raw));
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
  try {
    merged = mergeObjects(merged, parseObjects(localStorage.getItem(DEMO_EMAIL_OBJECTS_KEY)));
  } catch {
    /* ignore */
  }
  // Also pick up anything under other keys (e.g. older sessions).
  merged = mergeObjects(merged, loadAllLocalObjectStores());
  const claimed = claimForDemoCd(merged);
  if (claimed.length > 0) {
    saveUserObjects(DEMO_CD_USER_ID, claimed);
  }
  return claimed;
}

/** Which remote objects belong on the demo CD account. */
export function remoteObjectsForDemoCd(all: LearningObject[]): LearningObject[] {
  const cdIds = new Set<string>(CONTENT_DEV_USER_IDS);
  return all.filter((o) => cdIds.has(o.ownerId) || !o.ownerId);
}
