-- Files in the content library that nobody authored: a PDF, an image, a video.
--
-- The library has only ever held learning_objects — things the Content Studio
-- made, with blocks, versions and a publish pipeline. A handout does not have any
-- of that. It is a file with a name and a folder, and forcing it into
-- learning_objects would put an unknown `type` in front of every reader that
-- switches on type, including the Bridge Bird app. Its own table, therefore.
--
-- `id` is text, matching learning_objects, so the two can be listed together and
-- an id is never ambiguous about which table it came from (assets are prefixed).
--
-- FOLDERS BY NAME AS WELL AS ID. Studio folders live in that app's localStorage
-- (objectCollectionsStore.ts) — there is no collections table — so an asset
-- filed into "quiz" records both the id it was given and the name. The name is
-- what makes it show up beside authored content in the Nexus library, which
-- derives its folders from names for exactly the same reason. It also means a
-- content manager can type a folder name that does not exist in any author's
-- Studio and see it appear here; that asymmetry is inherited from where folders
-- live, not introduced by this table.
--
-- TWO WAYS TO HOLD A FILE, and video is why. Production has no S3 configured, so
-- the storage adapter writes base64 rows into Postgres and uploads travel as
-- base64 in a JSON body under a ~4.5 MB request cap — about 3 MB of actual file.
-- That is fine for a handout or an image and useless for a MOV. So an asset is
-- EITHER stored (storage_key) or referenced (external_url), and video is expected
-- to arrive as a link until a bucket exists. Pretending otherwise would ship an
-- upload button that fails on the first real recording.
--
-- NOT SHAREABLE YET, deliberately. learning_object_grants.object_id carries a
-- foreign key to learning_objects, so an asset cannot be granted through it
-- without dropping that key — a change to a table this feature does not own, with
-- a blast radius worth its own migration. Assets are listed, filed and deleted
-- here; sharing them is the next step, not a silent half-step.
--
-- Replayed on every `npm run migrate` (see ../README.md) — end-state and
-- idempotent, never drop-and-rebuild.

create table if not exists learning_assets (
  id                text primary key,
  organization_id   uuid not null,
  program_id        uuid,
  title             text not null default '',
  -- pdf | image | video | link. Coarse on purpose: it drives an icon and a
  -- viewer, and content_type carries the precise answer.
  kind              text not null default 'link',
  content_type      text,
  byte_size         integer,
  -- Exactly one of these is set. Stored files carry a key into the storage
  -- adapter; referenced ones carry someone else's URL and no bytes of ours.
  storage_key       text,
  external_url      text,
  collection_ids    jsonb not null default '[]'::jsonb,
  collection_names  jsonb not null default '[]'::jsonb,
  uploaded_by       uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table learning_assets is
  'Files added to the content library directly — not authored by the Content Studio. Either stored (storage_key) or referenced (external_url).';
comment on column learning_assets.collection_names is
  'Folder names, denormalised like learning_objects.collection_names — the only shared truth about folders, which otherwise live in the Studio''s localStorage.';
comment on column learning_assets.kind is
  'pdf | image | video | link. Drives the icon and viewer; content_type is the precise answer.';

-- The library listing: this program's assets, newest first.
create index if not exists idx_learning_assets_program
  on learning_assets (organization_id, program_id, created_at desc);

-- Same wall as the rest of the pack. 9000_nexus_hardening.sql picks the table up
-- by its learning_% name for the grants; the policy is declared here so it is
-- never left with RLS on and nothing to satisfy it.
alter table learning_assets enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'learning_service') then
    execute 'drop policy if exists learning_assets_service_scope on learning_assets';
    execute $pol$
      create policy learning_assets_service_scope on learning_assets
        for all to learning_service
        using (nexus_platform_org_check(organization_id::text))
        with check (nexus_platform_org_check(organization_id::text));
    $pol$;
  end if;
end $$;
