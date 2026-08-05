-- 0021: coach assignments (coach/learner Phase 3). A coach delegates a
-- library entry (deal/board/play) to learners on their roster; ONE ROW PER
-- LEARNER so status tracks individually. `session_id` links the learner's
-- resulting sitting once they start; completion is reconciled lazily from the
-- session's status (assigned → started → completed). People are referenced by
-- Nexus org-scoped profile ids; the roster itself stays in Nexus.

create table if not exists bridge_assignments (
  assignment_id text primary key,
  program_organization_id text,
  coach_id text not null,
  coach_name text,
  learner_id text not null,
  learner_name text,
  entry_id text not null,
  entry_kind text not null,
  entry_name text not null,
  note text,
  status text not null default 'assigned',
  session_id text,
  created_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_assignments_learner
  on bridge_assignments (learner_id, created_at desc);
create index if not exists idx_assignments_coach
  on bridge_assignments (coach_id, created_at desc);
create index if not exists idx_assignments_session
  on bridge_assignments (session_id);

alter table bridge_assignments enable row level security;
