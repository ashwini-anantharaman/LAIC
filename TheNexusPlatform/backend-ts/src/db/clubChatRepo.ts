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

import { asPrivileged } from "./context";
import { resolveProfileId } from "./resolveProfile";
import { clubChatMessages, orgMemberships, profiles } from "./schema";

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
  pinned: m.pinnedAt != null,
  pinned_at: m.pinnedAt ? m.pinnedAt.toISOString() : null,
  pinned_by: m.pinnedBy ?? null,
  /** Did the caller write this? Decided here because the client sees an auth
   *  id, not the profile id messages are authored by. */
  mine: m.authorProfileId === actorProfileId,
  created_at: m.createdAt.toISOString(),
});

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
  return asPrivileged((tx) => resolveProfileId(tx, authOrProfileId, orgId));
}

/** Post a message. `authorProfileId` must already be a profiles.id. */
export async function createClubChatMessage(
  programId: string,
  authorProfileId: string,
  body: string,
): Promise<Row> {
  const inserted = await asPrivileged(async (tx) => {
    const rows = await tx
      .insert(clubChatMessages)
      .values({ programId, authorProfileId, body })
      .returning();
    return rows[0];
  });
  // The author label is not re-joined here: the app refetches the thread right
  // after posting, and doing the join would mean a second transaction.
  return { id: inserted.id, program_id: programId, body: inserted.body, created_at: inserted.createdAt.toISOString() };
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
