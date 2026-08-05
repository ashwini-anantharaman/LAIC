# Platform schema packs (Phase 4)

Each external platform's data lives in this shared, org-scoped cluster — inside
the organization space, behind its own service role. Packs run **after** the
core chain (they rely on `0022_platform_services.sql`), each pack's files in
lexical order, replayed on every `npm run migrate` — so **every file must be
idempotent** (end-state schemas, never drop-and-rebuild histories).

| Pack | Source of truth | Service role | Contents |
|---|---|---|---|
| `bridge/` | `Applications/BridgePlatform/db/migrations` (squashed end-state as of `0016_kb_versioning`) | `bridge_service` | identity/audit/taxonomy + jsonb-primary `bridge_kb_*` world |
| `learning/` | `Components/laic-learning-platform` `src/lib/supabase.ts` row shape + org partition keys | `learning_service` | `learning_objects` |

## The two walls (each pack's `9000_nexus_hardening.sql`)

1. **Not the console's data.** `nexus_app` is revoked on every platform table —
   Nexus governs the org boundary; it cannot read an org's platform content,
   just as it cannot read an org's people (core `0021`).
2. **Per-org row filter.** Policies are granted to the platform's service role
   only. Org-scoped columnar tables run through `nexus_platform_org_check()`:
   when the service sets `app.platform_org_scope` per request (Phase 5/6
   wiring), rows outside the caller's org disappear at the database; unset GUC
   = service-level trust (pre-wiring behavior, no breakage).

## Syncing the bridge pack

The Bridge repo owns its schema evolution. When it gains a migration, mirror
the delta here **additively** (never copy destructive steps — the runner
replays everything). `0002_bridge_taxonomy_seed.sql` is the verbatim taxonomy
seed from Bridge's `0009`.
