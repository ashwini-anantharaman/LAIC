import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSettings } from "./config";

// Supabase helpers. Cache and course operations are best-effort where noted;
// hard failures on platform mutations return errors to the caller.

let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

// Server-side clients never persist or refresh sessions.
const SERVER_AUTH = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function _getClient(): SupabaseClient | null {
  if (_client) return _client;
  const settings = getSettings();
  if (!settings.supabaseEnabled) return null;
  try {
    _client = createClient(settings.supabaseUrl, settings.supabaseServiceRoleKey, SERVER_AUTH);
    return _client;
  } catch {
    return null;
  }
}

/** Service-role client reserved for admin auth APIs (never sign-in). */
export function requireAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const settings = getSettings();
  if (!settings.supabaseEnabled) throw new Error("Supabase is not configured");
  _adminClient = createClient(settings.supabaseUrl, settings.supabaseServiceRoleKey, SERVER_AUTH);
  return _adminClient;
}

export function createEphemeralClient(): SupabaseClient {
  const settings = getSettings();
  if (!settings.supabaseEnabled) throw new Error("Supabase is not configured");
  return createClient(settings.supabaseUrl, settings.supabaseServiceRoleKey, SERVER_AUTH);
}

export function requireClient(): SupabaseClient {
  const client = _getClient();
  if (client === null) throw new Error("Supabase is not configured");
  return client;
}
