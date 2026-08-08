-- 0027: challenges (docs/challenges-v1-spec.md §4). A creator assembles 1–16
-- boards, picks scoring and invites players; everyone plays the SAME boards
-- from the SAME seat against BEN, and a silent BEN reference line is recorded
-- alongside. Six record kinds: the challenge, its boards, its invites, the
-- per-(board,user) plays, the BEN baselines, and the BEN decision cache that
-- makes identical lines meet identical opposition.
--
-- Jsonb-primary like 0015/0020/0026: the whole record lives in `record`;
-- scalar columns exist for the keys and for the filters the read paths use.
-- The `bridge_` namespace is deliberate — the Nexus backend's "challenge"
-- offering type is an unrelated cluster.

create table if not exists bridge_challenges (
  challenge_id text primary key,
  created_by text not null,
  status text not null default 'open',
  scoring text not null,
  record jsonb not null,
  created_at timestamptz not null
);

-- Read paths: "challenges I created" and the open/archived split on the list.
create index if not exists idx_bch_creator
  on bridge_challenges (created_by, created_at desc);
create index if not exists idx_bch_status
  on bridge_challenges (status, created_at desc);

-- One row per (challenge, board). Boards, seats and control overrides are
-- editable until the first participant starts a board, then frozen.
create table if not exists bridge_challenge_boards (
  challenge_id text not null,
  board_no int not null,
  record jsonb not null,
  primary key (challenge_id, board_no)
);

-- Platform-wide (cross-org) invites; the creator gets an auto-accepted row.
-- `moderator` is per-invite (ADDENDUM A2) and drives early sight of standings.
create table if not exists bridge_challenge_invites (
  challenge_id text not null,
  user_id text not null,
  status text not null default 'pending',
  moderator boolean not null default false,
  record jsonb not null,
  invited_at timestamptz not null,
  primary key (challenge_id, user_id)
);

-- Read path: "the challenges I was invited to" on the list page.
create index if not exists idx_bci_user
  on bridge_challenge_invites (user_id, invited_at desc);

-- ONE ATTEMPT per (challenge, board, user) — the primary key IS the integrity
-- rule: starting a board is the attempt, resume updates the row, and the first
-- completion is the scored result forever.
create table if not exists bridge_challenge_plays (
  challenge_id text not null,
  board_no int not null,
  user_id text not null,
  session_id text not null,
  status text not null default 'in_progress',
  record jsonb not null,
  started_at timestamptz not null,
  primary key (challenge_id, board_no, user_id)
);

-- Read paths: the field on a board / the scorecard grid (by challenge), the
-- viewer's own progress (by user), and the table's challenge strip (by session).
create index if not exists idx_bcp_challenge
  on bridge_challenge_plays (challenge_id, status);
create index if not exists idx_bcp_user
  on bridge_challenge_plays (user_id, challenge_id);
create index if not exists idx_bcp_session
  on bridge_challenge_plays (session_id);

-- BEN reference lines. `full_ben` is one per board; `your_contract` and
-- `from_point` are per user (and per ply) and computed on demand, so the
-- composite identity is flattened into `baseline_id` for the upsert key.
create table if not exists bridge_challenge_baselines (
  baseline_id text primary key,
  challenge_id text not null,
  board_no int not null,
  kind text not null,
  user_id text,
  ply int,
  status text not null default 'pending',
  record jsonb not null,
  created_at timestamptz not null
);

create index if not exists idx_bcb_board
  on bridge_challenge_baselines (challenge_id, board_no);
create index if not exists idx_bcb_pending
  on bridge_challenge_baselines (status, challenge_id);

-- The fairness cache (spec §3): every BEN decision inside a challenge, keyed by
-- the position history. Any participant reaching the same position gets the
-- cached decision, so identical lines face identical opposition BY
-- CONSTRUCTION and repeat positions cost zero BEN calls.
create table if not exists bridge_ben_decisions (
  challenge_id text not null,
  board_no int not null,
  history_hash text not null,
  decision jsonb not null,
  created_at timestamptz not null,
  primary key (challenge_id, board_no, history_hash)
);

-- Per-challenge call volume — the §10 BEN cost check.
create index if not exists idx_bbd_challenge
  on bridge_ben_decisions (challenge_id);

alter table bridge_challenges enable row level security;
alter table bridge_challenge_boards enable row level security;
alter table bridge_challenge_invites enable row level security;
alter table bridge_challenge_plays enable row level security;
alter table bridge_challenge_baselines enable row level security;
alter table bridge_ben_decisions enable row level security;
