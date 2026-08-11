/**
 * The ONE unauthenticated surface in this API.
 *
 * Everything else under /api resolves a user and an org before it touches data.
 * This router deliberately does not, because its whole purpose is to make a
 * Content Studio share link work where there is no session: another person's
 * machine, an incognito window, a phone's webview. Before this, /o/<id> resolved
 * only in the browser that authored the object — the viewer fell back to
 * localStorage — so a "permanent" link was permanent in name only.
 *
 * What keeps that safe:
 *  • Nothing is readable unless an author explicitly published it. The repo query
 *    filters on `shared_at is not null` (migration 0002_public_share.sql), and
 *    that filter IS the security boundary.
 *  • An unshared object is reported exactly like a missing one, so probing cannot
 *    tell "exists but private" from "no such id".
 *  • Read-only, one object at a time, by exact id. There is no listing here, and
 *    there must never be one: a listing would turn a capability URL into a
 *    directory of everyone's content.
 *  • No draft state — see getSharedLearningObject.
 *
 * A shared object is readable by whoever holds the link. That is what a share
 * link means; it is not an oversight, and it is why publishing is opt-in per
 * object rather than implied by creating one.
 */
import { Hono } from "hono";

import * as graph from "../db/orgGraphRepo";
import { HttpError } from "../httpError";

export const publicRouter = new Hono();

publicRouter.get("/learning/objects/:object_id", async (c) => {
  const row = await graph.getSharedLearningObject(c.req.param("object_id"));
  // Same answer for "never existed" and "not published" — see the note above.
  if (!row) throw new HttpError(404, "Not found");
  // A published object is immutable enough to cache briefly at the edge, but not
  // so long that unpublishing takes minutes to take effect.
  c.header("Cache-Control", "public, max-age=60");
  return c.json(row);
});
