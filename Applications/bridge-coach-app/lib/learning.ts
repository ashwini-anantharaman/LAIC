import { fetchLearningObjects, LearningObject, NexusError } from "./nexus";

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

/**
 * The club's content, through Nexus. ONE path — there is no longer a second.
 *
 * This used to prefer a direct Supabase read and fall back to the API. That path is
 * gone, and it is worth recording why, because it looked like the faster option and
 * was in fact the reason the club's Activities row could never populate:
 *
 *   - it took NO program parameter and filtered on a hardcoded organization_id, and
 *   - it did not even SELECT program_id.
 *
 * `splitByOwner` below partitions on `o.program_id === clubProgramId`, so with that
 * field undefined every row fell into `curriculum` and the club bucket was ALWAYS
 * empty — publishing from the in-app Studio produced a card that could not appear.
 * The Learn tab, meanwhile, was showing the whole ORG, every club's work included.
 *
 * It was masked only because the migration granting the client its read is gated off,
 * so the query errored and the fallback ran. The app ships with Supabase credentials
 * set, so arming that migration would have broken the club row and leaked across
 * clubs on the same day.
 *
 * REPAIRING IT WAS NOT POSSIBLE, not merely inconvenient. That migration's own header
 * makes the argument: RLS can see which clubs a person BELONGS TO, never which club
 * they are LOOKING AT, so the path can be club-bounded but never club-correct. And a
 * correct direct query needs the parent program id too, which the app only learns
 * from a Nexus round-trip — so it could be correct or fast, never both.
 *
 * What went with it is the realtime channel. In practice nothing: it never fired
 * (same closed gate), and every case it would have covered is already covered by the
 * focus and foreground refreshes, plus `app/studio.tsx` clearing this cache on the
 * way out. The one genuinely uncovered case is a colleague publishing on a laptop
 * while you watch an open Learn tab — one tab switch away. If push is wanted later it
 * belongs on the Nexus API, which knows which club you are in.
 */
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
 *
 * A THIRD half, since 0006: personal content. The server has already decided we may
 * see it (ours, or shared with us by name or by role), so this only has to keep it
 * off the shelf that reads as "the club's".
 */
export function splitByOwner(
  objects: LearningObject[],
  clubProgramId: string | null | undefined,
): { curriculum: LearningObject[]; club: LearningObject[]; mine: LearningObject[] } {
  if (!clubProgramId) return { curriculum: objects, club: [], mine: [] };
  const club: LearningObject[] = [];
  const curriculum: LearningObject[] = [];
  const mine: LearningObject[] = [];
  for (const o of objects) {
    if (o.program_id !== clubProgramId) {
      curriculum.push(o);
    } else if ((o.scope_level ?? "program") === "user") {
      // Personal content the server already decided we may see: ours, or shared with
      // us. A THIRD bucket rather than folding it into `club`, because the two are
      // different promises — putting a private draft on the shelf everyone reads,
      // under a heading that says the club's name, is the visible-bug version of
      // this feature.
      mine.push(o);
    } else {
      club.push(o);
    }
  }
  return { curriculum, club, mine };
}

export function getCachedObject(id: string): LearningObject | null {
  return cached?.objects.find((o) => o.id === id) ?? null;
}

/**
 * Drop everything pulled. Clears the CONTEXT as well as the objects — the two go
 * stale together, and this is what finally gives `clearLearningContext` its callers:
 * sign-out (a previous user's answer must not survive) and returning from the Studio
 * (where a Features toggle may just have changed).
 */
export function clearLearningCache(): void {
  cached = null;
  clearLearningContext();
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
let ctxCache: { key: string; value: LearningContext } | null = null;
/** In-flight reads, shared per key — see the retry note below. */
const ctxInflight = new Map<string, Promise<LearningContext | null>>();

/**
 * The club's learning context, cached ON SUCCESS ONLY.
 *
 * The failure branch used to be cached too, and a cached `null` is indistinguishable
 * from a cached answer: `canAuthorLearning` fails closed, so ONE transient blip took
 * the Tutorial entry out of the + sheet for the rest of the process, with no error,
 * no retry, and no way back short of force-quitting. For someone who also cannot
 * create challenges it removed the + entirely, because the sheet renders no button
 * when neither entry is permitted.
 *
 * So a failure now returns null WITHOUT writing the cache, and the next focus tries
 * again. The in-flight map is what keeps "retry on every focus" from becoming a
 * request storm while the endpoint is genuinely down: concurrent callers on the same
 * key share one request.
 */
export async function getLearningContext(
  token: string,
  clubProgramId: string | null | undefined,
): Promise<LearningContext | null> {
  const key = `${token}::${clubProgramId ?? ""}`;
  if (ctxCache?.key === key) return ctxCache.value;

  const running = ctxInflight.get(key);
  if (running) return running;

  const attempt = fetchLearningContext(token, clubProgramId ?? undefined)
    .then((value) => {
      ctxCache = { key, value };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      ctxInflight.delete(key);
    });

  ctxInflight.set(key, attempt);
  return attempt;
}

export function clearLearningContext(): void {
  ctxCache = null;
  ctxInflight.clear();
}

// ── A3: why a content read failed, in words a tester can act on ─────────────

/**
 * The three states a pulled list can be in.
 *
 * `ready` with an empty array IS the empty state — it needs no member of its own, and
 * the COPY for empty belongs to whichever surface is rendering (the Learn tab has
 * good copy; the club carousel needs none, because the challenge cards still fill the
 * row). Four distinctions, three states — the shape `describeChallengesError` already
 * uses in this codebase.
 */
export type LearningLoad =
  | { state: "loading" }
  | { state: "ready"; objects: LearningObject[] }
  | { state: "failed"; message: string };

/**
 * Modelled on `describeChallengesError` (lib/challenges.ts), for the same reason: the
 * one distinction that matters is invisible without it. Nexus maps a refused learning
 * read to 404, so "this club has no Content Studio" and "that is genuinely missing"
 * arrive identically — and a club with the feature switched off then looks exactly
 * like club-scoping working correctly.
 */
export function describeLearningError(e: unknown): string {
  if (!(e instanceof NexusError)) return "Couldn't load content.";
  if (e.status === 0) return "Can't reach the server. Check your connection.";
  if (e.status === 401) return "Your session expired — sign in again.";
  // Verbatim from the Learn tab's existing copy: this function is a hoist, and the
  // 403 case was already right there.
  if (e.status === 403) return `${e.message} (learning access for this club)`;
  if (e.status === 404) {
    return "This club doesn't have the Content Studio enabled — turn it on in Nexus under the club's Features.";
  }
  return `Couldn't load content (${e.status}).`;
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

/**
 * Can they author something just for themselves?
 *
 * A separate question from `canAuthorLearning`, and deliberately not derived from it:
 * a club may want members who keep private notes without publishing to the club, and
 * a club may want the opposite. `app.content.create.personal` is the id that says so.
 *
 * It reads the club-app capabilities the learning context now carries, falling back
 * to "if you can author at all, you can author for yourself" — the more permissive
 * reading, because refusing someone their own private draft is a strange denial and
 * the club already decided they may create.
 */
export function canAuthorPersonal(ctx: LearningContext | null): boolean {
  if (!ctx) return false;
  const appCaps = ctx.app_content_capabilities ?? null;
  if (appCaps?.length) {
    return (
      appCaps.includes("app.content.create.personal") || appCaps.includes("app.content.create")
    );
  }
  return canAuthorLearning(ctx);
}
