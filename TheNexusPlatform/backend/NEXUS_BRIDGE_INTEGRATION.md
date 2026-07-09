# Bridge Program integration surface — review notes for the Nexus owner

Added by the **Bridge workstream** under the build-what-you-need rule
(Bridge plan §3.3, §16.1; execution plan Phase 10). Please review; nothing
else in this backend was modified.

## What was added

| File | Change |
|---|---|
| `app/routers/bridge_context.py` | New router: `GET /api/platform/bridge/context` |
| `app/config.py` | Three settings: `laic_org_id`, `bridge_program_admin_emails`, `bridge_reviewer_emails` |
| `app/main.py` | `include_router(bridge_context.router)` |
| `tests/test_bridge_context.py` | Mapping tests (auth dependency-overridden; no Supabase needed) |

## The contract

The endpoint assembles the `NexusBridgeContext` consumed by
`Applications/BridgePlatform` (type in `Components/laic-learner-contracts`).
It is a **thin projection of existing Nexus data** — no new program/offering
model:

- **Organization** membership → Bridge Program Organization scope
  (`programOrganizationId` = `org_id`)
- **Stage scope** on the membership → `groupId`
- **Membership roles**: `owner`/`administrator` → `bridge_org_admin`,
  `teacher` → `bridge_coach`, `student` → `bridge_learner`
- **Program-level roles** (`bridge_program_admin`, `bridge_reviewer`+`fellow`)
  are seeded from env (`BRIDGE_PROGRAM_ADMIN_EMAILS`, `BRIDGE_REVIEWER_EMAILS`,
  comma-separated) until a proper grant UI exists
- Auth is the existing `get_current_user` (Supabase JWT via service-role
  verification); local-store fallback behaves as everywhere else

## Known simplifications (flagged, not hidden)

1. Only the FIRST membership is projected; multi-org coaches must switch
   context explicitly later (Bridge plan §3.5 wants many-to-many
   `bridge_coach_affiliations` — deferred until real demand).
2. `laicOrgId` is a config constant until a real LAIC org row exists.
3. No `bridge_org_profiles` gating yet: every org is treated as a
   bridge-enabled club. Add the profile-extension table when orgs need
   bridge-specific settings (allowed systems, BEN policy — Bridge plan §3.4).

## When you generalize

Keep the response shape stable (it is the cross-workstream contract) — the
mapping internals are yours to change.
