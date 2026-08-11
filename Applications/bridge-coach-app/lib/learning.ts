import { fetchLearningObjects, LearningObject } from "./nexus";

/**
 * Which authoring states reach a learner.
 *
 * Was `published` only, on the reasoning that anything else is authoring state.
 * The Content Studio in practice never leaves that state — content sits at
 * in-review or approved — so the Learn tab was empty while the library was full.
 * Owner direction: show both of those.
 *
 * `draft` stays out: it is genuinely unfinished, not merely unpublished. `published`
 * is kept so nothing that already qualified disappears.
 */
const LEARNER_VISIBLE = new Set(["in-review", "approved", "published"]);

function isVisibleToLearners(o: LearningObject): boolean {
  return LEARNER_VISIBLE.has((o.status ?? "").trim().toLowerCase());
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
    const objects = await fetchLearningObjects(token, opts.programId);
    cached = { token: key, objects: objects.filter(isVisibleToLearners) };
  }
  return cached.objects;
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

export function clearLearningCache(): void {
  cached = null;
}
