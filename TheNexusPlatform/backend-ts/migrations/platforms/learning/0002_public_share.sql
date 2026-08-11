-- Permanent PUBLIC links for Content Studio objects.
--
-- A Studio object's /o/<id> URL was only ever resolvable in the BROWSER that
-- authored it: the viewer fell back to localStorage keys (laic-created-objects:*)
-- whenever it had no Nexus session, so a link pasted anywhere else — another
-- machine, an incognito window, a phone's webview — reported "Content not found".
-- The id was permanent; the DATA was not reachable.
--
-- `shared_at` makes sharing an EXPLICIT, per-object act. Without it, serving
-- objects to anonymous callers would make every object in every org readable by
-- anyone who could guess an id, which is exactly the isolation the rest of this
-- pack exists to enforce. Null = private, the default for everything that already
-- exists and for everything created from now on.
--
-- Whoever holds the link can read a shared object: it is a capability URL, and
-- the id is the only secret. That is the point of a share link, and it is why the
-- flag is opt-in rather than implied.
--
-- Replayed on every `npm run migrate` (see ../README.md), so it is end-state and
-- idempotent — never a drop-and-rebuild.

alter table if exists learning_objects
  add column if not exists shared_at timestamptz;

comment on column learning_objects.shared_at is
  'When this object was made publicly readable by link. Null = private. Read by the unauthenticated GET /api/public/learning/objects/:id.';

-- The public read looks an object up by id and then checks the flag; the primary
-- key already serves the lookup, so this index exists for the far rarer question
-- "what is currently shared?" (an audit, or a revoke-all).
create index if not exists idx_learning_objects_shared
  on learning_objects (shared_at)
  where shared_at is not null;
