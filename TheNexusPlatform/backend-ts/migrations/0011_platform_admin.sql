-- Platform admin — a person who manages organizations across the whole platform.
--
-- Modeled as a profile with role = 'platform_admin' (already allowed by the
-- profiles_role_check vocabulary). This drives both the app-layer bypass and the
-- RLS bypass below. Idempotent.

create or replace function has_platform_role(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.auth_user_id = uid and p.role = 'platform_admin'
  ) or exists (
    select 1 from role_assignments ra
    join profiles p2 on p2.id = ra.user_id
    where p2.auth_user_id = uid and ra.scope_type = 'global' and ra.status = 'active'
      and ra.role_key in ('nexus_super_admin', 'nexus_admin')
  );
$$;
