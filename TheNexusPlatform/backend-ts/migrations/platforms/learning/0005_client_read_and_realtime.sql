-- Let the CLIENT app read published learning content directly, with Realtime.
--
-- NOT APPLIED YET, and it should not be applied casually: this deliberately opens
-- a hole in the wall the rest of this pack builds. Read the whole file before
-- running it.
--
-- WHAT THE PACK DOES TODAY
-- 9000_nexus_hardening.sql revokes every learning_* table from PUBLIC and grants
-- them to `learning_service` alone, with one policy for that role. `anon` and
-- `authenticated` therefore have NO access whatsoever: a client using the anon key
-- gets nothing, which is why the app reads through the Nexus API instead.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
-- It grants SELECT on learning_objects to `authenticated` only — never to `anon`,
-- and never insert/update/delete. Two policies bound it:
--
--   1. PUBLISHED ONLY. A stamp (published_at, 0004) or status = 'published' — see the
--      policy below for why both. Draft and in-review work stays invisible to clients
--      no matter who asks.
--   2. THEIR OWN ORG. The row's organization_id must be one the caller holds a
--      profile in. Without this arm, any signed-in user of any org could read
--      every org's content — the exact isolation this pack exists to enforce.
--
-- The membership test goes through a SECURITY DEFINER function because `profiles`
-- is itself locked down: a policy that selected from it directly would fail for
-- the very role it is meant to serve. The function is deliberately narrow — it
-- answers one boolean about the CALLER and nothing else, cannot be passed another
-- user's id, and is not granted to anon.
--
-- REALTIME
-- Adding the table to the supabase_realtime publication is what makes changes
-- stream. Realtime re-checks RLS per subscriber, so a client only receives rows it
-- could have selected — the two policies above apply to the stream as well.
--
-- WHAT AN ATTACKER GETS IF THE ANON KEY LEAKS
-- Nothing new. The anon key alone is not `authenticated`; it must be paired with a
-- valid user JWT, and that JWT is what the org test reads. This is why the grant is
-- to authenticated rather than anon, even though the client is configured with the
-- anon key.

-- ORDERING (checked, and load-bearing)
-- 9000_nexus_hardening.sql runs AFTER this file — the pack replays in lexical
-- order on every `npm run migrate`, and 9000 > 0005 — and it does
-- `revoke all on table … from public`. That does NOT undo the grant below:
-- PUBLIC is a distinct pseudo-role, so revoking it leaves a role-specific grant to
-- `authenticated` in place. If 9000 is ever changed to revoke from `authenticated`
-- as well, this grant dies silently on the next migrate and the client app goes
-- empty with no error anywhere. Keep the two files in view of each other.

-- ── Who is the caller, org-wise ─────────────────────────────────────────────
-- SECURITY DEFINER so it can read profiles, which the calling role cannot. It
-- takes NO arguments on purpose: there is no way to ask about anyone else.
create or replace function learning_caller_in_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.organization_id = org
      and (p.auth_user_id = auth.uid() or p.id = auth.uid())
  );
$$;

revoke all on function learning_caller_in_org(uuid) from public;
grant execute on function learning_caller_in_org(uuid) to authenticated;

-- ── Read access for signed-in clients ──────────────────────────────────────
grant select on table learning_objects to authenticated;

drop policy if exists learning_objects_client_read on learning_objects;
create policy learning_objects_client_read on learning_objects
  for select to authenticated
  using (
    -- PUBLISHED, by either signal. The stamp is the modern one, but content published
    -- before published_at was written carries only status = 'published', and demanding
    -- the stamp here would hide it from clients while the API still served it — two
    -- read paths disagreeing about the same rows. Drafts have neither, so they stay
    -- invisible, which is the point of the condition.
    (published_at is not null or lower(coalesce(status, '')) = 'published')
    and organization_id is not null
    and learning_caller_in_org(organization_id)
  );

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Idempotent: adding a table already in the publication is an error, so check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'learning_objects'
  ) then
    execute 'alter publication supabase_realtime add table learning_objects';
  end if;
exception
  when undefined_object then
    -- No supabase_realtime publication on this database (a plain Postgres used
    -- for tests). Nothing to do; the grant and policy above still stand.
    raise notice 'supabase_realtime publication not present — skipping Realtime';
end $$;

-- Realtime sends only the primary key on updates unless the row is replicated in
-- full; consumers need the changed content, not just the id.
alter table learning_objects replica identity full;
