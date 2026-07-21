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

**KNOWLEDGE REWORK (2026-07-14, supersedes the phase history below).** The
platform was rebuilt fresh-start per
`laicdocs/Bridge_Platform_Knowledge_Rework_Spec_v1.md` (authoritative; the
interview-derived spec elaborating the owner's rework PDF). Stages A–G all
landed 2026-07-14:

- **@bridge/kb** owns the model: knowledge BASES are the unit of
  compilation/compatibility (SAYC, 2/1, …); items are typed
  (11 knowledgeTypes, structured payloads in a regex-free knowledge
  language), carry INLINE settings (enable gates + $setting parameters),
  cite passages, and fork on divergence when shared across KBs. Edges
  (requires/conflicts_with/teaches/exception_to) drive validation.
  Status (draft→approved) is a trust badge, never a gate.
- **Every save auto-recompiles** with last-good protection: broken compiles
  never serve; the workspace banners the exact error. CompiledKb artifacts
  are immutable; sessions pin compileId + per-seat config snapshots.
- **Engine**: game-law layer (events, legality, Law-77 scoring, undo) kept;
  decision layer v2 interprets CompiledKb — policies first_match /
  weighted_random (session-seeded) / level_capped; pack fallback ITEMS act
  before the engine floor, which is honestly labeled and never counts as an
  agreement.
- **Players are assembled**: KNOWLEDGE SETS (packs) pick items — the ladder
  was retired 2026-07-17 (sets are flat; `extendsPackId` lives on as an
  optional "Includes"; ordinals/levels are legacy). Settings tune within;
  the 17-category checklist gates `valid` (shown complete/incomplete).
- **Versioning is four-layered** — item head revisions, committed item
  versions, KB releases, auto-snapshotted set versions (every set save,
  deduped, restorable; migration 0017). Invariants/code map/traps:
  `Applications/BridgePlatform/docs/versioning.md` — read before touching
  @bridge/kb's service or stores. Releases do NOT yet gate live tables
  (sessions pin the draft liveCompile). Fellow-facing docs live in-app at
  /bridge/guide.
- **Constrained drills** (spec §5): the closed loop — a deal is safe for an
  incomplete player only if full simulation with the actual configs ends
  with zero engine-floor events (findSafeSeed).
- **Extraction v2**: one-shot structured — upload (txt/md/pdf) →
  deterministic passages → per-section Claude jobs must emit compilable
  items (the compiler IS the schema gate) or fail visibly into the job
  report. Needs ANTHROPIC_API_KEY. Claude never decides play.
- **UI** (paper/ink design language, spec §8): /bridge/kb workspace
  (dashboard+tabs: Items/Ladder/Sources/Players/Suggestions/Activity, typed
  item editors, source side-by-side); /bridge/table verification-first
  table (decision traces → item links, flag→suggestion queue, learner
  mode). REST under /api/bridge/kbs + /api/bridge/sessions.
- **Wiped** (owner decision: hard wipe): all pre-rework content, packages
  (knowledge/dealer/evaluator/progress), sessions, boards, sources.
  KEPT: identity (org profiles §3.4–3.5, user profiles, affiliations),
  audit log, taxonomy. Progress/evaluator re-emission for Coaching is
  deliberately deferred; laic-learner-contracts is untouched.
- **Operations (2026-07-20)**: migrations 0013–0017 are ALL applied to the
  shared Supabase project. Production runs on the TheNexusDevTeam Vercel —
  https://nexus-bridge-79lkq4.vercel.app (rotated 2026-07-21 from the retired
  bridge-platform-theta domain; STORE_BACKEND=postgres; deploy `vercel --prod`
  from the repo root; run new SQL in the Supabase dashboard BEFORE deploying).
  Dev default remains STORE_BACKEND=file; Playwright is isolated on :3105
  (.data-e2e/.next-e2e). The old personal Vercel (bridge-platform-gules) is
  deprecated.
- **Curated SAYC template (2026-07-21)**: `packages/bridge-sayc-template`
  ships the complete authored system (openings→slam, leads/signals, expanded
  card play) as installable data — "Install curated SAYC" on /bridge/kb runs
  `installSaycTemplate` (batch puts + one recompile) and pins a Base release.
  The knowledge language gained aces/kings/keycards/holds predicates,
  lhoLast/ownFirst/partnerFirst auction memory, the bid_suit action, and 12
  legitimate-information play behaviors (playView.ts is the honesty boundary).
  Gates: 52-scenario conformance suite, 100-deal zero-floor self-play, 17/17
  completeness. Content stays out of @bridge/kb by design.
- **The live SAYC extraction ran** (2026-07-16): prod carries 119 items
  from the ACBL booklet, a complete flagship player (17/17, zero floors),
  and Floor/Full-booklet sets. Extraction failures surface as the
  Sources-tab "Sections that need a person" write-up queue.

Historical phase notes (pre-rework, for archaeology only):

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

Phase 17 (runtime & operations) is complete: Playwright suite in
apps/bridge-web/e2e (table play driven to completion through the real UI,
admin generation loop, org flows — `pnpm e2e`), the §7.3 responsive pass
(shell stacks on small screens, table grid restacks), and deployment
(2026-07-12):

- **Supabase**: migrations 0005–0012 are applied to the shared
  nexus-platform project; the Pg stores are live-verified (page renders,
  knowledge lazy-seed, full session create/start/step via the REST API).
  0012 exists because 0002 typed nexus_user_id as uuid — it is text now;
  the contract's nexusUserId is an opaque string (stub ids aren't uuids).
- **Deployment**: production runs at https://bridge-platform-gules.vercel.app
  (Vercel project `bridge-platform`, STORE_BACKEND=postgres,
  NEXUS_CLIENT_MODE=stub). Deploys go from the REPO root — the app depends
  on Components/laic-learner-contracts via link:, so the upload must span
  both; root .vercelignore scopes it. Project root directory is
  Applications/BridgePlatform/apps/bridge-web. Note: stub sign-in means
  anyone with the URL can enter as any test user — don't put real learner
  data behind it until NEXUS_CLIENT_MODE=http lands.
- Local dev default stays STORE_BACKEND=file (offline-friendly JSON stores).
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
