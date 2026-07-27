/**
 * Public per-object URLs for Content Studio embeds.
 * Path: /o/<objectId>
 */

import type { LearningObject } from './types';
import { OBJECTS } from './data';
import { loadDemoCdLibrary, loadUserObjects, DEMO_CD_USER_ID } from './demoAuth';

const EMBED_PREFIX = '/o/';

export function objectEmbedPath(objectId: string): string {
  return `${EMBED_PREFIX}${encodeURIComponent(objectId)}`;
}

/** Absolute URL for the current origin (studio host). */
export function objectEmbedUrl(objectId: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${origin.replace(/\/+$/, '')}${objectEmbedPath(objectId)}`;
}

/** Parse `/o/:id` (and optional trailing slash / query). */
export function parseObjectEmbedId(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): string | null {
  const m = pathname.match(/^\/o\/([^/]+)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function isObjectEmbedPath(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return Boolean(parseObjectEmbedId(pathname));
}

/** Resolve an object for public embed (seed catalog + local saved libraries). */
export function resolveLearningObject(objectId: string): LearningObject | null {
  const fromSeed = OBJECTS.find((o) => o.id === objectId);
  if (fromSeed) return fromSeed;

  try {
    const demo = loadDemoCdLibrary().find((o) => o.id === objectId);
    if (demo) return demo;
  } catch {
    /* ignore */
  }

  try {
    const fromCd = loadUserObjects(DEMO_CD_USER_ID).find((o) => o.id === objectId);
    if (fromCd) return fromCd;
  } catch {
    /* ignore */
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('laic-created-objects:')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let list: LearningObject[] = [];
      try {
        list = JSON.parse(raw) as LearningObject[];
      } catch {
        continue;
      }
      if (!Array.isArray(list)) continue;
      const hit = list.find((o) => o?.id === objectId);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }

  return null;
}
