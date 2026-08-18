-- Let the CLIENT app read published learning content directly, with Realtime.
--
-- INERT BY DEFAULT. Everything below is wrapped in an opt-in gate and does
-- NOTHING unless someone deliberately turns it on (see THE GATE). Read the whole
-- file before doing that.
--
-- WHY THE GATE EXISTS — the runner has NO LEDGER.
-- `scripts/runMigrations.ts:38-50` globs every *.sql in every pack and replays it
-- on EVERY `npm run migrate` (`sql.unsafe` per file, :64-72). There is no
-- migrations table, no applied/pending distinction, no skip list. So a file
-- committed here is not "pending" in any meaningful sense — it is ARMED, and the
-- next person to run migrate for an unrelated reason applies it. This file's own
-- header used to say "NOT APPLIED YET", which read as a decision still open when
-- it was really a tripwire. Comments cannot stop a replay; the gate can.
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
--
-- ── THE REASON THIS IS OFF, AND NOT MERELY UNAPPLIED ───────────────────────
-- This policy has NO program_id term. It is org-wide by design, from a time when
-- one org meant one library. Content is now CLUB-SCOPED: a club owns its content
-- and additionally sees its parent's curriculum, enforced in the API's read path.
--
-- UPDATED: THERE IS NO LONGER A CLIENT TO GRANT THIS TO. The mobile app used to
-- prefer a direct Supabase read and fall back to the API; that path (`lib/
-- learning-live.ts`) has been DELETED, and content now travels one way, through
-- the Nexus API, which scopes reads to club ∪ parent. Two things follow:
--
--   1. Nothing breaks while this stays closed — which is the state it has always
--      been in, so nothing changes today either way.
--   2. Anyone reopening it is not re-enabling a feature, they are introducing a
--      SECOND read path with different scoping from the one the app uses. That is
--      the disclosure this gate exists to prevent: the direct query could not
--      carry a program at all, so every signed-in member of the org would read
--      every club's published content.
--
-- The gate stays closed and the file stays here rather than being deleted,
-- because the analysis below is the thing worth keeping.
--
-- A structural limit worth knowing before anyone reopens this: RLS can see which
-- clubs a person BELONGS TO, never which club they are currently looking at. So
-- this path can be club-BOUNDED but never club-CORRECT — someone in two clubs
-- would be permitted both clubs' rows and the per-club answer would have to be
-- re-imposed client-side. Enabling it therefore needs a program arm added to the
-- policy below AND whatever client is added filtered by program — and a
-- client-side filter is not a security boundary, which is the whole argument
-- against reopening this rather than extending the API.
--
-- ── THE GATE ───────────────────────────────────────────────────────────────
-- To enable, deliberately and durably:
--
--   alter database <your-db> set learning.enable_client_read = 'on';
--
-- …then run `npm run migrate`. To disable again, set it to 'off' and drop the
-- policy and grant by hand — this file will not remove them for you, because a
-- migration that silently revoked a live grant on replay would be its own outage.
--
-- ORDERING (checked, and load-bearing)
-- 9000_nexus_hardening.sql runs AFTER this file — the pack replays in lexical
-- order and 9000 > 0005 — and it does `revoke all on table … from public`. That
-- does NOT undo the grant below: PUBLIC is a distinct pseudo-role, so revoking it
-- leaves a role-specific grant to `authenticated` in place. If 9000 is ever changed
-- to revoke from `authenticated` as well, this grant dies silently on the next
-- migrate and the client app goes empty with no error anywhere. Keep the two files
-- in view of each other.

do $gate$
begin
  if coalesce(current_setting('learning.enable_client_read', true), 'off')
       not in ('on', 'true', '1') then
    raise notice
      '0005 skipped: client read is OFF (learning.enable_client_read). This file is inert by design — see its header.';
    return;
  end if;

  raise notice '0005: learning.enable_client_read is ON — granting client read + Realtime.';

  -- ── Who is the caller, org-wise ─────────────────────────────────────────
  -- SECURITY DEFINER so it can read profiles, which the calling role cannot. It
  -- takes NO arguments on purpose: there is no way to ask about anyone else.
  execute $ddl$
    create or replace function learning_caller_in_org(org uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $fn$
      select exists (
        select 1 from profiles p
        where p.organization_id = org
          and (p.auth_user_id = auth.uid() or p.id = auth.uid())
      );
    $fn$;
  $ddl$;

  execute 'revoke all on function learning_caller_in_org(uuid) from public';
  execute 'grant execute on function learning_caller_in_org(uuid) to authenticated';

  -- ── Read access for signed-in clients ──────────────────────────────────
  execute 'grant select on table learning_objects to authenticated';

  execute 'drop policy if exists learning_objects_client_read on learning_objects';
  execute $pol$
    create policy learning_objects_client_read on learning_objects
      for select to authenticated
      using (
        -- PUBLISHED, by either signal. The stamp is the modern one, but content
        -- published before published_at was written carries only status =
        -- 'published', and demanding the stamp here would hide it from clients
        -- while the API still served it — two read paths disagreeing about the
        -- same rows. Drafts have neither, so they stay invisible, which is the
        -- point of the condition.
        (published_at is not null or lower(coalesce(status, '')) = 'published')
        and organization_id is not null
        and learning_caller_in_org(organization_id)
      );
  $pol$;

  -- ── Realtime ───────────────────────────────────────────────────────────
  -- Idempotent: adding a table already in the publication is an error, so check.
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
  end;

  -- Realtime sends only the primary key on updates unless the row is replicated in
  -- full; consumers need the changed content, not just the id.
  execute 'alter table learning_objects replica identity full';
end
$gate$;
