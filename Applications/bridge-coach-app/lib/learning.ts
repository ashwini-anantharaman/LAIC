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
 * A DENYLIST, not an allowlist — and that switch is the point.
 *
 * This tab has now hidden the library three times, each time because a filter here
 * listed what may pass and the Studio moved on: first `published` only (it uses
 * in-review/approved), then `type === "concept-card"`, then a publish stamp nothing
 * writes. An allowlist fails closed on every new value the authoring side invents,
 * and it fails SILENTLY — content simply is not there.
 *
 * So the rule is inverted: everything reaches a learner except states that are
 * definitely not for them. A status nobody here has heard of shows up, which is the
 * safer way to be wrong.
 */
const LEARNER_HIDDEN = new Set(["draft", "archived", "deleted"]);

function isVisibleToLearners(o: LearningObject): boolean {
  // PUBLISHED means an author pressed publish on a specific version. That act is
  // what stamps the row: the Studio's publish path sets version_number and
  // published_at together (server/index.mjs, publishLearningObjectRow), and only
  // when a version is named. So the stamp is the app's definition of published, and
  // nothing else qualifies.
  //
  // This is a REVERSAL of the previous commit, and the reason is that the fact
  // changed underneath it: an hour ago no writer existed, so requiring the stamp hid
  // everything. The per-version publish button now writes it.
  //
  // The consequence is deliberate: content that only ever went through the older
  // save path has no stamp and will not appear until someone publishes a version of
  // it. That is the point — "it was saved" is not "it was published".
  if (o.published_at) return true;

  // One exception, and it is about honesty rather than permissiveness: a row whose
  // status literally says published, from before stamping existed. Excluding it
  // would hide something an author did deliberately publish, just with an older
  // tool. Anything merely in-review or approved is NOT published and no longer
  // shows.
  const status = (o.status ?? "").trim().toLowerCase();
  if (status === "published" && !LEARNER_HIDDEN.has(status)) return true;

  return false;
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
