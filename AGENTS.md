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
- `Bridge_Workstream_Execution_Plan_v1.md` — Bridge phase-by-phase execution plan
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

Work proceeds in phases per `laicdocs/Bridge_Workstream_Execution_Plan_v1.md`
(currently: Phases 0–6 complete — shell, contracts, engine + interpreter,
knowledge base with published Beginner Natural v0, persistent sessions,
playable table with citation-resolving Why panel, constrained dealing with
evaluator-filtered teaching scopes, package-backed player profiles with
generated convention cards, evaluator + learner-model evidence layer with
domain-scoped progress signals, ingestion jobs + Level-2 content + §19.3
quality gates). Before touching bridge code, read that plan's
§1 (locked decisions) and §6 (cross-cutting invariants). The short version:

- **Rules are data**, in versioned knowledge packages with cited sources —
  never hand-edited rule code. The engine interprets published packages.
- Package status gates audience: `draft` (dev) / `review` (experts, flagged) /
  `published` (learners; all entries human-approved; immutable).
- Deterministic engine, event-sourced single-writer game state, attribution
  honesty (human/AI/BEN/fallback always distinguished).
- Domain isolation: everything stamped `domainId = "bridge"`; no context-free
  progress endpoints; the interpreted learner model belongs to Coaching, not
  Bridge.
- **LLMs never decide bids/plays or evaluate learners** — ingestion assistance
  only, with human approval before publication.

## Cross-workstream integration points

- Bridge → Nexus: `NexusBridgeContext` (contracts package), served by
  `GET /api/platform/bridge/context` (Nexus backend; lands in Bridge Phase 10).
- Coaching → Bridge: subscribes to bridge events and calls the bridge
  evaluator API (Bridge Phase 12); coaching's own bridge-domain evaluator in
  `Generalizable Coach` should eventually delegate to it.
- Learning → Bridge: domain activity launch/completion contract
  (Learning plan §13.3; Bridge Phase 12).
