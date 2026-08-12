import { fetchLiveLearningObjects } from "./learning-live";
import { fetchLearningObjects, LearningObject } from "./nexus";

/**
 * Which content reaches a learner.
 *
 * A publish stamp (published_at, migration 0004) is a definite yes. Its absence is
 * not a no — see isVisibleToLearners for why. Otherwise the authoring status decides,
 * read as a denylist.
 *
 * Publishing overwrites the row in place, so there is exactly one row per object and
 * no version filtering is needed here.
 */
/**
 * What reaches a learner: the publish STAMP, or a status that says published.
 *
 * I tightened this to "stamp only, and status must not be private" and it hid content
 * that had been visible. Two reasons, both real:
 *
 *  1. A STAMPED ROW CAN CARRY ANY STATUS. The publish path writes
 *     `status: row.status || 'in-review'` (server/index.mjs) — it does not normalise
 *     status to "published". So a genuinely published version can sit there with
 *     status 'draft' or 'in-review', and my extra status gate hid exactly those.
 *  2. LEGACY PUBLISHED CONTENT HAS NO STAMP. published_at only started being written
 *     when the per-version publish button shipped. Everything published before that
 *     is stamp-less, and requiring the stamp retired it silently.
 *
 * So: the stamp is trusted ABSOLUTELY when present — whatever the status says — and a
 * status of "published" also passes, which is what carries the older content.
 *
 * The author's concern is still met: drafts sync into this table as backups, and a
 * draft has neither a stamp nor a published status, so none of them appear. What the
 * strict rule bought over this one was hiding stamp-less rows an author HAD published
 * — and that is the case that broke, not a leak it closed.
 */
const LEGACY_PUBLISHED = new Set(["published"]);

function isVisibleToLearners(o: LearningObject): boolean {
  if (o.published_at) return true;
  return LEGACY_PUBLISHED.has((o.status ?? "").trim().toLowerCase());
}

// Session-scoped cache so the detail screen can reuse the list fetch.
// Keyed by TOKEN: a fetch from a previous session resolving after sign-out
// must never leak another user's list into the next session.

// Keyed by token AND program: a club's library is not the app-wide program's, so
// one slot would serve the previous club's list after a switch.
let cached: { token: string; objects: LearningObject[] } | null = null;

export async function getLearningObjects(
  token: string,
  opts: { refresh?: boolean; programId?: string } = {},
): Promise<LearningObject[]> {
  const key = `${token}::${opts.programId ?? ""}`;
  if (!cached || cached.token !== key || opts.refresh) {
    // Straight from Supabase first — that path can also stream updates, so
    // preferring it keeps one source behind both the list and the live channel.
    // It returns null for "unavailable" (unconfigured, errored, or RLS gave
    // nothing), which is NOT the same as "the org has nothing": falling back on
    // null is what stops a working tab going blank.
    const live = await fetchLiveLearningObjects(token);
    const objects = live ?? (await fetchLearningObjects(token, opts.programId));
    cached = { token: key, objects: objects.filter(isVisibleToLearners) };
  }
  return cached.objects;
}

/** Replace the cache with rows a live update brought in. */
export function primeLearningCache(token: string, programId: string | undefined, objects: LearningObject[]): LearningObject[] {
  const filtered = objects.filter(isVisibleToLearners);
  cached = { token: `${token}::${programId ?? ""}`, objects: filtered };
  return filtered;
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

export function clearLearningCache(): void {
  cached = null;
}
