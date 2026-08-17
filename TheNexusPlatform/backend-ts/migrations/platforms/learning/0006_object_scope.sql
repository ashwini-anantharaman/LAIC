-- 0006 — a personal tier for learning objects.
--
-- Until now a learning object had exactly two access axes: organization_id and
-- program_id (the club, or the parent curriculum). There was no way to author
-- something for yourself. The moment you saved, it belonged to the club, and every
-- member of that club with edit — which, for a partner club, is EVERY member,
-- because platformAccess pins club members to level "edit" — could change or delete
-- it. `owner_id` existed and was indexed, and no query ever read it.
--
-- Two columns' worth of change, and one of them already exists:
--
--   scope_level  'program' (the club's, as today) or 'user' (mine, and mine alone
--                until I share it — see 0007_object_grants.sql).
--   owner_id     already present since 0001; from here it is written SERVER-SIDE
--                from the session rather than taken from the request body, which
--                is what makes it safe to authorize against.
--
-- INERT ON ARRIVAL. `default 'program'` means every existing row keeps exactly the
-- visibility it has today, and the read filter's `is distinct from 'user'` lets
-- legacy NULLs through unchanged. Applying this file changes nothing until code
-- starts writing 'user'.
--
-- IDEMPOTENT END-STATE, like every file in this tree: scripts/runMigrations.ts has
-- no ledger and replays every .sql on every invocation, so this must be safe to run
-- a hundred times.
--
-- VOCABULARY. 'user' | 'program' mirrors the bridge tree's ChallengeScopeLevel
-- (packages/bridge-challenges/src/types.ts) deliberately, so the two halves of the
-- product name the same idea the same way. That union also carries 'org', which is
-- omitted here: it has no meaning for content, it is written nowhere in the bridge
-- tree either, and a value nothing produces is a value nothing tests.

alter table learning_objects
  add column if not exists scope_level text not null default 'program';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'learning_objects_scope_level_chk'
  ) then
    alter table learning_objects
      add constraint learning_objects_scope_level_chk
      check (scope_level in ('user', 'program'));
  end if;
end $$;

-- The personal read: "everything of mine in this org". Partial, because personal
-- rows are the minority and the club read never touches this index.
create index if not exists idx_learning_objects_user_scope
  on learning_objects (organization_id, owner_id)
  where scope_level = 'user';

-- ── A NOTE FOR WHOEVER REOPENS 0005 ────────────────────────────────────────
-- 0005_client_read_and_realtime.sql is gated off and its policy has NO scope_level
-- term. If it is ever armed as written, every personal draft in the org becomes
-- readable by every authenticated member of that org — the exact opposite of what
-- this file is for. Arming it requires a scope_level arm as well as the program arm
-- 0005's own header already asks for.
