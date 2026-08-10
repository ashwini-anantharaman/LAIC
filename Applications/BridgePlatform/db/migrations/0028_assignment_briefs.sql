-- 0028: the ASSIGNMENT BRIEF — a real parent for what was a UI fiction.
--
-- Until now "an assignment" was a render-time grouping: one bridge_assignments
-- row per learner (0024), gathered by source_entry_id, with the title and note
-- read off group[0] (apps/bridge-web/app/m/assignments/page.tsx). Nothing OWNED
-- the thing, so nothing could hold its creator, its REVIEWERS, or — later — its
-- embedded drills, tutorials and several boards.
--
-- Vocabulary, fixed here and used in the TypeScript:
--   BRIEF      — what the coach composes: title, note, contents, creator.
--                One row in bridge_assignment_briefs. Editable.
--   ASSIGNMENT — the per-learner ISSUE of a brief (bridge_assignments, 0024).
--                Still one row per learner; still tracks that learner's status.
--   REVIEWER   — a coach named on a brief. Each gets their OWN feedback thread
--                with each learner (owner direction 2026-08-09: separate
--                threads, not one shared conversation).
--
-- bridge_assignments.coach_id STAYS THE CREATOR — never a reviewer. Repurposing
-- it per-reviewer is precisely how feedback reaches the wrong person.
--
-- Jsonb-primary like 0015/0020/0026/0027: the whole TS record lives in
-- `record`; scalar columns exist only for the key, the filters the read paths
-- use, and the ordering. Embedded drills/tutorials/several boards therefore
-- need NO future DDL in either schema tree — they are members of
-- record.contents, a TypeScript union.

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
