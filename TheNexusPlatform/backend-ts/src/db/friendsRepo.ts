// Friends — person to person, deliberately outside every club boundary.
//
// One row per pair whichever way round it was made (0047's unique index on the
// ordered pair), so "are we friends?" is one lookup and a reciprocal request is a
// conflict rather than a second row. The row stays DIRECTED because that is the only
// way to tell an incoming request from an outgoing one.
//
// Everything here runs privileged and takes the caller's own profile id as its first
// argument. That id comes from the session, never from the request body — the whole
// authorisation story is "you can only act as yourself", and it holds because no
// function below will read or write a row the caller is not one half of.

import { sql } from "drizzle-orm";

import { asPrivileged } from "./context";

type Row = Record<string, unknown>;

/** A person as the friends screens show them. Note what is NOT here: email. */
export type FriendPerson = {
  profileId: string;
  name: string;
  username: string | null;
  avatar: string | null;
};

/** The columns every friends query selects — one shape for the whole feature. */
const PERSON_COLS = sql`
  p.id           as profile_id,
  coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.name), ''), p.username, 'Someone') as name,
  p.username,
  p.avatar`;

function toPerson(r: Row): FriendPerson {
  return {
    profileId: String(r.profile_id),
    name: String(r.name ?? "Someone"),
    username: (r.username as string | null) ?? null,
    avatar: (r.avatar as string | null) ?? null,
  };
}

/** Everyone this person is actually friends with, newest first. */
export async function listFriends(profileId: string): Promise<FriendPerson[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select ${PERSON_COLS}, f.responded_at
      from friendships f
      -- The OTHER half of the pair, whichever column the caller is in.
      join profiles p on p.id = case when f.requester_id = ${profileId}
                                     then f.addressee_id else f.requester_id end
      where f.status = 'accepted'
        and (f.requester_id = ${profileId} or f.addressee_id = ${profileId})
      order by f.responded_at desc nulls last`);
    return (rows as unknown as Row[]).map(toPerson);
  });
}

/** Requests waiting on this person's answer — incoming only. */
export async function listIncomingRequests(
  profileId: string,
): Promise<(FriendPerson & { friendshipId: string })[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select ${PERSON_COLS}, f.id as friendship_id
      from friendships f
      join profiles p on p.id = f.requester_id
      where f.addressee_id = ${profileId} and f.status = 'pending'
      order by f.created_at desc`);
    return (rows as unknown as Row[]).map((r) => ({
      ...toPerson(r),
      friendshipId: String(r.friendship_id),
    }));
  });
}

/** Requests this person has sent and nobody has answered — so Find can say so. */
export async function listOutgoingRequestIds(profileId: string): Promise<string[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select addressee_id from friendships
      where requester_id = ${profileId} and status = 'pending'`);
    return (rows as unknown as Row[]).map((r) => String(r.addressee_id));
  });
}

/**
 * Find someone to add.
 *
 * DIRECTORY SAFETY is the whole design here. This must not become a way to
 * enumerate the platform's members, so:
 *   • email matches EXACTLY — you can only find an address you already know;
 *   • username matches exactly or by prefix, and the caller must type at least
 *     two characters, so a single letter cannot sweep the alphabet;
 *   • results are capped, and never include the caller;
 *   • no email is returned for anyone, ever. A result carries name, username and
 *     avatar — enough to recognise a person you were already looking for.
 */
export async function searchPeople(
  profileId: string,
  query: string,
  limit = 10,
): Promise<FriendPerson[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select ${PERSON_COLS}
      from profiles p
      where p.id <> ${profileId}
        and (
          lower(p.email) = ${q}
          or lower(p.username) = ${q}
          or lower(p.username) like ${q + "%"}
        )
      order by (lower(p.username) = ${q}) desc, p.username asc
      limit ${limit}`);
    return (rows as unknown as Row[]).map(toPerson);
  });
}

/** The pair's current row, if there is one, from the caller's point of view. */
export async function friendshipWith(
  profileId: string,
  otherId: string,
): Promise<{ id: string; status: string; outgoing: boolean } | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, status, requester_id from friendships
      where least(requester_id, addressee_id) = least(${profileId}::uuid, ${otherId}::uuid)
        and greatest(requester_id, addressee_id) = greatest(${profileId}::uuid, ${otherId}::uuid)
      limit 1`);
    const row = (rows as unknown as Row[])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      status: String(row.status),
      outgoing: String(row.requester_id) === profileId,
    };
  });
}

/**
 * Ask to be someone's friend.
 *
 * Idempotent and un-spammable by construction: the pair is unique, so a second ask
 * lands on the existing row. Re-asking after a decline is allowed — people change
 * their minds — but it REUSES the row rather than inserting, so a refusal cannot be
 * buried under a pile of duplicates. Asking someone who already asked YOU simply
 * accepts theirs, which is what the person meant.
 */
export async function requestFriend(
  profileId: string,
  otherId: string,
): Promise<"pending" | "accepted"> {
  const existing = await friendshipWith(profileId, otherId);
  if (existing?.status === "accepted") return "accepted";
  if (existing && !existing.outgoing && existing.status === "pending") {
    await respondToRequest(profileId, existing.id, true);
    return "accepted";
  }
  await asPrivileged(async (tx) => {
    await tx.execute(sql`
      insert into friendships (requester_id, addressee_id, status)
      values (${profileId}, ${otherId}, 'pending')
      on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
      do update set requester_id = ${profileId}, addressee_id = ${otherId},
                    status = 'pending', created_at = now(), responded_at = null`);
  });
  return "pending";
}

/**
 * Answer a request addressed to you.
 *
 * The `addressee_id = caller` clause is the authorisation: it is not possible to
 * accept a request sent to somebody else, or to answer your own. Returns false when
 * nothing matched, which the route reports as a 404 rather than a silent success.
 */
export async function respondToRequest(
  profileId: string,
  friendshipId: string,
  accept: boolean,
): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      update friendships
      set status = ${accept ? "accepted" : "declined"}, responded_at = now()
      where id = ${friendshipId} and addressee_id = ${profileId} and status = 'pending'
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/** Remove a friendship (or withdraw a request) — either side may, at any point. */
export async function removeFriend(profileId: string, otherId: string): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      delete from friendships
      where least(requester_id, addressee_id) = least(${profileId}::uuid, ${otherId}::uuid)
        and greatest(requester_id, addressee_id) = greatest(${profileId}::uuid, ${otherId}::uuid)
        and (requester_id = ${profileId} or addressee_id = ${profileId})
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/**
 * The caller's OWN profile id, from their session identity.
 *
 * A session id may be either a profile id or an auth id depending on how the
 * account was made, so both are matched — the same pair `loadUser` uses, and the
 * omission of the second arm is what once made a rename silently not stick.
 *
 * A person with profiles in several orgs has several ids; the ordering makes the
 * choice deterministic rather than arbitrary. This app is single-org in practice,
 * which is the assumption 0047's header records.
 */
export async function callerProfileId(userId: string): Promise<string | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id from profiles
      where id = ${userId}::uuid or auth_user_id = ${userId}::uuid
      order by created_at asc nulls last, id asc
      limit 1`);
    const row = (rows as unknown as Row[])[0];
    return row ? String(row.id) : null;
  });
}
