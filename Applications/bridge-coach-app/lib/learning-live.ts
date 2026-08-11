// Published learning content, read STRAIGHT from Supabase, with live updates.
//
// The Nexus API remains the fallback and is still the only path that works when
// this one cannot (see below) — nothing here replaces it, it front-runs it.
//
// WHY DIRECT AT ALL
// Realtime. An author publishes on a laptop and the phone should show it without
// anyone reopening the app. A REST round trip cannot do that; a websocket can.
//
// WHAT MAKES IT SAFE
//   • The ANON key ships in the client by design. It is not a credential on its
//     own: it identifies the project, and the row filter comes from the SIGNED-IN
//     USER's JWT, which is set on the client after sign-in. Without that JWT the
//     caller is `anon` and the policy matches nothing.
//   • RLS does the filtering, server-side. The org and published-only conditions
//     live in the policy (migration 0005), not here — the filters below are for
//     efficiency and clarity, and removing them would not widen what comes back.
//   • Read-only. No insert, update or delete is possible with this grant.
//   • The service_role key is never used and must never reach a client.
//
// STATE OF THE WORLD (checked against production)
// Columns published_at / version_number / collection_* exist — 0003 and 0004 are
// applied. 0005, which grants `authenticated` the SELECT and adds the policy and
// the Realtime publication, is NOT: `learning_caller_in_org` does not exist yet, so
// a signed-in read still returns zero rows. Until someone runs `npm run migrate`
// (which will pick 0005 up, since it is committed), every call here comes back
// empty and the caller falls through to the API — which is why this is written to
// report "nothing" rather than to throw.
//
// Publishing overwrites the row in place, so there is exactly one row per object
// and it is always the current published version. No version filtering is needed.

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import { LEARNING_ORG_ID, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import type { LearningObject } from "./nexus";

/** Exactly the columns the Learn tab renders. `blocks` is deliberately excluded:
 *  it is the renderable payload and can run to megabytes per row — the reader
 *  fetches it for ONE object when someone opens it. */
const LIST_COLUMNS =
  "id,type,title,description,estimated_time,owner_name,tags,status," +
  "collection_ids,collection_names,version_number,published_at,updated_at";

export const liveLearningConfigured = (): boolean =>
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!LEARNING_ORG_ID;

let client: SupabaseClient | null = null;
/** The session whose JWT the client currently carries, so a change is detectable. */
let clientToken: string | null = null;

/**
 * One client per session token.
 *
 * The user's JWT goes in the Authorization header, which is what makes RLS see
 * `authenticated` rather than `anon`. Auth persistence and refresh are off: this
 * app owns its session (auth-context) and a second thing trying to refresh the
 * same token would fight it.
 */
function getClient(token: string): SupabaseClient | null {
  if (!liveLearningConfigured()) return null;
  if (client && clientToken === token) return client;
  client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    // Realtime authorises the socket separately from REST.
    realtime: { params: { eventsPerSecond: 2 } },
  });
  client.realtime.setAuth(token);
  clientToken = token;
  return client;
}

/** A row as Postgres returns it → the shape the app already renders. */
function fromRow(r: Record<string, unknown>): LearningObject {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    id: String(r.id),
    type: String(r.type ?? ""),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    status: String(r.status ?? ""),
    owner_name: (r.owner_name as string | null) ?? null,
    estimated_time: (r.estimated_time as string | null) ?? null,
    tags: arr(r.tags),
    // The list read does not carry content; the reader fetches it per object.
    blocks: null,
    updated_at: (r.updated_at as string | null) ?? null,
    collection_ids: arr(r.collection_ids),
    collection_names: arr(r.collection_names),
    version_number: (r.version_number as number | null) ?? null,
    published_at: (r.published_at as string | null) ?? null,
  };
}

/**
 * Published content for the org, newest first.
 *
 * Returns null for "this path is unavailable" — not configured, errored, or RLS
 * gave nothing — which the caller reads as "use the API". An empty ARRAY would mean
 * "the org genuinely has nothing", and the two must not be confused: treating
 * unavailable as empty would blank a working Learn tab.
 */
export async function fetchLiveLearningObjects(token: string): Promise<LearningObject[] | null> {
  const sb = getClient(token);
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("learning_objects")
      .select(LIST_COLUMNS)
      .eq("organization_id", LEARNING_ORG_ID as string)
      .not("published_at", "is", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.warn("[learning-live] read failed, falling back to the API:", error.message);
      return null;
    }
    if (!data || data.length === 0) return null; // see the note above
    // Via `unknown`: supabase-js types an un-generated schema's rows loosely, and
    // the row shape is asserted by fromRow rather than by its inference.
    return (data as unknown as Record<string, unknown>[]).map(fromRow);
  } catch (e) {
    console.warn("[learning-live] read threw, falling back to the API:", (e as Error)?.message);
    return null;
  }
}

/**
 * Watch for published content changing, and call back with the fresh list.
 *
 * Every change re-reads the whole list rather than patching the payload in place.
 * A Realtime event can be an insert, an update that makes a row newly visible, or
 * one that hides it, and the ORDER can change too — reconciling all of that by hand
 * is where subtle staleness lives, and the list is small enough that a re-read is
 * cheaper than being wrong. RLS applies to the stream, so an event only arrives for
 * a row this subscriber could already read.
 *
 * Returns a teardown function; safe to call when unconfigured (it does nothing).
 */
export function subscribeToLiveLearning(
  token: string,
  onChange: (objects: LearningObject[]) => void,
): () => void {
  const sb = getClient(token);
  if (!sb) return () => {};

  let channel: RealtimeChannel | null = null;
  let closed = false;

  const reread = async () => {
    const next = await fetchLiveLearningObjects(token);
    if (!closed && next) onChange(next);
  };

  try {
    channel = sb
      .channel("learning_objects_published")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "learning_objects",
          // Server-side filter so the socket does not carry other orgs' traffic.
          filter: `organization_id=eq.${LEARNING_ORG_ID}`,
        },
        () => void reread(),
      )
      .subscribe();
  } catch (e) {
    console.warn("[learning-live] subscribe failed:", (e as Error)?.message);
  }

  return () => {
    closed = true;
    if (channel) void sb.removeChannel(channel);
  };
}
