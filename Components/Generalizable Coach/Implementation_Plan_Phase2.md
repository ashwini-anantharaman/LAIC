# Phase 2 — Durable, Pluggable, Deployable

**Context:** Phase 1 delivered the in-memory coaching loop (bidding + card play + chat), and a later refactor made `platform/` domain-pure. Phase 2 turns that demo-grade engine into something production-viable. It adds **no new coaching behavior** — it makes the coaching we have durable (persists), pluggable (a domain registry), and safe to ship (the model key stays server-side).

**Architecture principle (unchanged):** the platform core never says "bridge"; storage, LLM, and domains all sit behind interfaces. Persistence is introduced as **ports + adapters** so the in-memory path stays the default (fast tests, browser-safe) and SQLite is a Node-only adapter that never enters the browser bundle.

---

## Phase 2a — Foundation (this phase)

### Step 1 — Storage ports + in-memory adapters
**Build:** `platform/storage/ports.ts` with two interfaces:
- `LearnerRepo { get(learnerId): LearnerProfile | null; put(profile): void }`
- `SessionRepo { save(session): void; get(sessionId): Session | null; getByLearner(learnerId): Session[] }`

Plus `platform/storage/memory.ts` with `InMemoryLearnerRepo` (and the existing `SessionStore` conforms to `SessionRepo`).

**Done when:** interfaces compile; in-memory adapters behave exactly as the current Maps.

### Step 2 — Refactor LearnerStore + SessionEngine onto the ports
**Build:** `LearnerStore` takes a `LearnerRepo` (default in-memory); its methods do **get → mutate → put** so mutations persist through any adapter. `SessionEngine` takes a `SessionRepo` (default in-memory) and calls `save()` after every mutation (log event, log interaction, end). Mastery logic and session lifecycle are unchanged.

**Done when:** every existing learner-model and session test passes untouched.

### Step 3 — SQLite adapters (Node-only)
**Build:** `platform/storage/sqlite/` with `SqliteLearnerRepo` + `SqliteSessionStore` backed by `better-sqlite3`, storing each entity as a JSON blob keyed by id (sessions also indexed by `learner_id`). **Not exported from `index.ts`** — the browser bundle must never import a native module. Own tests verify data survives a new repo instance pointing at the same file (i.e. survives a "restart").

**Done when:** write a profile + session, open a fresh repo on the same file, read them back intact.

### Step 4 — Inject stores into the coach + wire the server to SQLite
**Build:** `buildBridgeCoach` accepts optional `learnerStore` / `sessionEngine`. `createServer` constructs SQLite-backed stores (db path from `COACH_DB` env, default `./coach.db`) and passes them in. The server already runs the coach server-side.

**Done when:** create a learner + session via the API, restart the server, the learner/session are still there.

### Step 5 — Domain registry + server-side LLM (the "front desk" and the "safe door")
**Build:**
- `platform/embed/registry.ts`: `registerDomain`, `getRegisteredDomain`, `listDomains`, and `openCoachSession(domainId, opts)` (resolves a registered domain and delegates to `createCoreCoachSession`). Bridge self-registers via a side-effect module imported from `index.ts`. Does **not** change the existing `createCoachSession`.
- Server holds the model key: `createServer` builds its LLM from env (`withOfflineFallback(new LLMClient())`) so the key stays on the server; add `POST /api/sessions/:id/chat` (browser posts a question → server calls the model) and `GET /api/domains`.

**Done when:** `listDomains()` returns `["bridge_gameplay"]`; `openCoachSession("bridge_gameplay", {learnerId})` coaches; the chat endpoint answers without the key ever reaching the client.

**Acceptance for 2a:** full coach test suite green; SQLite persistence verified across a restart; `bridgebot-new` still typechecks/builds against the rebuilt dist (public API unchanged).

---

