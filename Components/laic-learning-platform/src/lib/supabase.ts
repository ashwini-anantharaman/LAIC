import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LearningObject } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when the project isn't configured — callers must fall back gracefully. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const supabaseEnabled = !!supabase;

/** Public storage bucket that holds tutorial images. */
const BUCKET = 'media';
/** Table that persists saved learning objects (drafts, in-review, etc.). */
const TABLE = 'learning_objects';

/**
 * Upload an image to Supabase Storage and return its public URL.
 * Throws if Supabase isn't configured or the upload fails — callers decide
 * whether to fall back (e.g. to an inline data URL).
 */
export async function uploadImage(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
    created_at: obj.createdAt,
    updated_at: obj.updatedAt,
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
  };
}

/** Insert or update a learning object. Best-effort — throws on failure. */
export async function saveObject(obj: LearningObject): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from(TABLE).upsert(toRow(obj), { onConflict: 'id' });
  if (error) throw error;
}

/** Fetch all saved learning objects, newest first. */
export async function listObjects(): Promise<LearningObject[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(TABLE).select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}
