# AGENTS.md — orientation for AI agents and new contributors

This is the team monorepo for the **LAIC / MindBrainAI Nexus** educational
platform. Read this first, then the README of the folder you're working in.

## Architecture docs (authoritative)

The full architecture/implementation plans live in the **`laicdocs/` folder,
sibling to this repo** (`../laicdocs` from the repo root — not committed here).
Key documents:

- `LAIC_Platform_Master_Implementation_Map.md` — who owns what, dependency map
- `Nexus_Platform_Implementation_Architecture_v2.md` — Nexus platform
- `Learning_Platform_Implementation_Plan_v2.md` — Learning platform
- `Coaching_Platform_Implementation_Plan_v2.md` — Coaching platform
- `Bridge_Platform_Implementation_Plan_v2.md` — Bridge platform
- `learner-model-architecture-context.md` — how the learner model is split across platforms
- `Shared_Data_Model_and_API_Contract_v1.md` — shared types, contexts, API contracts
- `App_Shell_Implementation_Spec.md` — app shell / launch context

On any conflict between code comments and these docs, the docs win.

## Repo layout and ownership

Each top-level project is **self-contained** (own package.json / lockfile /
env files). There is no repo-root workspace — install and run from within the
project folder you're working on.

| Path | What it is | Workstream |
|---|---|---|
| `TheNexusPlatform/backend` | FastAPI + Supabase: auth, orgs, memberships, roles, join codes | Nexus |
| `TheNexusPlatform/frontend` | React/Vite admin UI + persona prototypes | Nexus |
| `Components/Generalizable Coach` | Domain-agnostic adaptive coaching runtime (bridge is its first domain) | Coaching |
| `Components/newtutor-main` | LAIC learning platform (6 agents, BKT, RAG) | Learning |
| `Components/laic-learner-contracts` | **Shared, types-only** cross-platform contracts | Shared (see below) |
| `Applications/BridgePlatform` | Bridge app + engine + knowledge pipeline (pnpm workspace) | Bridge |

Ground rules:

- **Don't modify another workstream's folder without coordinating** with its
  owner. Adding integration *surfaces* for your own workstream is normal;
  changing someone else's internals is not.
- New end-user apps go in `Applications/`. Reusable cross-platform building
  blocks go in `Components/`.
- **`Components/laic-learner-contracts` is a shared contract.** It is
  types-only, transcribed from the docs above. Changes require agreement from
  the consuming workstreams (currently Bridge; intended for Coaching and
  Learning). Do not casually edit field shapes.

## Quickstart per project

```sh
# Bridge Platform (pnpm workspace)
cd Applications/BridgePlatform
pnpm install && pnpm test && pnpm typecheck && pnpm build

# Shared contracts (types-only)
cd Components/laic-learner-contracts
pnpm install && pnpm typecheck

# Nexus backend (FastAPI)
cd TheNexusPlatform/backend
# see its README: python venv, pip install -r requirements.txt, .env from .env.example, uvicorn

# Nexus frontend, Generalizable Coach, newtutor-main
# each has its own README with install/run instructions
```

Supabase: the platform uses a shared Supabase project for identity
(`nexusUserId` = Supabase auth user id). Env files are never committed — copy
the folder's `.env.example`.

## Bridge Platform specifics (Applications/BridgePlatform)

