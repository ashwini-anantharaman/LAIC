import { fetchLearningObjects, LearningObject } from "./nexus";

/**
 * Which content reaches a learner.
 *
 * `published_at` is the real answer, and it beats the status string: publishing is
 * now a deliberate per-version act (migration 0004) that stamps the row, so a
 * stamped row IS the version its author chose to ship. Status is authoring
 * workflow — an object can sit at "in-review" while a previously published version
 * is the one readers should see.
 *
 * The status list survives as a FALLBACK for two cases, both real right now:
 * a server that predates 0004 (the column is absent, so every row would look
 * unpublished and the tab would go empty), and rows published before it (stamp
 * null, version unknown — the migration says so). `draft` is excluded either way:
 * genuinely unfinished, not merely unpublished.
 *
 * Publishing overwrites the row in place, so there is exactly one row per object
 * and no version filtering is needed here.
 */
const LEARNER_VISIBLE = new Set(["in-review", "approved", "published"]);

function isVisibleToLearners(o: LearningObject): boolean {
  // Stamped = published, whatever the authoring status now says.
  if (o.published_at) return true;
  // The column exists but this row was never published: honour that, rather than
  // falling back to a status that would let unpublished work through.
  if (o.published_at === null) return false;
  // Column absent (pre-0004 server) — fall back to the authoring status.
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
