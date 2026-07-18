-- Phase 4 — platform service roles + the shared org-scope seam.
--
-- The Bridge and Learning platforms' data lives in this shared cluster inside
-- each organization's space (schema packs under migrations/platforms/). Each
-- platform gets its OWN non-superuser role, and — crucially — `nexus_app`
-- (the Nexus console's role) gets NO grants on platform tables: Nexus governs
-- the boundary; it cannot read an org's platform content, just as it cannot
-- read an org's people (0021).
--
--   nexus_app         → nexus_* / platform-console tables only
--   bridge_service    → bridge_* tables only
--   learning_service  → learning_* tables only
--
-- `nexus_platform_org_check(col)` is the per-org row filter the platform
-- services opt into: each request sets `app.platform_org_scope` (SET LOCAL) to
-- the caller's org id, and org-scoped platform rows outside it disappear at
-- the database. When the GUC is unset the check passes — service-level trust,
-- the pre-wiring behavior — so enabling per-request scoping (Phase 5/6) is a
-- connection change, not a schema change. Idempotent.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bridge_service') then
    create role bridge_service nologin nosuperuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'learning_service') then
    create role learning_service nologin nosuperuser;
  end if;
end $$;

grant usage on schema public to bridge_service;
grant usage on schema public to learning_service;

-- Row filter: unset GUC → service trust (allow); set GUC → row must belong to
-- that org or be org-wide (null column).
create or replace function nexus_platform_org_check(row_org text)
returns boolean
language sql
stable
as $$
  select case
    when nullif(current_setting('app.platform_org_scope', true), '') is null then true
    when row_org is null then true
    else row_org = current_setting('app.platform_org_scope', true)
  end
$$;
