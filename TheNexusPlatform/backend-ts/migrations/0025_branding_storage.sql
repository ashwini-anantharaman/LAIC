-- Platform-level settings (Nexus's own branding etc.) + DB-backed file
-- storage. Serverless filesystems are read-only/ephemeral, so small assets
-- (logos, <=1MB) live in Postgres and are served through the storage route.
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists stored_files (
  key text primary key,
  content_type text not null,
  -- base64 content; logos are capped at 1MB so this stays small.
  data text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on platform_settings to nexus_app;
grant select, insert, update, delete on stored_files to nexus_app;
