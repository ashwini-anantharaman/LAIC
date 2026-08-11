import { fetchLearningObjects, LearningObject } from "./nexus";

// Session-scoped cache so the detail screen can reuse the list fetch.
// Keyed by TOKEN: a fetch from a previous session resolving after sign-out
// must never leak another user's list into the next session.

// ALSO keyed by program: a club's Learn list is the club's, not the app-wide
// program's, and one slot serving both would flash the wrong curriculum.
let cached: { key: string; objects: LearningObject[] } | null = null;

export async function getLearningObjects(
  token: string,
  opts: { refresh?: boolean; programId?: string } = {},
): Promise<LearningObject[]> {
  const key = `${token}|${opts.programId ?? ""}`;
  if (!cached || cached.key !== key || opts.refresh) {
    const objects = await fetchLearningObjects(token, opts.programId);
    // Learners only ever see PUBLISHED content — drafts and in-review
    // objects are authoring state, not curriculum.
    cached = { key, objects: objects.filter((o) => o.status === "published") };
  }
  return cached.objects;
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

export function clearLearningCache(): void {
  cached = null;
}
