-- Which APP does a published object go to?
--
-- Publishing is currently one bit per object — published_at + version_number
-- (0004) — and it means "live, to whoever the program scope already reaches".
-- There is no way to say an object is meant for one app and not another, so a
-- "content access granter" who is supposed to choose a destination has no
-- destination to choose.
--
-- One row per (object, app). Absence of any row means what it has always meant:
-- the object is not app-targeted, and every reader that can see it, sees it.
--
-- METADATA TODAY, NOT A FILTER. Nothing reads this table to decide visibility.
-- Bridge Bird's Learn tab selects on published_at/status
-- (Applications/bridge-coach-app/lib/learning.ts:37-40) and is untouched by
-- this. Making the target FILTER reads is subtractive — content visible today
-- would vanish the moment someone targets an object at one app — so it is a
-- separate decision, taken with a migration of its own once there is more than
-- one app to choose between.
--
-- `app_key` is a slug, not a foreign key, because there is nothing to point at.
-- Bridge Bird is not a row anywhere: it is a hardcoded Expo client pinned to a
-- literal program id (Applications/bridge-coach-app/lib/config.ts:105), and the
-- string "clubapp" exists only as a capability-catalogue provider key
-- (src/accessCatalogue/defaults/club-app.json). The `registered_apps` table
-- (core 0005_offerings_apps_hook.sql) IS the eventual home for this reference —
-- it has ids, slugs and CRUD — but it is offering-scoped and Bridge Bird has no
-- row in it, so pointing at it today would mean inventing the row first. When
-- Bridge Bird becomes a real record, add app_id uuid beside app_key and
-- backfill; the slug stays as the stable wire value the clients already know.
--
-- Replayed on every `npm run migrate` (see ../README.md) — end-state and
-- idempotent, never drop-and-rebuild.

create table if not exists learning_object_app_targets (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  object_id        text not null references learning_objects(id) on delete cascade,
  app_key          text not null,
  published_at     timestamptz,
  published_by     text,
  created_at       timestamptz not null default now()
);

comment on table learning_object_app_targets is
  'Which app(s) an object is published to. Metadata today — no read path filters on it; see the header before changing that.';
comment on column learning_object_app_targets.app_key is
  'App slug, e.g. clubapp (Bridge Bird). Not an FK: registered_apps has no row for the app that exists.';
comment on column learning_object_app_targets.published_at is
  'When this object was last published TO THIS APP. Distinct from learning_objects.published_at, which is the object going live at all.';

-- Re-publishing to the same app updates the stamp rather than adding a row.
create unique index if not exists learning_object_app_target_uniq
  on learning_object_app_targets (object_id, app_key);

-- "What is targeted at this app?" — the question a per-app reader would ask if
-- and when targeting becomes a filter.
create index if not exists idx_learning_object_app_targets_app
  on learning_object_app_targets (app_key);

-- Same wall as learning_objects; 9000_nexus_hardening.sql picks the table up by
-- its learning_% name for the grants. Policy declared here so the table is never
-- left with RLS on and nothing to satisfy it.
alter table learning_object_app_targets enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'learning_service') then
    execute 'drop policy if exists learning_object_app_targets_service_scope on learning_object_app_targets';
    execute $pol$
      create policy learning_object_app_targets_service_scope on learning_object_app_targets
        for all to learning_service
        using (nexus_platform_org_check(organization_id::text))
        with check (nexus_platform_org_check(organization_id::text));
    $pol$;
  end if;
end $$;
