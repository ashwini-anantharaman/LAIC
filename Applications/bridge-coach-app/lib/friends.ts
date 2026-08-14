// Friends — the app's only person-to-person surface.
//
// Every other list in this app is a club's: its roster, its challenges, its
// content. Friends are not scoped to a club and do not change when someone joins
// or leaves one, which is why the screen searches by username or email rather than
// picking from a roster.
//
// The screen shows three tabs and a badge, all from ONE payload. Fetching them
// separately would mean three round trips before the first paint and a badge that
// could disagree with the tab behind it.

import { request } from "./nexus";

/** A person, as the friends screens render them. Note there is no email here —
 *  the server does not return one, for anybody. */
export type FriendPerson = {
  profileId: string;
  name: string;
  username: string | null;
  avatar: string | null;
};

export type FriendRequest = FriendPerson & { friendshipId: string };

/** What the Find tab needs to pick the right control for a row. */
export type FindState = "none" | "requested" | "friend";
export type FoundPerson = FriendPerson & { state: FindState };

export type FriendsSnapshot = {
  friends: FriendPerson[];
  requests: FriendRequest[];
  /** Profile ids already asked, so Find reads "Requested" rather than "Add". */
  outgoing: string[];
};

const EMPTY: FriendsSnapshot = { friends: [], requests: [], outgoing: [] };

/** Session-scoped, keyed by TOKEN: a resolve arriving after sign-out must never
 *  leak one person's friends into the next person's screen. */
let cached: { token: string; value: FriendsSnapshot } | null = null;

/** The last snapshot for this token, synchronously — render it now rather than
 *  flashing an empty list on every open. */
export function peekFriends(token: string): FriendsSnapshot | null {
  return cached && cached.token === token ? cached.value : null;
}

export async function getFriends(token: string, opts: { refresh?: boolean } = {}): Promise<FriendsSnapshot> {
  if (!opts.refresh) {
    const hit = peekFriends(token);
    if (hit) return hit;
  }
  const value = await request<FriendsSnapshot>("/api/friends", { token });
  const snapshot: FriendsSnapshot = {
    friends: value.friends ?? [],
    requests: value.requests ?? [],
    outgoing: value.outgoing ?? [],
  };
  cached = { token, value: snapshot };
  return snapshot;
}

/** Drop the cache so the next read refetches — after any action that changes it. */
export function clearFriends(): void {
  cached = null;
}

/**
 * Find someone to add.
 *
 * The server needs two characters and matches an email EXACTLY, so this is a way
 * to find a person you already know rather than a directory to browse. A short
 * query is answered here rather than round-tripping for a guaranteed empty list.
 */
export async function searchPeople(token: string, query: string): Promise<FoundPerson[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await request<{ results: FoundPerson[] }>(
    `/api/friends/search?q=${encodeURIComponent(q)}`,
    { token },
  );
  return res.results ?? [];
}

export async function requestFriend(token: string, profileId: string): Promise<void> {
  await request(`/api/friends/request`, { token, method: "POST", body: { profile_id: profileId } });
  clearFriends();
}

export async function respondToRequest(
  token: string,
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  await request(`/api/friends/${encodeURIComponent(friendshipId)}/respond`, {
    token,
    method: "POST",
    body: { accept },
  });
  clearFriends();
}

/** Unfriend, or withdraw a request you sent. */
export async function removeFriend(token: string, profileId: string): Promise<void> {
  await request(`/api/friends/${encodeURIComponent(profileId)}`, { token, method: "DELETE" });
  clearFriends();
}

export { EMPTY as EMPTY_FRIENDS };
