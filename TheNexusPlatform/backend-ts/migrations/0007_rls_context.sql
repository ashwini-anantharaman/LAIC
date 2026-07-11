-- Slice 2 — Backend-enforced org isolation (Nexus v0.4, Wall 1 + Wall 3).
--
-- Prior migrations defined org-scoped RLS keyed to Supabase's auth.uid(), but the
-- backend queried with the service-role key, which BYPASSES RLS. This migration
-- makes isolation real and portable:
--
--   1. Resolve the current user from a request-bound GUC (app.current_user_id),
--      not auth.uid() — works on any Postgres, not just Supabase.
--   2. Add a non-superuser `nexus_app` role. The backend connects as usual but
--      does `SET LOCAL ROLE nexus_app` per request, so RLS is enforced (a
--      superuser/table-owner would bypass it; nexus_app does not).
--
-- Idempotent: safe to re-run.

-- ── Request-bound identity ──────────────────────────────────────────────────
create or replace function nexus_current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- Redefine the membership helper to use the GUC instead of auth.uid().
-- SECURITY DEFINER so it can read org_memberships regardless of the caller's RLS.
create or replace function nexus_is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_memberships m
    where m.org_id = target_org and m.profile_id = nexus_current_user_id()
  );
$$;

-- Recreate the organizations policies (they referenced auth.uid()).
alter table organizations enable row level security;
drop policy if exists org_member_read on organizations;
drop policy if exists org_member_write on organizations;
create policy org_member_read on organizations
  for select using (nexus_is_org_member(id) or owner_id = nexus_current_user_id());
create policy org_member_write on organizations
  for all using (nexus_is_org_member(id) or owner_id = nexus_current_user_id())
  with check (nexus_is_org_member(id) or owner_id = nexus_current_user_id());

-- All other org-scoped policies already call nexus_is_org_member(...), so they
-- now resolve through the GUC automatically — no per-table rewrite needed.

-- Close a gap: org_permission_defaults is org-scoped but earlier migrations
-- never gave it an RLS policy.
alter table org_permission_defaults enable row level security;
drop policy if exists nexus_org_scope on org_permission_defaults;
create policy nexus_org_scope on org_permission_defaults
  for all using (nexus_is_org_member(org_id)) with check (nexus_is_org_member(org_id));

-- ── Non-superuser application role (RLS applies to it) ──────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nexus_app') then
    create role nexus_app nologin nosuperuser;
  end if;
end $$;

grant usage on schema public to nexus_app;
grant select, insert, update, delete on all tables in schema public to nexus_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to nexus_app;
