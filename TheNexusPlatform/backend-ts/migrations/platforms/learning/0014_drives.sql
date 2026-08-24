-- 0014 — drives: one concept, four kinds of owner.
--
-- Google splits "My Drive" from "Shared drives" because they are different
-- objects with different ownership rules, and pays for it twice: two permission
-- systems, two UIs, and a migration path between them. They are the same thing
-- with different owners, so this models the owner and nothing else:
--
--   profile  a person's own drive          (≈ My Drive)
--   coach    a coach's, for their learners
--   club     a partner club's              (≈ a Shared drive)
--   app      an app's, e.g. Bridge Bird
--
-- A DRIVE IS A COLLECTION ROOT. It is a learning_collections row with no parent
-- and an owner, which means every mechanism already built keeps working on it
-- unchanged: subtree inheritance, the view/edit levels from 0012, the sharing
-- dialog, folder confinement, the pipeline editor. This adds an owner and a
-- root; it does not add a second tree.
--
-- ── HAVING A DRIVE IS A GRANT, NOT AN ASSUMPTION ────────────────────────────
-- No subject has a drive until somebody says so. That is deliberate: "no drive"
-- and "an empty drive" are different states, and a platform that silently gives
-- everybody a personal space has decided something nobody chose.
--
-- ── WHY NOT A SEPARATE PERMISSION CATALOGUE ────────────────────────────────
-- The obvious next move is a parallel set of drive permissions, mirroring the
-- Studio's. It was considered and rejected: the catalogue already declares all
-- fifteen Studio surfaces with the capabilities each needs, so a fork would
-- duplicate fifteen surfaces and their metadata and then drift. The same
-- independence comes free from SCOPE -- holding object.create scoped to your
-- drive says nothing about the Studio, and studio.access stays untouched.

alter table learning_collections
  add column if not exists owner_subject_type text
    check (owner_subject_type in ('profile', 'coach', 'club', 'app')),
  add column if not exists owner_subject_id text;

-- A drive is exactly a root WITH an owner. Ordinary folders keep both null, so
-- nothing existing is reinterpreted.
comment on column learning_collections.owner_subject_type is
  'Set only on a drive root. Null on ordinary folders.';

-- One drive per owner per program. Two personal drives for one person is not a
-- feature, it is a bug somebody has to reconcile later.
create unique index if not exists learning_collections_drive_owner_idx
  on learning_collections (organization_id, program_id, owner_subject_type, owner_subject_id)
  where owner_subject_type is not null;

-- ── WHAT A SUBJECT MAY DO IN THEIR OWN DRIVE ───────────────────────────────
--
-- Two facts, kept apart because all four combinations are real: a drive things
-- are shared INTO but nothing is authored in; create rights with nowhere
-- personal to put the result; both; neither.
--
-- `create_types` is the multi-select: which learning object types this subject
-- may author. Null means "no restriction stated"; an empty array means "may
-- create nothing", which is different and has to stay different. Nobody writes a
-- 38-block tutorial on a phone, so the app case leans on this hard.
--
-- `surfaces` is which Studio tabs they reach INSIDE the drive, by surface id
-- from the access catalogue (learning.create, learning.sources, …). Null means
-- the default set for that owner kind.
create table if not exists learning_drive_permissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  program_id      uuid references programs(id) on delete cascade,
  subject_type    text not null check (subject_type in ('profile', 'coach', 'club', 'app')),
  subject_id      text not null,
  -- May a drive exist for them at all.
  has_drive       boolean not null default false,
  -- May they author into it.
  can_create      boolean not null default false,
  create_types    jsonb,
  surfaces        jsonb,
  granted_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists learning_drive_permissions_subject_idx
  on learning_drive_permissions (organization_id, program_id, subject_type, subject_id);

alter table learning_drive_permissions enable row level security;
