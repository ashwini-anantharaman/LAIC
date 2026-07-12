-- Audit Log + Entitlements migration — additive.
-- Run in Supabase SQL editor after migration_offerings_apps_hook.sql.
--
-- Adds the AuditEvent (Nexus doc Section 32) and Entitlement (Section 20)
-- entities. Audit events record who-did-what-when for admin actions;
-- entitlements grant organizations/programs/offerings access to platform
-- modules (nexus, learning, coaching, analytics — bridge is a coaching mode,
-- not a module, per Decision 7).

create extension if not exists "uuid-ossp";

-- ── Audit Events ─────────────────────────────────────────────────────────────
create table if not exists audit_events (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid references organizations(id) on delete cascade,  -- null = global/Nexus-level event
  actor_user_id    uuid references profiles(id) on delete set null,      -- null = system/app-initiated
  action           text not null,             -- e.g. 'offering.published', 'registration.approved'
  scope_type       text,                      -- organization | program | offering | group | global
  scope_id         uuid,
  target_type      text,                      -- entity type acted on, e.g. 'registration'
  target_id        uuid,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists audit_events_org_idx on audit_events(organization_id, created_at desc);
create index if not exists audit_events_actor_idx on audit_events(actor_user_id);

-- ── Entitlements ─────────────────────────────────────────────────────────────
create table if not exists entitlements (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  subject_type     text not null default 'organization'
                     check (subject_type in ('organization', 'program', 'offering')),
  subject_id       uuid not null,
  module           text not null check (module in ('nexus', 'learning', 'coaching', 'analytics')),
  status           text not null default 'active'
                     check (status in ('active', 'trial', 'requested', 'disabled')),
  limits           jsonb not null default '{}'::jsonb,   -- seats, storage caps, usage limits
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (subject_type, subject_id, module)
);
create index if not exists entitlements_org_idx on entitlements(organization_id);

-- ── RLS: org-scoped, same pattern as prior migrations ────────────────────────
do $$
declare t text;
begin
  foreach t in array array['audit_events', 'entitlements']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists nexus_org_scope on %I;', t);
    execute format(
      'create policy nexus_org_scope on %I for all using (nexus_is_org_member(organization_id)) with check (nexus_is_org_member(organization_id));',
      t
    );
  end loop;
end $$;
