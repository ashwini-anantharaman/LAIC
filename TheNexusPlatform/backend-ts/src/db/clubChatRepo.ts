/**
 * Club chat — one message thread per program (migration 0039).
 *
 * The Bridge app's Club tab has a Chat surface where everyone in a club talks in
 * a single thread, each message labelled with the author's name and their role
 * in that club ("Rahul ∘ Coach"). That label is NOT stored on the message: name
 * and role are joined at read time from `profiles` and `org_memberships`, so a
 * rename or a promotion is reflected in old messages too.
 *
 * Every exported function opens exactly ONE privileged transaction and never
 * calls another exported function from inside it — with DB_POOL_MAX=1 in prod a
 * nested transaction would wait forever for the connection the outer one holds.
 */
import { and, asc, eq, inArray, or } from "drizzle-orm";

import { HttpError } from "../httpError";
import { asPrivileged } from "./context";
import { resolveOrgProfileId } from "./identityRepo";
import { clubChatMessages, orgMemberships, profiles, programs } from "./schema";

type Row = Record<string, unknown>;

/** Roles that make someone staff of a club rather than one of its learners. */
const COACH_ROLES = new Set(["owner", "administrator", "instructor", "teacher", "coach"]);

/** The label the app shows beside a name — the club's two standings. */
function standingFor(membershipRole: string | null): string {
  return membershipRole && COACH_ROLES.has(membershipRole.toLowerCase()) ? "Coach" : "Learner";
}

const messageRow = (
  m: typeof clubChatMessages.$inferSelect,
  author: { name: string | null; role: string | null },
  actorProfileId: string,
): Row => ({
  id: m.id,
  program_id: m.programId,
  author_profile_id: m.authorProfileId,
  author_name: author.name,
  /** "Coach" | "Learner" — resolved from the author's membership in THIS club. */
  author_standing: standingFor(author.role),
  body: m.body,
  image: m.image ?? null,
  pinned: m.pinnedAt != null,
  pinned_at: m.pinnedAt ? m.pinnedAt.toISOString() : null,
  pinned_by: m.pinnedBy ?? null,
  /** Did the caller write this? Decided here because the client sees an auth
   *  id, not the profile id messages are authored by. */
  mine: m.authorProfileId === actorProfileId,
  created_at: m.createdAt.toISOString(),
});

/**
 * The club's header image, or null. Any member may read it — it is the banner
 * everyone sees on the Club tab.
 */
export async function getProgramHeaderImage(programId: string): Promise<string | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ headerImage: programs.headerImage })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);
    return r.length ? (r[0].headerImage ?? null) : null;
  });
}

/** Set or clear the club's header image. Staff only — enforced by the route. */
export async function setProgramHeaderImage(
  programId: string,
  headerImage: string | null,
): Promise<void> {
  await asPrivileged(async (tx) => {
    const r = await tx
      .update(programs)
      .set({ headerImage })
      .where(eq(programs.id, programId))
      .returning({ id: programs.id });
    if (r.length === 0) throw new HttpError(404, "Program not found");
  });
}

/**
 * Delete every message in a club's thread.
 *
 * Deliberately whole-thread rather than per-message: what this exists for is
 * resetting a club to a clean chat, and a moderator picking off messages one at a
 * time is a different feature with a different UI.
 *
 * Hard delete. A soft flag would keep the bodies in the table, and "clear the chat"
 * should mean the words are gone — not hidden behind a filter that some later read
 * path forgets to apply. Pinned messages go with the rest: a pin is a property of a
 * message, so nothing can outlive it.
 *
 * Returns how many were removed, so a caller can say so rather than claiming
 * success over an empty thread.
 */
export async function deleteAllClubChatMessages(programId: string): Promise<number> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .delete(clubChatMessages)
      .where(eq(clubChatMessages.programId, programId))
      .returning({ id: clubChatMessages.id });
    return rows.length;
  });
}

/**
 * The club's thread, oldest first — the order a chat reads in.
 *
 * `limit` bounds it to the tail: a long-running club would otherwise grow the
 * response without bound, and the app only ever renders the recent history.
 */
