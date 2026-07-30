-- 0037 — Supabase Security Advisor hardening.
--
-- Context: anon/authenticated hold table grants on all of public (Supabase Data
-- API defaults), so any table without RLS is world-readable AND writable to
-- anyone holding the project's publishable/anon key — a public credential. The
-- app never uses the Data API (all access goes through backend-ts as nexus_app,
-- or as service_role/owner, both of which bypass or pre-date these policies),
-- so the fix is to close the PostgREST door without changing backend behavior.
--
--   1. Enable RLS on the 19 public tables that lacked it. Each gets a single
--      nexus_app-only policy: authorization for these platform-scoped tables is
--      enforced in backend code, and no other role (bridge_service,
--      learning_service, anon, authenticated) has any business there.
--   2. organizations: org_member_write was FOR ALL, overlapping org_member_read
--      on SELECT (advisor: multiple_permissive_policies). Split into
--      INSERT/UPDATE/DELETE so each action has exactly one policy.
--   3. SECURITY DEFINER helpers had EXECUTE granted to PUBLIC, making them
--      anonymous RPC endpoints (advisor: public/signed-in can execute
--      SECURITY DEFINER). Revoke; re-grant only to the internal roles whose
--      policies call them.
--   4. Pin search_path on the two helpers that lacked it (advisor: function
--      search path mutable). Their bodies only call pg_catalog functions.
--
-- Idempotent: safe to re-run (the runner replays every migration).

-- ── 1. RLS on backend-only tables ───────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_launch_tokens', 'app_user_data', 'challenge_stage_config',
    'demo_auth_users', 'gate_member_requests', 'gates', 'identities',
    'item_mastery', 'learning_role_assignments', 'learning_roles',
    'module_structures', 'permissions', 'platform_settings',
    'role_permissions', 'roles', 'stored_files', 'unit_content',
    'units', 'uploads'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists nexus_backend_only on public.%I', t);
    execute format(
      'create policy nexus_backend_only on public.%I for all to nexus_app using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ── 2. organizations: one permissive policy per action ──────────────────────
drop policy if exists org_member_write on organizations;
drop policy if exists org_member_insert on organizations;
drop policy if exists org_member_update on organizations;
drop policy if exists org_member_delete on organizations;

create policy org_member_insert on organizations
  for insert
  with check (nexus_is_org_member(id) or owner_id = nexus_current_user_id());
create policy org_member_update on organizations
  for update
  using (nexus_is_org_member(id) or owner_id = nexus_current_user_id())
  with check (nexus_is_org_member(id) or owner_id = nexus_current_user_id());
create policy org_member_delete on organizations
  for delete
  using (nexus_is_org_member(id) or owner_id = nexus_current_user_id());
-- org_member_read (FOR SELECT, from 0007) stays as the sole SELECT policy.

-- ── 3. SECURITY DEFINER helpers: internal roles only ────────────────────────
-- Revoking from PUBLIC removes the implicit grant every role inherits;
-- anon/authenticated then can no longer call these via PostgREST RPC.
revoke execute on function public.has_platform_role(uuid) from public, anon, authenticated;
revoke execute on function public.nexus_is_org_member(uuid) from public, anon, authenticated;
revoke execute on function public.nexus_is_org_member_strict(uuid) from public, anon, authenticated;

-- nexus_app evaluates the org/people/profile policies that call these helpers;
-- service_role keeps the legacy supabase-js path working.
grant execute on function public.has_platform_role(uuid) to nexus_app, service_role;
grant execute on function public.nexus_is_org_member(uuid) to nexus_app, service_role;
grant execute on function public.nexus_is_org_member_strict(uuid) to nexus_app, service_role;

-- ── 4. Pin search_path on the remaining helpers ─────────────────────────────
alter function public.nexus_current_user_id() set search_path = public;
alter function public.nexus_platform_org_check(text) set search_path = public;
