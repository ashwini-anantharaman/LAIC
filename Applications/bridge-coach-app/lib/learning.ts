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

/**
 * Split a club read into its two halves.
 *
 * A club's list comes back as club ∪ parent, because a club sees the curriculum
 * above it as well as its own work. The two are NOT interchangeable on screen:
 *
 *   • the Learn tab is the CURRICULUM — the shared library, the same for every
 *     club, and it stays that way. Club-authored content appearing there would
 *     mean one club's material silently became everyone's reading list.
 *   • a club's OWN content belongs to the club's surfaces, where the person who
 *     made it will look for it.
 *
 * Rows from a server that predates `program_id` have none, and count as
 * curriculum — which is what they were before clubs could author anything.
 */
export function splitByOwner(
  objects: LearningObject[],
  clubProgramId: string | null | undefined,
): { curriculum: LearningObject[]; club: LearningObject[] } {
  if (!clubProgramId) return { curriculum: objects, club: [] };
  const club: LearningObject[] = [];
  const curriculum: LearningObject[] = [];
  for (const o of objects) (o.program_id === clubProgramId ? club : curriculum).push(o);
  return { curriculum, club };
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

export function clearLearningCache(): void {
  cached = null;
}

// ── May this person AUTHOR content for their club? ──────────────────────────
// The app's own capabilities (`app.*`, from the club-app catalogue) say nothing
// about the Content Studio, which has its own catalogue. So authoring is gated on
// the LEARNING context — the same answer the Studio itself uses, which means the
// console's Features toggles govern the app's + button and the Studio's screens
// identically rather than by two rules that can disagree.

import type { LearningContext } from "./nexus";
import { fetchLearningContext } from "./nexus";

/** Cached per token+club: capabilities are per club, and a club switch changes them. */
let ctxCache: { key: string; value: LearningContext | null } | null = null;

export async function getLearningContext(
  token: string,
  clubProgramId: string | null | undefined,
): Promise<LearningContext | null> {
  const key = `${token}::${clubProgramId ?? ""}`;
  if (ctxCache?.key === key) return ctxCache.value;
  let value: LearningContext | null = null;
  try {
    value = await fetchLearningContext(token, clubProgramId ?? undefined);
  } catch {
    // Unreachable or forbidden: no authoring offered, and no error surfaced — the
    // + button simply does not grow a Tutorial entry. A failure here must not break
    // the screen it sits on.
    value = null;
  }
  ctxCache = { key, value };
  return value;
}

export function clearLearningContext(): void {
  ctxCache = null;
}

/**
 * Can they create a learning object here?
 *
 * `capabilities` is the server's CLAMPED answer — role grants intersected with what
 * the org provisioned to this club — so this needs no second opinion. An empty list
 * means nothing was recorded and authoring is not offered: unlike a club-app gate,
 * there is no coarse pre-capability behaviour to fall back to, because the app never
 * offered authoring before.
 */
export function canAuthorLearning(ctx: LearningContext | null): boolean {
  if (!ctx) return false;
  if (ctx.is_admin) return true;
  const caps = ctx.capabilities ?? [];
  return caps.includes("learning.object.create") || caps.includes("learning.composition.create");
}
