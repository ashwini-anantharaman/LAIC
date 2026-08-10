-- Bridge pack delta: mirrors Applications/BridgePlatform/db/migrations/
-- 0028_assignment_briefs.sql. The Bridge repo stays the source of truth for
-- schema evolution; this pack mirrors deltas additively so a FRESH Nexus
-- environment builds the same database (see 0001_bridge_schema.sql's header).
--
-- A NEW numbered file rather than another append to 0001's tail: 0001 is
-- already a squash that absorbed the 0025 alters and the 0026 collections
-- table, and every further append makes it less traceable. "0003…" sorts
-- before "9000_nexus_hardening.sql", whose `tablename like 'bridge_%'` loop
-- therefore grants and policies these two tables with no edit to 9000.
-- Every statement is idempotent — this runner replays every file on every run.


create table if not exists bridge_assignment_briefs (
  brief_id text primary key,
  program_organization_id text,
  nexus_program_id text,
  created_by text not null,
  created_by_name text,
  title text not null,
  status text not null default 'active',
  record jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- "Briefs I created", newest first — the coach's Assignments surface.
create index if not exists idx_bab_creator
  on bridge_assignment_briefs (created_by, created_at desc);
-- The 0025 program partition, matching every other scoped read.
create index if not exists idx_bab_scope
  on bridge_assignment_briefs (nexus_program_id, program_organization_id, created_at desc);

-- REVIEWERS: a join table, not a jsonb array on the brief.
--   * both hot reads are equality lookups — "who reviews this brief" (every
--     completion fan-out) and "briefs I review" — which an array of objects
--     cannot serve without a GIN index and containment predicates the
--     PostgREST store layer cannot express cleanly;
--   * a reviewer has their own lifecycle (added_by, added_at);
--   * removal is ONE DELETE, not a read-modify-write of the whole brief, so
--     two coaches editing reviewers cannot clobber each other.
-- bridge_challenge_invites (0027) is the same shape for the same reasons.
create table if not exists bridge_assignment_reviewers (
  brief_id text not null,
  reviewer_id text not null,
  reviewer_name text,
  -- The creator is SEEDED as a reviewer at create time rather than unioned in
  -- at read time: it makes "the creator stops reviewing" expressible, and it
  -- keeps the fan-out one read with no special case. Creatorship (which grants
  -- EDIT rights) stays on briefs.created_by — a separate thing.
  is_creator boolean not null default false,
  added_by text not null,
  added_at timestamptz not null,
  primary key (brief_id, reviewer_id)
);

-- "Every brief I was named on" — the reviewer-side read.
create index if not exists idx_bar_reviewer
  on bridge_assignment_reviewers (reviewer_id, added_at desc);

-- The per-learner rows join their parent. NULLABLE ON PURPOSE, PERMANENTLY:
-- every pre-0028 row has no brief and must keep working on every current
-- surface, and a row deliberately OUTLIVES its brief — "detach, never destroy"
-- means dropping a learner or deleting a brief leaves the game they played and
-- the feedback on it standing.
alter table bridge_assignments add column if not exists brief_id text;
create index if not exists idx_assignments_brief
  on bridge_assignments (brief_id, created_at desc);

-- No FK: bridge_assignments carries none anywhere (0024), both tables are
-- written by one service, and a hard reference would turn "detach" into
-- "cascade" — the exact behaviour the owner ruled out.

alter table bridge_assignment_briefs enable row level security;
alter table bridge_assignment_reviewers enable row level security;
