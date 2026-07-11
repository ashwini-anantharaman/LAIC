-- Offerings + Registered Apps + Signup Hook migration — additive.
-- Run in Supabase SQL editor after schema.sql / migration_platform.sql /
-- migration_programs.sql / migration_nexus_addendum.sql.
--
-- Adds the Program Offering, Registered App, Registration, and Participant
-- entities from the Nexus Platform v0.3 architecture doc. These coexist with
-- the existing join_codes/student_registrations tables (not a replacement) —
-- see backend/app/platform_db.py `register_student` for the bridge write.

create extension if not exists "uuid-ossp";

-- ── Registered Apps ──────────────────────────────────────────────────────────
create table if not exists registered_apps (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  program_id            uuid references programs(id) on delete set null,
  offering_id           uuid,            -- FK added below, after offerings exists
  app_name              text not null,
  app_slug              text not null,   -- stable identifier used in hook calls
  api_key_hash          text,            -- sha256(full key); null only once revoked+cleared
  key_prefix            text,            -- non-secret, e.g. 'nxk_AB12CD34', safe to display
  allowed_identifiers   text not null default 'email'
                          check (allowed_identifiers in ('email', 'phone', 'both')),
  status                text not null default 'active'
                          check (status in ('active', 'paused', 'revoked')),
  launch_url            text,
  launch_context        jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, app_slug)
);
create index if not exists registered_apps_org_idx on registered_apps(organization_id);
create index if not exists registered_apps_program_idx on registered_apps(program_id);
create unique index if not exists registered_apps_key_hash_idx
  on registered_apps(api_key_hash) where api_key_hash is not null;

-- ── Program Offerings ────────────────────────────────────────────────────────
create table if not exists offerings (
  id                          uuid primary key default uuid_generate_v4(),
  organization_id             uuid not null references organizations(id) on delete cascade,
  program_id                  uuid not null references programs(id) on delete cascade,
  stage_node_id               uuid references stage_nodes(id) on delete set null,
  name                        text not null,
  slug                        text not null,
  offering_type               text not null
                                check (offering_type in
                                  ('course', 'challenge', 'app', 'cohort', 'class', 'event', 'assessment', 'pilot')),
  status                      text not null default 'draft'
                                check (status in
                                  ('draft', 'private_beta', 'open', 'closed', 'completed', 'archived')),
  description                 text,
  start_date                  timestamptz,
  end_date                    timestamptz,
  registration_open           boolean not null default false,
  approval_mode                text not null default 'manual_approve'
                                check (approval_mode in ('auto_approve', 'manual_approve')),
  signup_fields                jsonb not null default
                                '[{"key":"name","label":"Name","type":"text","required":true},
                                  {"key":"age","label":"Age","type":"number","required":false},
                                  {"key":"email","label":"Email","type":"email","required":true}]'::jsonb,
  platform_module              text not null default 'nexus_only'
                                check (platform_module in ('nexus_only', 'learning', 'coaching', 'bridge', 'mixed')),
  registered_app_id            uuid references registered_apps(id) on delete set null,
  external_runtime_url         text,
  participant_label_singular   text,
  participant_label_plural     text,
  metadata                     jsonb not null default '{}'::jsonb,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (program_id, slug)
);
create index if not exists offerings_org_idx on offerings(organization_id);
create index if not exists offerings_program_idx on offerings(program_id);
create index if not exists offerings_stage_idx on offerings(stage_node_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registered_apps_offering_fk'
  ) then
    alter table registered_apps
      add constraint registered_apps_offering_fk
      foreign key (offering_id) references offerings(id) on delete set null;
  end if;
end $$;

-- ── Registrations (signup/application intake records) ───────────────────────
create table if not exists registrations (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  program_id          uuid references programs(id) on delete set null,
  offering_id         uuid not null references offerings(id) on delete cascade,
  stage_node_id       uuid references stage_nodes(id) on delete set null,
  registered_app_id   uuid references registered_apps(id) on delete set null,
  registration_source text not null default 'app_hook'
                        check (registration_source in
                          ('app_hook', 'admin_add', 'coach_add', 'invite_link', 'bulk_import')),
  email               text,
  phone               text,
  name                text,
  age                 int,
  user_id             uuid references profiles(id) on delete set null,
  status              text not null default 'pending_review'
                        check (status in
                          ('pending_review', 'approved', 'rejected', 'waitlisted', 'withdrawn', 'directly_added')),
  field_data          jsonb not null default '{}'::jsonb,
  reviewed_by_user_id uuid references profiles(id) on delete set null,
  reviewed_at         timestamptz,
  created_by_user_id  uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists registrations_org_idx on registrations(organization_id);
create index if not exists registrations_offering_idx on registrations(offering_id);
create index if not exists registrations_status_idx on registrations(offering_id, status);

-- ── Participants (accepted/active membership in an offering) ────────────────
create table if not exists participants (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  program_id          uuid references programs(id) on delete set null,
  offering_id         uuid not null references offerings(id) on delete cascade,
  stage_node_id       uuid references stage_nodes(id) on delete set null,
  user_id             uuid references profiles(id) on delete set null,
  participant_type    text not null default 'learner'
                        check (participant_type in
                          ('learner', 'coach', 'reviewer', 'advisor', 'volunteer', 'organizer', 'instructor')),
  status              text not null default 'active'
                        check (status in ('active', 'inactive', 'completed', 'removed')),
  added_by_user_id    uuid references profiles(id) on delete set null,
  registration_id     uuid references registrations(id) on delete set null,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (offering_id, user_id, participant_type)
);
create index if not exists participants_org_idx on participants(organization_id);
create index if not exists participants_offering_idx on participants(offering_id);
create index if not exists participants_user_idx on participants(user_id);

-- ── Launch tokens (short-lived, single-use — swapped for a session by an app) ─
create table if not exists app_launch_tokens (
  id            uuid primary key default uuid_generate_v4(),
  token_hash    text not null unique,
  registered_app_id uuid not null references registered_apps(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists app_launch_tokens_app_idx on app_launch_tokens(registered_app_id);

-- ── RLS: org-scoped, same pattern as migration_nexus_addendum ────────────────
-- Service-role key (used by the backend) bypasses RLS; this is defense-in-depth
-- for any future direct/anon client access, matching the existing addendum.
do $$
declare t text;
begin
  foreach t in array array['offerings', 'registrations', 'participants', 'registered_apps']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists nexus_org_scope on %I;', t);
    execute format(
      'create policy nexus_org_scope on %I for all using (nexus_is_org_member(organization_id)) with check (nexus_is_org_member(organization_id));',
      t
    );
  end loop;
end $$;
