# Bridge Platform

The Bridge Platform workstream of LAIC / MindBrainAI Nexus: the bridge app,
engine, event-sourced sessions, configurable AI players, knowledge-ingested
rule packages, constrained dealing, and the bridge learner-model evidence
layer.

**Plan:** `laicdocs/Bridge_Workstream_Execution_Plan_v1.md` (execution phases)
and `laicdocs/Bridge_Platform_Implementation_Plan_v2.md` (authoritative
architecture). Work proceeds phase by phase; each phase's acceptance criteria
must pass before moving on.

## Layout

```text
apps/
  bridge-web/          Next.js App Router app: table, config, progress, admin/KB
packages/
  bridge-engine/       game controller, state fold, legality, predicate library,
                       rule interpreter (consumes published rule packages)
  bridge-events/       event schemas, bus, replay helpers
  bridge-config/       setting-registry mechanics, resolver, convention card model
  bridge-formats/      PBN/LIN import/export, deal representation
  bridge-knowledge/    knowledge base schemas, gap registry, generation runs,
                       package builder (rules-as-data with source lineage)
  bridge-dealer/       constrained deal generation (structural + evaluator filters)
  bridge-evaluator/    judges committed human actions vs configured system
  bridge-progress/     progress-signal extraction, learner profile updates
  nexus-client/        NexusBridgeContext adapter (stub + real HTTP impls)
services/
  ben-service/         long-running BEN adapter container (Phase 11)
db/                    Drizzle schema + SQL migrations (Supabase Postgres)
```

Shared cross-platform contracts live in `Components/laic-learner-contracts`
(consumed via `link:` dependency).

## Commands

```sh
pnpm install     # from this directory (workspace root)
pnpm test        # all package tests (root vitest config)
pnpm typecheck   # tsc --noEmit across packages
pnpm build       # all packages + Next.js app
pnpm lint
```

## Development

```sh
pnpm --filter bridge-web dev   # http://localhost:3000
```

By default the app runs with `NEXUS_CLIENT_MODE=stub` (no env file needed):
`/welcome` shows a dev user picker with seeded users for each bridge role
(learner, coach, org admin, program admin, reviewer) in a sample world —
LAIC org → Bridge Program → Sunrise Bridge Club → Tuesday Beginners group.
Real Nexus context + Supabase sign-in activates in Phase 10 via
`NEXUS_CLIENT_MODE=http` (see `apps/bridge-web/.env.example`).

Convention: workspace packages use **extensionless relative imports**
(`./types`, not `./types.js`) — they ship TS source consumed by bundlers
(Next/Turbopack, Vitest), which do not remap `.js` specifiers.

## Key invariants (see execution plan §6)

- Rules are **data** in versioned packages, never hand-edited code; every rule
  carries provenance back to a human-readable knowledge item and cited source.
- Package status gates audience: `draft` (dev) / `review` (experts, flagged) /
  `published` (learners; all entries approved; immutable).
- Deterministic engine; attribution honesty (human/AI/BEN/fallback always
  distinguished); event-sourced single-writer game state.
- Domain isolation: everything stamped `domainId = "bridge"`; no context-free
  progress endpoints. LLMs assist ingestion only — never decide bids/plays.
