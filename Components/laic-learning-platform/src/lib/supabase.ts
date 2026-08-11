/**
 * Learning-object persistence — now proxied through Nexus (Option B), NOT a
 * direct Supabase client. The browser sends its Nexus session token and the
 * backend scopes every read/write to the caller's org (RLS-safe, no public
 * anon reads). Keeps the original function names/shapes so callers are
 * unchanged except that `supabaseEnabled` is now a call (runtime: do we have a
 * Nexus session?). The file name is kept to minimise churn.
 */
import type { LearningObject } from './types';
import { nexusFetch, getToken, getProgramId } from './nexus';

/** Remote persistence is available when we have a Nexus session (post-launch). */
export function supabaseEnabled(): boolean {
  return !!getToken();
}

/**
 * "Upload" an image. In the Nexus-proxied model there's no client storage
 * bucket, so we inline the image as a data URL — matching how the migrated
 * learning content already embeds its images. Dependency-free, always works.
 */
export async function uploadImage(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read image'));
    r.readAsDataURL(file);
  });
}

/* ─── row <-> LearningObject mapping ─────────────────────────────── */

function toRow(obj: LearningObject) {
  return {
    id: obj.id,
    type: obj.type,
    title: obj.title,
    owner_id: obj.ownerId,
    owner_name: obj.ownerName,
    status: obj.status,
    scope: obj.scope,
    reuse_count: obj.reuseCount,
    description: obj.description,
    estimated_time: obj.estimatedTime,
    blocks: obj.blocks,
    tags: obj.tags,
    source_ids: obj.sourceIds,
    collection_ids: obj.collectionIds?.length
      ? obj.collectionIds
      : (obj.collectionId ? [obj.collectionId] : []),
    collection_id: obj.collectionIds?.[0] ?? obj.collectionId ?? null,
    pipeline_draft: obj.pipelineDraft ?? null,
    created_at: obj.createdAt,
    updated_at: obj.updatedAt,
  };
}

/**
 * Row for the standalone publish path (no Nexus session): same shape the
 * Nexus backend stores, plus resolved folder names so consumer apps can show
 * folders without knowing this app's collection ids.
 */
export function objectToPublishRow(
  obj: LearningObject,
  collectionNames: string[],
  /** Version this content came from, when publishing one explicitly. */
  versionNumber?: number,
): Record<string, unknown> {
  return {
    ...toRow(obj),
    collection_names: collectionNames,
    ...(versionNumber != null ? { version_number: versionNumber } : {}),
  };
}

function fromRow(row: any): LearningObject {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    ownerId: row.owner_id ?? '',
    ownerName: row.owner_name ?? '',
    status: row.status,
    scope: row.scope ?? 'bridge',
    reuseCount: row.reuse_count ?? 0,
    description: row.description ?? '',
    estimatedTime: row.estimated_time ?? '',
    blocks: row.blocks ?? [],
    createdAt: (row.created_at ?? '').slice(0, 10),
    updatedAt: (row.updated_at ?? '').slice(0, 10),
    tags: row.tags ?? [],
    sourceIds: row.source_ids ?? [],
    collectionIds: Array.isArray(row.collection_ids) && row.collection_ids.length
      ? row.collection_ids
      : (row.collection_id ? [row.collection_id] : undefined),
    collectionId: row.collection_id ?? undefined,
    pipelineDraft: row.pipeline_draft ?? undefined,
  };
}

/** Insert or update a learning object via Nexus. Throws on failure. */
export async function saveObject(obj: LearningObject): Promise<void> {
  const res = await nexusFetch('/api/platform/learning/objects', {
    method: 'PUT',
    body: JSON.stringify({ ...toRow(obj), program_id: getProgramId() }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

/** Fetch all learning objects for the caller's org, newest first. */
export async function listObjects(): Promise<LearningObject[]> {
  if (!getToken()) return [];
  const pid = getProgramId();
  const qs = pid ? `?program_id=${encodeURIComponent(pid)}` : '';
  const res = await nexusFetch(`/api/platform/learning/objects${qs}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(fromRow);
}

/**
 * Fetch ONE object through the PUBLIC share endpoint — no session required.
 *
 * This is what makes an /o/<id> link portable. fetchObject below returns null
 * without a token, and the viewer then fell back to localStorage, so a link only
 * ever resolved in the browser that authored the object. Anyone else — another
 * machine, an incognito window, the app's webview — saw "Content not found".
 *
 * Returns null when the object is not published (the server reports that exactly
 * like a missing id, by design), so callers must treat null as "no public copy"
 * rather than "does not exist".
 */
export async function fetchPublicObject(id: string): Promise<LearningObject | null> {
  try {
    const res = await nexusFetch(`/api/public/learning/objects/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return fromRow(await res.json());
  } catch {
    return null;
  }
}

/**
 * Publish (or unpublish) an object so its /o/<id> link works for anyone holding
 * it. Authoring access required; the server enforces that.
 *
 * Sharing is per object and opt-in: without it, an anonymous reader could reach
 * anything by guessing an id.
 */
export async function setObjectShared(id: string, shared = true): Promise<boolean> {
  try {
    const res = await nexusFetch(
      `/api/platform/learning/objects/${encodeURIComponent(id)}/share`,
      { method: 'PUT', body: JSON.stringify({ shared, program_id: getProgramId() }) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch ONE learning object (full content) — used by the embedded viewer so
 *  it never downloads the whole org library to render a single object. */
export async function fetchObject(id: string): Promise<LearningObject | null> {
  if (!getToken()) return null;
  const pid = getProgramId();
  const qs = pid ? `?program_id=${encodeURIComponent(pid)}` : '';
  const res = await nexusFetch(`/api/platform/learning/objects/${encodeURIComponent(id)}${qs}`);
  if (!res.ok) return null;
  return fromRow(await res.json());
}
