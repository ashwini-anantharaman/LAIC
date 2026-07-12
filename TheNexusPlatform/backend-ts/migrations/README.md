# Migrations (canonical, TypeScript backend — Nexus v0.4)

Hand-written SQL is the **single source of truth** for the schema and, per v0.4,
for RLS policies. `npm run migrate` applies every `*.sql` here in lexical order
against `DATABASE_URL`. Drizzle (`src/db/schema.ts`) mirrors these tables for
typed queries only — it does **not** generate migrations.

| File | Purpose |
|---|---|
| `0000_local_auth_shim.sql` | Creates `auth.uid()` only if missing, so the RLS policies apply on plain Postgres (local/RDS/CI). No-op on Supabase. |
| `0001_schema.sql` | Learning base tables (courses, units, …) + org-link columns. |
| `0002_platform.sql` | Organizations, challenges, stage_nodes, join_codes, memberships, student_registrations. |
| `0003_programs.sql` | Programs; program-scoped join codes + memberships. |
| `0004_nexus_addendum.sql` | Program labels, integrations, canonical `instructor` role, **org-scoped RLS**. |
| `0005_offerings_apps_hook.sql` | Offerings, registered_apps, registrations, participants, launch tokens (+ RLS). |
| `0006_audit_entitlements.sql` | Audit events, entitlements (+ RLS). |

These were promoted from the legacy Python backend (`../backend/supabase/`), which
is now deprecated. New migrations (e.g. Slice 2's backend-enforced RLS) go here.
