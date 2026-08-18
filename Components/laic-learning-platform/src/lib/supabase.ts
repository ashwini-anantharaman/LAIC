/**
 * Learning-object persistence — now proxied through Nexus (Option B), NOT a
 * direct Supabase client. The browser sends its Nexus session token and the
 * backend scopes every read/write to the caller's org (RLS-safe, no public
 * anon reads). Keeps the original function names/shapes so callers are
 * unchanged except that `supabaseEnabled` is now a call (runtime: do we have a
 * Nexus session?). The file name is kept to minimise churn.
 */
import type { LearningObject } from './types';
import { nexusFetch, getToken, getProgramId, clearDeadSession } from './nexus';

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
  const row: Record<string, unknown> = {
    ...toRow(obj),
    collection_names: collectionNames,
    ...(versionNumber != null ? { version_number: versionNumber } : {}),
  };
  // Carry the authoring draft so reopening synced content resumes where it
  // left off instead of showing only the rendered blocks. pipeline_draft is
  // the one free-form jsonb column on the row.
  const authoring = (obj as any).tutorialV2Draft || (obj as any).tutorialV3Draft || (obj as any).structuredV2Draft;
  if (authoring) {
    row.pipeline_draft = {
      ...(obj.pipelineDraft as any || {}),
      ...((obj as any).tutorialV2Draft ? { tutorialV2Draft: (obj as any).tutorialV2Draft } : {}),
      ...((obj as any).tutorialV3Draft ? { tutorialV3Draft: (obj as any).tutorialV3Draft } : {}),
      ...((obj as any).structuredV2Draft ? { structuredV2Draft: (obj as any).structuredV2Draft } : {}),
    };
  }
  return row;
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

/**
 * Fetch ONE object through the PUBLIC share endpoint — no session required.
 *
 * This is what makes an /o/<id> link portable. The embed viewer otherwise resolves
 * ids only from the seed catalogue and THIS browser's localStorage, so a link
 * opened on another machine (or in a phone's webview) found nothing.
 *
 * Null means "no public copy": the server reports an unpublished object exactly
 * like a missing id, deliberately.
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
 * it. Authoring access required; the server enforces that. Sharing is per object
 * and opt-in — otherwise an anonymous reader could reach anything by guessing.
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

// ── Publishing, through Nexus ───────────────────────────────────────────────
// These four used to POST to the Content Studio's own server, which held the
// service-role key and accepted anyone: no session, no caller identity, and the
// owning org/program taken from environment variables. So content could not
// belong to the club that made it, and anybody who could reach that server could
// publish, unpublish or delete anything in the library.
//
// Same request bodies as before — only the door changed — so the call sites are
// unchanged apart from which helper they import.
//
// Each one needs a Nexus session. Without one the Studio is DRAFT-ONLY: authoring
// and local autosave still work, publishing does not, and `supabaseEnabled()` is
// how the UI knows which to offer.

/** Publish an object (and optionally make its /o/<id> link public). */
export async function publishObject(
  row: Record<string, unknown>,
  share = false,
): Promise<{ ok: boolean; id: string }> {
  // Say WHY, once, here — rather than letting every caller surface a bare 401.
  // Standalone is draft-only by design: without a session there is no way to know
  // which club the content belongs to, and guessing is what the old service-role
  // route did.
  if (!supabaseEnabled()) throw new Error('Publishing needs a Nexus session — open the Studio from Nexus');
  const res = await nexusFetch('/api/platform/learning/objects/publish', {
    method: 'POST',
    body: JSON.stringify({ object: row, share, program_id: getProgramId() }),
  });
  if (!res.ok) {
    // 409 is the one worth naming: the object belongs to another program, which a
    // generic "publish failed" would leave the author guessing about.
    if (res.status === 409) throw new Error('That object belongs to another program');
    // 401 means we HAD a token and Nexus refused it — expired, or spent by a
    // newer launch. The message above only fires when there is no token at all,
    // so without this an expired session surfaced as a bare number and the
    // Studio went on offering Publish against a dead token. Dropping it puts
    // the app back into draft-only, where the next attempt explains itself.
    if (res.status === 401) {
      clearDeadSession();
      throw new Error('Your Nexus session expired — relaunch the Studio from Nexus to publish');
    }
    throw new Error(`Publish failed (${res.status})`);
  }
  return res.json();
}

/** Withdraw an object from reader apps, keeping its content and draft backup. */
export async function unpublishObject(id: string): Promise<boolean> {
  const res = await nexusFetch('/api/platform/learning/objects/unpublish', {
    method: 'POST',
    body: JSON.stringify({ id, program_id: getProgramId() }),
  });
  return res.ok;
}

/** Remove an object from the shared store for good. */
export async function deleteObjectEverywhere(id: string): Promise<boolean> {
  const res = await nexusFetch(
    `/api/platform/learning/objects/${encodeURIComponent(id)}?program_id=${encodeURIComponent(getProgramId() ?? '')}`,
    { method: 'DELETE' },
  );
  return res.ok;
}

/** The author's library as raw rows, for the hydrate path that maps them itself. */
export async function fetchLibraryRows(): Promise<Record<string, unknown>[]> {
  const res = await nexusFetch(
    `/api/platform/learning/objects?program_id=${encodeURIComponent(getProgramId() ?? '')}`,
  );
  if (!res.ok) return [];
  return res.json();
}