Work proceeds in numbered phases. Phases 0–14 are complete: shell, contracts,
engine + interpreter, knowledge base + generated Beginner Natural packages,
persistent sessions, playable table with citation-resolving Why panel,
constrained dealing with evaluator-filtered teaching scopes, package-backed
player profiles with generated convention cards, evaluator + learner-model
evidence layer, ingestion jobs + Level-2 content, coach-owned teaching
scopes, Coaching/Learning integration surfaces, provenance-over-approval
revamp with coach book→player tooling (LLM extraction citing exact passages,
real online sources), and the table/play completion (Law 77 scoring, session
lifecycle event stream in its own seq space, position snapshots with
exact-package resume, PBN/LIN import/export with attribution-honest imported
histories, board library + share links, server-rendered replay viewer,
per-user table profiles with feedback modes). Phase 15 (knowledge, taxonomy
& content machinery) is complete: the full 32-skill §13.5 taxonomy + concept
taxonomy live in @bridge/taxonomy (mirrored to SQL in migration 0009), skill/
concept tags flow knowledge item → generated rule entry → evaluator →
progress (RULE_SKILL_MAP retired — attribution always comes from the
session's pinned package version), ingestion intents (§12.5) focus and are
stamped on extraction jobs, the Knowledge Browser shows the reviewed rule
side-by-side with its cited source passage, the §19.3 test-hand gate warns on
rules no golden board exercises and run diffs list affected tests, and
presets are package content (configuration_preset items → pkg.presets;
BN_PRESETS is a legacy fallback for pre-15 versions). Still open from 15's
content program (fellow work, ongoing): SAYC v1, 2/1 v1, more golden boards,
citation verification; the optional pgvector search layer is parked with the
Supabase work. The first prototype content port landed 2026-07-12: the NT
toolkit (strong 2♣, 2NT opening, weak twos, Stayman, Jacoby transfers) as
knowledge items — SAYC-booklet paraphrase citations where published, the
registered src_claude source for prototype judgments (owner's sourcing
policy: Claude is NAMED as the source when no external source exists).
Sandboxes shipped with it: a coach curates which settings a learner may
touch (BridgeSandbox, migration 0011); learners configure players inside
the sandbox with server-side exposure enforcement on every edit path.

Phase 16 (platform, security & org model) is complete: @bridge/audit is an
append-only trail of every privileged mutation (generation, item edits, gap
resolution, source uploads, profile/scope changes, org admin, undo) with an
admin view at /bridge/admin/audit; server actions and knowledge APIs check
context.permissions (requirePermission), not just area roles; the full §16.2–
16.4 REST surface exists (sessions start / seat-assignments — mutable only
before the first action — / actions/bid / actions/play / events / undo;
player-profiles + configurations with resolve / convention-card / clone;
knowledge sources / ingestion-jobs / gaps / readable-items GET-POST-PATCH /
generation-runs + diff; approve/reject/publish return explicit 410s per
deviation 6); and the §3.4–3.5 org model is in (org profiles with allowed
systems + allowAi/allowBen enforced at session creation, many-to-many coach
affiliations — pending unless self-administered — with explicit context
switching applied in getBridgeContext, /bridge/org UI, migration 0010).

Phase 17 (runtime & operations) is code-complete: Playwright suite in
apps/bridge-web/e2e (table play driven to completion through the real UI,
admin generation loop, org flows — `pnpm e2e`), and the §7.3 responsive pass
(shell stacks on small screens, table grid restacks). Still blocked on
external access, not code:

- **Supabase**: apply migrations 0005–0010, live-verify the five Pg stores,
  then flip STORE_BACKEND=postgres as the team default (needs a Supabase
  sign-in; JSON file stores remain the dev default meanwhile).
- **Deployment**: Vercel web + managed Postgres (§17.2 Option A) — needs
  Vercel account access.
- **BEN adapter**: deferred by decision 2026-07-12 — the ben-service
  container stays parked until a BEN table server is available; org profiles
  already carry the allowBenPlayers switch (default off).

Phase 10 shipped: shared Supabase project 'nexus-platform' exists (bridge
migrations applied, RLS on); GET /api/platform/bridge/context added to
TheNexusPlatform backend — see
TheNexusPlatform/backend/NEXUS_BRIDGE_INTEGRATION.md for the review notes.
Locked invariants for anyone touching bridge code:

- **Rules are data**, in versioned knowledge packages with cited sources —
  never hand-edited rule code. The engine interprets generated packages.
- **Provenance over approval** (deviation 6): every rule click-throughs to a
  readable knowledge item and its cited passage. Generated versions are
  immutable (sessions pin them); uncited items are badged, never blocked.
- Deterministic engine, event-sourced single-writer game state, attribution
  honesty (human/AI/BEN/fallback always distinguished).
- Domain isolation: everything stamped `domainId = "bridge"`; no context-free
  progress endpoints; the interpreted learner model belongs to Coaching, not
  Bridge.
- **LLMs never decide bids/plays or evaluate learners** — ingestion assistance
  only; extracted items are attributed, editable content citing exact passages.

## Cross-workstream integration points

- Bridge → Nexus: `NexusBridgeContext` (contracts package), served by
  `GET /api/platform/bridge/context` (Nexus backend; lands in Bridge Phase 10).
- Coaching → Bridge: subscribes to bridge events and calls the bridge
  evaluator API (Bridge Phase 12); coaching's own bridge-domain evaluator in
  `Generalizable Coach` should eventually delegate to it.
- Learning → Bridge: domain activity launch/completion contract
  (Learning plan §13.3; Bridge Phase 12).
