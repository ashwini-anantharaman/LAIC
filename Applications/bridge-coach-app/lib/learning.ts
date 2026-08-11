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
  // A publish stamp is a definite yes.
  if (o.published_at) return true;
  // …and its ABSENCE means nothing, because nothing writes it on this path.
  //
  // I had this backwards and it hid the whole library: 0004 adds the column, so it
  // exists, and I read "exists but null" as "deliberately unpublished". But
  // upsertLearningObject — every write behind PUT /learning/objects, which is what
  // the Studio's save calls — does not set published_at or version_number at all.
  // So the stamp is null on every row that path has ever written, and requiring it
  // hid content that had been visible for weeks, including work published minutes
  // earlier.
  //
  // Until the publish path stamps the row, authoring status is the only signal
  // there is — read as a denylist, so a status this app has never seen still shows.
  return !LEARNER_HIDDEN.has((o.status ?? "").trim().toLowerCase());
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
