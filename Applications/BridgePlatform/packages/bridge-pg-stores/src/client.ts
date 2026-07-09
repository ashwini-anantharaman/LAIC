// Server-side Supabase client for the store implementations. Uses the
// service-role key (RLS bypass) — NEVER expose to a browser. Tenant checks
// live in the service layer (SessionService / ProgressService / etc.), which
// is the architecture's deliberate posture (execution plan §6).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PgConfig {
  url: string;
  serviceRoleKey: string;
}

export function createPgClient(config: PgConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Throw with a readable message on any PostgREST error. All reads in this
 * package select arrays, so a null data (mutations without .select()) safely
 * coerces to [] for the callers that ignore it.
 */
export function check<T>(
  res: { data: T | null; error: { message: string; code?: string } | null },
  what: string,
): T {
  if (res.error) throw new Error(`[pg-stores] ${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}
