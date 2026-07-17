-- Demo-mode auth users in Postgres (previously JSON-file only). Needed for
-- serverless deploys where the filesystem is read-only/ephemeral. Only used
-- while Supabase auth is unconfigured; the token remains the user id.
create table if not exists demo_auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists demo_auth_users_email_key
  on demo_auth_users (lower(email));

-- Auth runs privileged (before any user context), but keep the standing grant
-- pattern from 0007 so nothing breaks if a scoped path ever touches it.
grant select, insert, update, delete on demo_auth_users to nexus_app;
