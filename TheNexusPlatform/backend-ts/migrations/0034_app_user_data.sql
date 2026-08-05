-- Per-user data for a published App Shell app (Phase 2): a student's onboarding
-- answers + completion flag, so the app remembers them and skips onboarding on
-- return. Keyed by the auth credential (user_id) — consistent with participants.
create table if not exists app_user_data (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  registered_app_id uuid not null,
  program_id uuid,
  user_id uuid not null,
  onboarding_completed boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registered_app_id, user_id)
);
create index if not exists idx_app_user_data_app on app_user_data(registered_app_id);
