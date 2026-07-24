-- 0018: BEN Bidding Benchmark (Pillar B — the bridge expert's objective
-- assessment tool). Jsonb-primary like 0016/0017: the full record lives in
-- `record`; scalar columns exist for identity/tenant/ordering only.
--
-- Two entities: an append-only RUN artifact (pinned to a compile, growing its
-- divergences batch by batch) and a mutable MARKING (a human "system
-- difference" verdict, kbId-scoped, keyed by divergence signature so it
-- survives re-runs). Additive only — no existing table is touched.

-- Append-only benchmark run: Nitin's params, compile pin, cursor, divergences,
-- and stats all round-trip through `record`.
create table if not exists bridge_kb_benchmark_runs (
  run_id text primary key,
  kb_id text not null,
  record jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists idx_kb_benchmark_runs_kb
  on bridge_kb_benchmark_runs (kb_id, created_at desc);

alter table bridge_kb_benchmark_runs enable row level security;

-- Mutable "system difference" markings, keyed by divergence signature.
create table if not exists bridge_kb_benchmark_markings (
  marking_id text primary key,
  kb_id text not null,
  record jsonb not null,
  created_at timestamptz not null
);
create index if not exists idx_kb_benchmark_markings_kb
  on bridge_kb_benchmark_markings (kb_id, created_at desc);

alter table bridge_kb_benchmark_markings enable row level security;
