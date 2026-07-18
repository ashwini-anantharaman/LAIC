-- Learning pack — Nexus-side hardening (runs last in the pack).
--
-- Same two walls as the bridge pack: learning_* belongs to the LEARNING
-- SERVICE (nexus_app revoked — the console cannot read an org's learning
-- content), and rows are org-filtered through nexus_platform_org_check() once
-- the service sets `app.platform_org_scope` per request (Phase 6 wiring);
-- unset GUC = service-level trust until then. Idempotent.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'learning_%'
  loop
    execute format('revoke all on table %I from nexus_app;', t);
    execute format('revoke all on table %I from public;', t);
    execute format('grant select, insert, update, delete on table %I to learning_service;', t);
  end loop;
end $$;

drop policy if exists learning_service_scope on learning_objects;
create policy learning_service_scope on learning_objects for all to learning_service
  using (nexus_platform_org_check(organization_id::text))
  with check (nexus_platform_org_check(organization_id::text));
