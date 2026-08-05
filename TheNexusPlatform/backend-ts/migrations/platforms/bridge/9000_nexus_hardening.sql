-- Bridge pack — Nexus-side hardening (runs last in the pack).
--
-- Two walls:
--   1. bridge_* tables belong to the BRIDGE SERVICE, not the Nexus console.
--      The core chain's default privileges auto-grant nexus_app on every new
--      table, so revoke them here: Nexus cannot read an org's Bridge content,
--      the same way it cannot read an org's people (0021).
--   2. Row policies are granted TO bridge_service only, and org-scoped tables
--      run through nexus_platform_org_check(): once the Bridge service sets
--      `app.platform_org_scope` per request (Phase 5 wiring), rows outside the
--      caller's org disappear at the database. Until then the check passes
--      when the GUC is unset (service-level trust — Bridge's own app-layer
--      tenancy, unchanged behavior).
--
-- The jsonb-primary kb_* tables carry tenancy INSIDE `record` (Bridge's
-- design), so they get service-trust policies; the columnar org tables get the
-- GUC filter. Idempotent.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'bridge_%'
  loop
    -- Wall 1: not the console's data.
    execute format('revoke all on table %I from nexus_app;', t);
    execute format('revoke all on table %I from public;', t);
    -- Bridge service CRUD (append-only audit handled below).
    execute format('grant select, insert, update, delete on table %I to bridge_service;', t);
  end loop;
end $$;

-- Audit log is APPEND-ONLY for the application (Bridge plan §21).
revoke update, delete on table bridge_audit_log from bridge_service;

-- ── Row policies (to bridge_service only) ────────────────────────────────────

-- Org-scoped columnar tables: the per-org seam.
drop policy if exists bridge_service_scope on bridge_audit_log;
create policy bridge_service_scope on bridge_audit_log for all to bridge_service
  using (nexus_platform_org_check(program_organization_id))
  with check (nexus_platform_org_check(program_organization_id));

drop policy if exists bridge_service_scope on bridge_program_organization_profiles;
create policy bridge_service_scope on bridge_program_organization_profiles for all to bridge_service
  using (nexus_platform_org_check(program_organization_id))
  with check (nexus_platform_org_check(program_organization_id));

drop policy if exists bridge_service_scope on bridge_coach_affiliations;
create policy bridge_service_scope on bridge_coach_affiliations for all to bridge_service
  using (nexus_platform_org_check(program_organization_id))
  with check (nexus_platform_org_check(program_organization_id));

-- Everything else (person rows keyed by org-scoped nexus_user_id, jsonb-primary
-- kb_* content, taxonomy mirrors): service trust — Bridge's app layer scopes by
-- the NexusBridgeContext. Tightens further when tenant scalars are added.
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'bridge_%'
      and tablename not in ('bridge_audit_log', 'bridge_program_organization_profiles', 'bridge_coach_affiliations')
  loop
    execute format('drop policy if exists bridge_service_all on %I;', t);
    execute format('create policy bridge_service_all on %I for all to bridge_service using (true) with check (true);', t);
  end loop;
end $$;
