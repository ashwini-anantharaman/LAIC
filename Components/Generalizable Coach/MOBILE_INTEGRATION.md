# Mobile integration guide

The coach ships as a deployable HTTP service (`domains/bridge/api/`). A mobile
app (React Native, Flutter, native iOS/Android) is a thin client that calls the
REST API — the coaching engine, LLM key, and learner history all live on the
server. This is the recommended and universal path.

## Deploy the server

```
COACH_DB=/data/coach.db \        # SQLite file (persists learners + sessions)
COACH_API_KEYS=key1,key2 \       # bearer tokens; omit for an OPEN dev server
RATE_LIMIT_MAX=60 \              # requests/min per identity (0 = off)
RATE_LIMIT_WINDOW_MS=60000 \
ALLOWED_ORIGIN=https://your.app \ # CORS (default "*")
OPENAI_API_KEY=sk-... \          # or ANTHROPIC_API_KEY — stays server-side
PORT=3000 \
npm start
```

- `GET /health` → `{ status, domains, uptime }` — unauthenticated; use for load-balancer
  checks and keep-warm pings (cold starts are the main latency risk, not the network hop).
- All `/api/*` routes require `Authorization: Bearer <key>` when `COACH_API_KEYS` is set.

## The client loop

| Step | Call |
|---|---|
| Create learner | `POST /api/learners { name, preferences:{feedbackStyle,explanationDepth} }` → `{ learnerId }` |
| Start session | `POST /api/sessions { learnerId, domainId }` → `{ sessionId }` |
| On each move | `POST /api/sessions/:id/events { eventType, action }` → `{ response }` (silent \| nudge \| hint \| …) |
| Ask for help | `POST /api/sessions/:id/hint {}` → escalating `{ response }` |
| Free-form chat | `POST /api/llm/chat { system, user }` → `{ text, fromModel }` |
| Streaming chat | `POST /api/llm/chat/stream { system, user }` → SSE: `data: {delta}` … `data: {done,fromModel}` |
| End session | `POST /api/sessions/:id/end {}` |
| Postmortem | `GET /api/sessions/:id/postmortem` → `{ postmortem }` |
| What next | `GET /api/learners/:id/recommendation?domainId=…` → `{ recommendation, weakSkills }` |
| Domains | `GET /api/domains` → `{ domains }` |

Ownership is enforced when auth is on: a learner/session is bound to the token
that created it; other tokens get `403`.

### Streaming (progressive rendering)
`/api/llm/chat/stream` is Server-Sent Events. Read the response body incrementally,
split on `\n\n`, and for each `data: {json}` apply `delta` until `{done:true}`.
This hides the 1–3s model latency by showing text as it arrives.

## In-process option (React Native only)
The core package is UI-agnostic and browser-neutral, so it can run inside a
Hermes JS runtime instead of calling the server. You would:
- Provide a `LearnerRepo` / `SessionRepo` (see `platform/storage/ports.ts`) backed by
  `expo-sqlite` or `AsyncStorage` — the SQLite adapter is Node-only and won't run on-device.
- Keep calling the server's `/api/llm/chat` for model text (never embed the API key in the app).
- The DDS solver runs on the JS thread; keep it off the UI thread on low-end devices.

Native (Swift/Kotlin) and Flutter cannot run the TS engine in-process — use the server path.

## Not yet hardened (before public launch)
- Auth here is static bearer keys; wire it to your real identity provider for per-user accounts.
- Rate limiting is in-memory per instance; use a shared store (Redis) when running multiple instances.
- Ownership is tracked in-memory; persist it on the learner record for multi-instance/durable scoping.
- `Postgres` adapter (multi-instance scale) is a one-adapter add behind the storage ports — not built yet.