export async function listClubChatMessages(
  orgId: string,
  programId: string,
  actorProfileId: string,
  limit = 200,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select()
      .from(clubChatMessages)
      .where(eq(clubChatMessages.programId, programId))
      .orderBy(asc(clubChatMessages.createdAt));
    const tail = rows.slice(Math.max(0, rows.length - limit));
    if (tail.length === 0) return [];

    const authorIds = [...new Set(tail.map((m) => m.authorProfileId))];
    // Memberships may reference a profile's own id OR its auth-credential id
    // (dev auto-activation does the latter), so resolve both — the same
    // two-key lookup listProgramMembers does.
    const profs = await tx
      .select({ id: profiles.id, authUserId: profiles.authUserId, displayName: profiles.displayName, name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(or(inArray(profiles.id, authorIds), inArray(profiles.authUserId, authorIds)));
    const mships = await tx
      .select({ profileId: orgMemberships.profileId, role: orgMemberships.role })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.programId, programId)));

    const roleByProfile = new Map(mships.map((m) => [m.profileId, m.role]));
    const authors = new Map<string, { name: string | null; role: string | null }>();
    for (const p of profs) {
      const role = roleByProfile.get(p.id) ?? (p.authUserId ? roleByProfile.get(p.authUserId) : null) ?? null;
      const name = p.displayName ?? p.name ?? p.email ?? null;
      authors.set(p.id, { name, role });
      if (p.authUserId) authors.set(p.authUserId, { name, role });
    }

    return tail.map((m) =>
      messageRow(m, authors.get(m.authorProfileId) ?? { name: null, role: null }, actorProfileId),
    );
  });
}

/**
 * The caller's `profiles.id` in this org.
 *
 * Messages are authored by profile id — the key `org_memberships` uses and the
 * roster resolves names from — but a session carries the shared auth id, so it
 * has to be translated. Null when the caller has no profile in the org.
 */
export async function resolveActorProfileId(
  orgId: string,
  authOrProfileId: string,
): Promise<string | null> {
  return resolveOrgProfileId(orgId, authOrProfileId);
}

/**
 * Post a message. `authorProfileId` must already be a profiles.id.
 *
 * Either the body or the image may be empty, but not both — a picture with no
 * words is an ordinary message, and the DB constraint enforces the rest.
 */
export async function createClubChatMessage(
  programId: string,
  authorProfileId: string,
  body: string,
  image: string | null = null,
): Promise<Row> {
  const inserted = await asPrivileged(async (tx) => {
    const rows = await tx
      .insert(clubChatMessages)
      .values({ programId, authorProfileId, body, image })
      .returning();
    return rows[0];
  });
  // The author label is not re-joined here: the app refetches the thread right
  // after posting, and doing the join would mean a second transaction.
  return {
    id: inserted.id,
    program_id: programId,
    body: inserted.body,
    image: inserted.image ?? null,
    created_at: inserted.createdAt.toISOString(),
  };
}

/**
 * Pin or unpin a message.
 *
 * Pinning is a property of the MESSAGE, not of the reader: the design shows one
 * shared pin list per club, so any member's pin is everyone's. Returns null when
 * the message is not in this program, which the route turns into a 404 — so a
 * message id from another club cannot be touched.
 */
export async function setClubChatMessagePinned(
  programId: string,
  messageId: string,
  pinned: boolean,
  actorProfileId: string,
): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .update(clubChatMessages)
      .set(
        pinned
          ? { pinnedAt: new Date(), pinnedBy: actorProfileId }
          : { pinnedAt: null, pinnedBy: null },
      )
      .where(and(eq(clubChatMessages.id, messageId), eq(clubChatMessages.programId, programId)))
      .returning();
    if (rows.length === 0) return null;
    const m = rows[0];
    return { id: m.id, pinned: m.pinnedAt != null, pinned_at: m.pinnedAt ? m.pinnedAt.toISOString() : null };
  });
}
