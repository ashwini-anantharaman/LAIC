-- 0020: play submissions + coach comments (coach/learner Phase 2).
-- A learner sends a COMPLETED play to their hired coach: the submission
-- freezes a render-ready board snapshot (hands, auction, play, result) so the
-- review stays stable even if the source session is later forked or rewound
-- (same reasoning as bridge_kb_suggestions.board). Comments form the review
-- thread; the first coach comment flips status submitted → reviewed.
-- learner_id / coach_id are Nexus org-scoped profile ids — the roster itself
-- stays in Nexus (groups); these rows only reference people.

create table if not exists bridge_play_submissions (
  submission_id text primary key,
  program_organization_id text,
  session_id text not null,
  learner_id text not null,
  learner_name text,
  coach_id text not null,
  coach_name text,
  status text not null default 'submitted',
  note text,
  board jsonb not null,
  created_at timestamptz not null,
  reviewed_at timestamptz
);
create index if not exists idx_play_submissions_coach
  on bridge_play_submissions (coach_id, created_at desc);
create index if not exists idx_play_submissions_learner
  on bridge_play_submissions (learner_id, created_at desc);
create index if not exists idx_play_submissions_session
  on bridge_play_submissions (session_id);

create table if not exists bridge_play_comments (
  comment_id text primary key,
  submission_id text not null references bridge_play_submissions(submission_id) on delete cascade,
  author_id text not null,
  author_name text,
  body text not null,
  created_at timestamptz not null
);
create index if not exists idx_play_comments_submission
  on bridge_play_comments (submission_id, created_at);
