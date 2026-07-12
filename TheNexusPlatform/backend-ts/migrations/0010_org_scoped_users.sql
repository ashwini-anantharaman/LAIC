-- Slice 10 — Org-scoped users (Nexus v0.4 §3/§7.4, open-decision #4 = one login → many org profiles).
--
-- A person is one auth credential (`auth_user_id`) that can back many org-scoped
-- `profiles` rows — one per organization. `profiles.id` is a per-org record id
-- (what every person-FK references); `auth_user_id` links a person's rows across
-- orgs. RLS keys on the auth id via the existing app.current_user_id GUC.
-- Idempotent.

alter table profiles add column if not exists auth_user_id uuid;
alter table profiles add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Backfill legacy rows: today profiles.id IS the auth id, and org comes from the
-- (single) membership. New rows created by the app will be org-scoped explicitly.
update profiles p
  set auth_user_id = coalesce(p.auth_user_id, p.id),
      organization_id = coalesce(p.organization_id, (select m.org_id from org_memberships m where m.profile_id = p.id limit 1))
  where p.auth_user_id is null;

-- Email is no longer globally unique (same person, many orgs). Unique per org,
-- and one profile per person per org.
alter table profiles alter column email drop not null;
alter table profiles drop constraint if exists profiles_email_key;
create unique index if not exists profiles_org_email_idx on profiles(organization_id, email) where organization_id is not null;
create unique index if not exists profiles_authuser_org_idx on profiles(auth_user_id, organization_id) where auth_user_id is not null and organization_id is not null;
create index if not exists profiles_auth_user_idx on profiles(auth_user_id);

-- Membership check resolves the person via auth_user_id (works for both backfilled
-- rows where auth_user_id = id and new org-scoped rows).
create or replace function nexus_is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_memberships m
    join profiles p on p.id = m.profile_id
    -- Real requests bind the auth id; legacy/backfilled rows have auth_user_id = id.
    where m.org_id = target_org
      and (p.auth_user_id = nexus_current_user_id() or p.id = nexus_current_user_id())
  ) or has_platform_role(nexus_current_user_id());
$$;

-- has_platform_role: role_assignments.user_id references an org-scoped profile;
-- resolve the platform role via the person's auth id across any of their profiles.
create or replace function has_platform_role(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from role_assignments ra
    join profiles p on p.id = ra.user_id
    where p.auth_user_id = uid and ra.scope_type = 'global' and ra.status = 'active'
      and ra.role_key in ('nexus_super_admin','nexus_admin')
  );
$$;

-- profiles RLS: a person sees their own profiles; org admins see their org's users.
alter table profiles enable row level security;
drop policy if exists nexus_profile_scope on profiles;
create policy nexus_profile_scope on profiles for all
  using (auth_user_id = nexus_current_user_id() or nexus_is_org_member(organization_id))
  with check (auth_user_id = nexus_current_user_id() or nexus_is_org_member(organization_id));

grant select, insert, update, delete on all tables in schema public to nexus_app;
