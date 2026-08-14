/**
 * Friends — the app's own social graph, and the one surface here that is not
 * scoped to a club.
 *
 * Every other route in this API resolves a program before it touches data, because
 * challenges, content and roles all belong to a club. A friendship does not: it is
 * between two people, it survives them leaving a club or joining another, and that
 * is what makes finding someone by username or email a sensible thing to do.
 *
 * AUTHORISATION is uniform and small: the caller's profile id comes from their
 * session and is passed as the first argument to every repo call, which will only
 * read or write rows the caller is one half of. No route takes an actor from the
 * request body, so there is nothing to forge.
 *
 * The one thing worth guarding deliberately is SEARCH, which could otherwise become
 * a directory of the whole platform. See searchPeople in the repo: exact email,
 * exact-or-prefix username, a two-character floor, a result cap, and no email ever
 * returned for anybody.
 */

import { Hono, type Context } from "hono";

import { getCurrentUser } from "../auth";
import * as friends from "../db/friendsRepo";
import { HttpError } from "../httpError";

export const friendsRouter = new Hono();

/** The caller as a profile id — 404 rather than 500 when a session has no profile. */
async function actor(c: Context) {
  const user = await getCurrentUser(c);
  const profileId = await friends.callerProfileId(user.id);
  if (!profileId) throw new HttpError(404, "No profile for this account");
  return profileId;
}

/**
 * Everything the Friends screen needs, in ONE call.
 *
 * The screen has three tabs and shows a badge for pending requests, so fetching
 * them separately would mean three round trips before the first paint and a badge
 * that could disagree with the tab behind it. One payload, one truth.
 */
friendsRouter.get("/", async (c) => {
  const me = await actor(c);
  const [list, requests, outgoing] = await Promise.all([
    friends.listFriends(me),
    friends.listIncomingRequests(me),
    friends.listOutgoingRequestIds(me),
  ]);
  return c.json({
    friends: list,
    requests,
    /** Ids this person has already asked, so Find can say "Requested" not "Add". */
    outgoing,
  });
});

/** Find someone to add. Deliberately narrow — see the repo's note. */
friendsRouter.get("/search", async (c) => {
  const me = await actor(c);
  const q = c.req.query("q") ?? "";
  const [results, outgoing, existing] = await Promise.all([
    friends.searchPeople(me, q),
    friends.listOutgoingRequestIds(me),
    friends.listFriends(me),
  ]);
  const already = new Set(existing.map((f) => f.profileId));
  const asked = new Set(outgoing);
  // The state travels WITH each result so the row can render the right control
  // without the client re-deriving it from three lists.
  return c.json({
    results: results.map((p) => ({
      ...p,
      state: already.has(p.profileId) ? "friend" : asked.has(p.profileId) ? "requested" : "none",
    })),
  });
});

friendsRouter.post("/request", async (c) => {
  const me = await actor(c);
  const body = (await c.req.json().catch(() => ({}))) as { profile_id?: string };
  if (!body.profile_id) throw new HttpError(422, "profile_id is required");
  if (body.profile_id === me) throw new HttpError(422, "You cannot add yourself");
  const status = await friends.requestFriend(me, body.profile_id);
  return c.json({ ok: true, status });
});

friendsRouter.post("/:friendship_id/respond", async (c) => {
  const me = await actor(c);
  const body = (await c.req.json().catch(() => ({}))) as { accept?: boolean };
  if (typeof body.accept !== "boolean") throw new HttpError(422, "accept must be true or false");
  const ok = await friends.respondToRequest(me, c.req.param("friendship_id"), body.accept);
  // Not found rather than forbidden: a request addressed to somebody else is not
  // this caller's to know about.
  if (!ok) throw new HttpError(404, "No pending request");
  return c.json({ ok: true, accepted: body.accept });
});

/** Unfriend, or withdraw a request you sent. Either side, at any point. */
friendsRouter.delete("/:profile_id", async (c) => {
  const me = await actor(c);
  const ok = await friends.removeFriend(me, c.req.param("profile_id"));
  if (!ok) throw new HttpError(404, "Not friends");
  return c.json({ ok: true });
});