## Phase 2b — Adaptivity  ✅ COMPLETE (2026-07-04)
- **Common Coach build-out** — `platform/common-coach/`: `detectWeakSkills` (ranked), `recommendNextSkill` (reinforce_weak / build_up / explore), `summarizeLearner`. Wired into `LearnerStore.getCommonCoachPackage` (weakSkills ranked + `recentFeedbackSummary`) + new `getWeakSkills`/`recommendNextSkill` methods. Server: `GET /api/learners/:id/recommendation`.
- **Postmortem generator** — `platform/common-coach/postmortem.ts` `generatePostmortem(session, weakSkills)`; exposed as `CoachSession.postmortem()` + `GET /api/sessions/:id/postmortem`.
- **Hybrid retrieval** — `platform/knowledge/embeddings.ts`: `EmbeddingProvider` port, `cosineSimilarity`, `HybridRetriever` (keyword+embedding blend, keyword fallback), `OpenAIEmbeddingProvider`. `createCoreCoachSession` takes optional `embedder`; chat uses hybrid when present (chunk vectors cached per session), else keyword.
- Verified: 112/112 tests (added common-coach, postmortem, embeddings, coachApi suites), tsc clean, dist rebuilt (new symbols exported, native module still excluded), `bridgebot-new` tsc clean, facade e2e (`FACADE_2B_PASS`).

## Phase 2c — Productionize the coach service for mobile  ✅ COMPLETE (2026-07-04)
Turns the working REST API into something safe to put behind a real mobile app. All additive and opt-in so existing tests/consumers are unaffected.

**Shipped:** `security.ts` (bearer auth + per-identity ownership + token-bucket rate limit, all opt-in via options/env); `createServer` gained `/health`, `/api` auth+rate-limit middleware, ownership checks on learner/session routes, injectable proxy LLM, and `POST /api/llm/chat/stream` (SSE). `MOBILE_INTEGRATION.md` documents the REST loop + RN in-process option. Tests: `security.test.ts` (6), `mobileFlow.test.ts` (4, real HTTP: health/401/ownership-403/full loop/SSE). **Postgres deferred** (documented — needs live DB; SQLite fine for pilot). Verified: 122/122 tests, tsc clean, dist browser-safe (server code + native module absent), bridgebot-new tsc clean.

### Step 1 — Auth + per-user scoping (opt-in)
`domains/bridge/api/security.ts`: bearer-key auth (`COACH_API_KEYS` env / `apiKeys` option). When no keys configured → open (local dev, current behavior). When configured → `/api/*` requires `Authorization: Bearer <key>` (401 otherwise). Per-user ownership: learners/sessions are tagged with the caller's identity; cross-owner access → 403. CORS allow-headers gains `authorization`.

### Step 2 — Rate limiting + health + injectable proxy LLM
Token-bucket limiter (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` env / option; off by default) → 429 when exceeded. `GET /health` (status, domains, uptime; unauthenticated). `CreateServerOptions.llm` used by the proxy endpoints (default `new LLMClient()` from env) so streaming/chat are deterministically testable.

### Step 3 — SSE streaming chat
`POST /api/llm/chat/stream`: `text/event-stream`, emits `data: {delta}` chunks then `data: {done,fromModel}`. Contract-first (chunks the proxy LLM's reply) so a mobile client can render progressively; real token streaming slots behind the same contract later.

### Step 4 — Reference client flow + guide
`MOBILE_INTEGRATION.md`: the REST flow (create learner → session → events → hint → chat/stream → postmortem → recommendation), auth, and the React-Native in-process option (write a `LearnerRepo`/`SessionRepo` over expo-sqlite; key stays server-side). A `mobileFlow.test.ts` e2e walks the full authed flow (401 without token, success with) — the executable "reference client". Plus unit tests for auth, rate-limit, streaming.

### Deferred (documented, not built)
- **Postgres adapter** behind `LearnerRepo`/`SessionRepo`: the multi-instance scale path. Deferred because verifying it needs a live DB; SQLite persists fine for a pilot. It's a one-adapter add thanks to the 2a ports.

**Acceptance for 2c:** full coach suite green; unauthenticated/over-limit requests rejected; SSE stream assembles a reply; the reference flow completes with a token; dist stays browser-safe; `bridgebot-new` still compiles.

## Phase 3 — Knowledge Platform
- Ingestion MVP: doc + Ingestion Intent → structural chunking → LLM tagging with the domain taxonomy → draft `KnowledgePackage` into a review queue.
- Admin/Review: approve / edit / publish; version packages; index published packages (embeddings).

## Phase 4 — Breadth & delivery
- A second real domain (bridge **config**: `setting_changed` → conflict/dependency validator → explanation).
- Mobile-first coach UI (bottom sheet + postmortem screen).
- Analytics: normalize the event log → mistake heatmaps feeding the recommender.

---

## Step dependencies (2a)
```
Step 1 (ports) → Step 2 (refactor stores) → Step 3 (sqlite) → Step 4 (wire server)
Step 5 (registry + proxy) is independent of 1–4 and can land alongside.
```
