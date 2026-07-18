-- Phase 1 — People isolation: the Nexus operator can NEVER read an org's people.
--
-- Agreed model: Nexus governs the BOUNDARY of an organization (record, status,
-- entitlements, capability envelope, residency) but has no access to the people
-- inside it. Two defects fixed here:
--
--   1. `nexus_is_org_member` (0010) ends with `or has_platform_role(...)`, which
--      gave the platform operator blanket RLS access to every org-scoped table —
--      including all people tables. People tables now use a STRICT predicate
--      with no platform-role bypass. (Boundary tables — organizations,
--      entitlements, audit — keep the original predicate: governing them is
--      exactly the operator's job.)
--
--   2. `org_memberships` never had RLS at all: any org member (and the operator)
--      could read every org's membership rows. RLS is enabled with the strict
--      policy.
--
-- Route-level guards are hardened in the same change set (people-listing and
-- people-mutating endpoints no longer accept platform_admin), so this holds even
-- for reads that legitimately run on a privileged connection.
--
-- Idempotent: safe to re-run.

-- ── Strict membership predicate (no platform-role bypass) ────────────────────
-- SECURITY DEFINER so it can read org_memberships regardless of the caller's
-- RLS (and to avoid recursion once org_memberships itself is policied).
create or replace function nexus_is_org_member_strict(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_memberships m
    join profiles p on p.id = m.profile_id
    -- Real requests bind the auth id; legacy/backfilled rows have auth_user_id = id.
    where m.org_id = target_org
      and (p.auth_user_id = nexus_current_user_id() or p.id = nexus_current_user_id())
  );
$$;

-- ── profiles: self or fellow org member — never the operator ────────────────
alter table profiles enable row level security;
drop policy if exists nexus_profile_scope on profiles;
create policy nexus_profile_scope on profiles for all
  using (auth_user_id = nexus_current_user_id() or nexus_is_org_member_strict(organization_id))
  with check (auth_user_id = nexus_current_user_id() or nexus_is_org_member_strict(organization_id));

-- ── org_memberships: close the missing-RLS hole ──────────────────────────────
-- Fellow org members see the org's memberships (what member/team screens list);
-- non-members and the operator see none. A person is by definition a member of
-- any org they hold a row in, so self-visibility is implied.
-- NOTE: permissive policies OR together — the legacy base schema (promoted from
-- ../backend/supabase) left a non-strict nexus_org_scope policy on this table
-- that would silently re-admit the operator. Drop it.
alter table org_memberships enable row level security;
drop policy if exists nexus_org_scope on org_memberships;
drop policy if exists org_member_read on org_memberships;
drop policy if exists org_member_write on org_memberships;
drop policy if exists nexus_people_scope on org_memberships;
create policy nexus_people_scope on org_memberships for all
  using (nexus_is_org_member_strict(org_id))
  with check (nexus_is_org_member_strict(org_id));

-- ── invitations: names + emails — org members only ──────────────────────────
alter table invitations enable row level security;
drop policy if exists nexus_org_scope on invitations;
create policy nexus_org_scope on invitations for all
  using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));

-- ── program role assignments: email-keyed — org members only ────────────────
alter table program_role_assignments enable row level security;
drop policy if exists nexus_org_scope on program_role_assignments;
create policy nexus_org_scope on program_role_assignments for all
  using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));

-- ── group memberships: person-bearing (user_id) — org members only ──────────
alter table group_memberships enable row level security;
drop policy if exists nexus_org_scope on group_memberships;
create policy nexus_org_scope on group_memberships for all
  using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));

-- ── registrations & participants: registrant names/emails ───────────────────
alter table registrations enable row level security;
drop policy if exists nexus_org_scope on registrations;
create policy nexus_org_scope on registrations for all
  using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));

alter table participants enable row level security;
drop policy if exists nexus_org_scope on participants;
create policy nexus_org_scope on participants for all
  using (nexus_is_org_member_strict(organization_id))
  with check (nexus_is_org_member_strict(organization_id));

-- ── student_registrations (legacy people table, org_id column) ──────────────
alter table student_registrations enable row level security;
drop policy if exists nexus_org_scope on student_registrations;
drop policy if exists nexus_people_scope on student_registrations;
create policy nexus_people_scope on student_registrations for all
  using (nexus_is_org_member_strict(org_id))
  with check (nexus_is_org_member_strict(org_id));

-- NOTE (documented, deliberate): organizations, entitlements, audit_events,
-- programs, offerings, and other non-people org tables keep the original
-- `nexus_is_org_member` predicate (operator-visible) — boundary governance and
-- the cross-org audit feature depend on it. Tightening content tables further
-- is a follow-up decision, separate from people isolation.
