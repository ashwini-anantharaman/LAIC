import { fetchLearningObjects, LearningObject } from "./nexus";

// Session-scoped cache so the detail screen can reuse the list fetch.
// Keyed by TOKEN: a fetch from a previous session resolving after sign-out
// must never leak another user's list into the next session.

let cached: { token: string; objects: LearningObject[] } | null = null;

export async function getLearningObjects(
  token: string,
  opts: { refresh?: boolean } = {},
): Promise<LearningObject[]> {
  if (!cached || cached.token !== token || opts.refresh) {
    const objects = await fetchLearningObjects(token);
    // Learners only ever see PUBLISHED content — drafts and in-review
    // objects are authoring state, not curriculum.
    cached = { token, objects: objects.filter((o) => o.status === "published") };
  }
  return cached.objects;
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

export function clearLearningCache(): void {
  cached = null;
}
