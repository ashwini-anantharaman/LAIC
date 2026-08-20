/**
 * Who administers an APP's content — the other end of an `app` grant.
 *
 * A content manager grants an object to an app, and "an app" cannot decide
 * anything. Its ADMINISTRATORS do: they see what has been granted and choose
 * what actually goes on the app, and for which club. This is the register of who
 * those people are, per program, per app.
 *
 * Stored in platform_settings rather than a table, the same way club-app roles
 * are (appRoles.ts) — a program can appoint its first app administrator without a
 * migration, and the shape is a map, not a graph.
 *
 * Profile ids, not emails. The grants table keys people by profile id
 * (subject_type 'profile'), the club roster returns profile ids, and mixing the
 * two identifiers across one feature is how "why can't they see it" becomes a
 * half-hour of debugging. Learning-role assignment keys by email for its own
 * historical reasons; this does not copy that.
 */
import * as db from "../platformDb";

/** appKey → the profile ids that administer that app's content. */
export type ContentAppAdmins = Record<string, string[]>;

const key = (programId: string) => `content_app_admins:${programId}`;

export async function listContentAppAdmins(programId: string): Promise<ContentAppAdmins> {
  const raw = (await db.getPlatformSetting(key(programId))) as ContentAppAdmins | null;
  if (!raw || typeof raw !== "object") return {};
  // Shape defensively: a hand-edited setting must not put a string where a list
  // belongs and have every membership test silently answer false.
  const out: ContentAppAdmins = {};
  for (const [appKey, ids] of Object.entries(raw)) {
    if (Array.isArray(ids)) out[appKey] = [...new Set(ids.filter((i) => typeof i === "string"))];
  }
  return out;
}

/** Replace the administrators of ONE app, leaving the other apps alone. */
export async function setContentAppAdmins(
  programId: string,
  appKey: string,
  profileIds: string[],
): Promise<ContentAppAdmins> {
  const all = await listContentAppAdmins(programId);
  const next: ContentAppAdmins = { ...all };
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length) next[appKey] = ids;
  else delete next[appKey]; // an app with no administrators has no key, not an empty one
  await db.setPlatformSetting(key(programId), next as unknown as Record<string, unknown>);
  return next;
}

/** The apps this person administers in this program. Empty = none. */
export async function appsAdministeredBy(
  programId: string,
  profileId: string | null | undefined,
): Promise<string[]> {
  if (!profileId) return [];
  const all = await listContentAppAdmins(programId);
  return Object.entries(all)
    .filter(([, ids]) => ids.includes(profileId))
    .map(([appKey]) => appKey);
}

export async function administersApp(
  programId: string,
  profileId: string | null | undefined,
  appKey: string,
): Promise<boolean> {
  return (await appsAdministeredBy(programId, profileId)).includes(appKey);
}
