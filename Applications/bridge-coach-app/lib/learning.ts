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
 * PUBLISHED IS THE STAMP. Nothing else.
 *
 * `published_at` is set only when an author presses publish on a specific version,
 * and unpublishing clears it — along with version_number, while status goes back to
 * 'draft' (author's note, 2026-08-12). So the stamp is the single fact that means
 * "meant for learners".
 *
 * This removes an exception I had here: a row whose STATUS said "published" used to
 * pass without a stamp, on the reasoning that it might predate stamping. That is now
 * a LEAK rather than a kindness — drafts sync into the same table as backups, so an
 * unstamped row is at least as likely to be someone's work in progress as it is to be
 * old published content. Showing a draft to a learner is the worse error.
 *
 * The status check stays as a second gate, not the primary one: a row carrying a
 * stamp AND an explicitly private status is contradictory, and the safe reading of a
 * contradiction is to hide it.
 *
 * The direct Supabase read applies the same rule server-side
 * (`.not("published_at", "is", null)`), so both paths agree.
 */
const LEARNER_HIDDEN = new Set(["draft", "archived", "deleted"]);

function isVisibleToLearners(o: LearningObject): boolean {
  if (!o.published_at) return false;
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
