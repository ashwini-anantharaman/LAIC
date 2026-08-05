# Nexus — Recent Updates & Access-Control Enforcement Guide

This doc has two parts:

1. **What shipped** — a themed changelog of the work completed against the two
   product-review docs, so the team has one place to see it.
2. **Access-control: server-side capability enforcement** — the concrete spec
   for *how a server verifies a capability*. The original Access-Control JSON
   doc hand-waved this ("check `capabilities` at actions/APIs"); this is the
   missing, hand-off-ready section.

---

# Part 1 — What shipped

## People, Roles & Access Control
- **"People" management at all three levels** — Nexus (platform operators),
  Organization, and Program — with a consistent design; renamed the old
  "Team & Roles" to **People** everywhere.
- **Custom roles** built from real, accessible areas (not placeholder presets),
  with **view / edit** access per area; editing a role takes effect immediately.
- **Multiple administrators** at org and program level, with an "Assign admins"
  flow after creation (not just at creation).
- **Groups vs. Roles** (Discord-style): roles = permissions, groups =
  organizational placement; a per-role "display as its own group" toggle, and
  people can belong to multiple groups.
- **Hierarchical, collapsible groups** — groups can nest (e.g. "Bridge Squad" →
  "Littles"), shown as an expandable tree; empty groups are hidden.
- **Large member lists** (e.g. bridge learners) collapse into paginated, nested
  sections instead of an endless flat list.

## Navigation & Loading Quality
- **Direct loading** — opening an org/program/platform lands you there without
  the old chain of redirects; refreshing keeps you in place.
- **No theme "flash"** — the correct brand color/logo paints immediately and
  updates live when changed (no manual refresh).
- **Log out returns to the org's own sign-in page**, not the generic Nexus login.
- **Level-aware "Back" button** — reflects where you actually are (e.g. "Back to
  the program"), and only shows if you have access to go there.
- **Nested platforms open in a new tab** (with a clear icon), so the console
  stays put instead of navigating away.

## Theming & Branding (every level)
- Editable **name, logo, and accent color** for Nexus, each Organization, and
  each Program — logo uploads work in production.
- Programs can set their own theme or **revert to the organization's**.
- The **browser tab title + favicon** reflect wherever you are (e.g. "Brain Bee
  Program · Life in AI Center").
- Separated user-level light/dark mode from org-level branding; simplified the
  color picker.

## Programs & Features
- **Org-defined categories** (e.g. Academic, Sports) replacing hardcoded ones,
  with **stack/grid views** on the Programs page.
- **Program capacity** — cap (or leave unlimited) how many programs an org may
  create.
- **Feature consistency** — an org sees exactly the features Nexus enabled for
  it; toggling a feature off is reflected immediately.

## Learning Platform Integration (major)
- Fully **integrated the Learning Platform into Nexus, in parallel with Bridge**:
  single Nexus login/identity, launch-token handoff, its own People tab, deployed
  as its own app.
- **Moved the developer's separate Supabase content into our shared database**,
  org-scoped, with reads/writes routed safely through our backend (no public
  data exposure).
- **Invite flow** (link → set password → sign in) and a **standardized,
  hierarchical role-creation system** — a reusable "access manifest" that defines
  areas, view/edit, and cascading grants; the same system drops onto Bridge with
  no new work.
- **"Test as" a role** inside the platform, plus auto-launching an assigned
  member straight into it.

## Mobile Responsiveness
- Sidebar collapses to a **hamburger menu** on phones; breadcrumb hidden to keep
  the top bar clean.
- **Data tables reflow into stacked cards** so nothing scrolls sideways on a phone.
- Page headers, toolbars, and dialogs adapt (stack / wrap / scroll) to small
  screens; sleeker dashboard stat tiles.

## Housekeeping
- Removed the non-actionable "Isolation OK" indicator from the Nexus dashboard.

---

# Part 2 — Access control: server-side capability enforcement

> Context: platforms publish an **access manifest** — a hierarchy of grantable
> nodes, each mapping `view` / `edit` to a set of **capabilities** (atomic
> action strings like `create_object`). A role is stored as `{ node: level }`.
> The front-end already gates the UI (which screens show, view vs edit). This
> section covers the **authoritative** layer: verifying capabilities on the
> server so the gate is real, not just visual.

## The one principle

**The server derives the caller's capabilities from the stored role + manifest
on every request. It never trusts anything the client claims.** The client's
`can()` is for hiding buttons (UX); the server's check is the actual gate.

## Three building blocks

### 1. The manifest must be readable by the server
Today the manifest is checked into the platform's **front-end**. For enforcement,
the backend that performs the action needs the same `capabilities` + `accessTree`.
Easiest: commit the manifest as a **shared module the backend imports** (the same
file, or a tiny shared package). That backend now has the map from
`{ node: level }` → capability strings.

### 2. A resolver — `capabilitiesFor(user, program)`
Turns a person into their authoritative capability set, server-side:

```
function capabilitiesFor(user, programId):
    if user is org owner/admin: return ALL capabilities        // admins bypass
    role = lookupRoleAssignment(programId, user.email)         // {node: level}, from the DB
    caps = new Set()
    for (node, level) in role.perms:
        caps.addAll(manifest.node[node].view.capabilities)
        if level == "edit":
            caps.addAll(manifest.node[node].edit.capabilities)
    return caps
```

This is the **same expansion the client does** (`capabilitiesForPerms`) — but run
on the server against the DB record, so it can't be spoofed. In our stack the
lookup already exists (`getLearningRoleForEmail(programId, email)`).

### 3. A guard — `requireCapability(cap)`
Wrap every mutating action:

```
async function requireCapability(c, programId, cap):
    user = await getCurrentUser(c)                  // from the session token
    caps = await capabilitiesFor(user, programId)
    if (!caps.has(cap)):
        throw HttpError(403, "Missing capability: " + cap)
```

Then each endpoint names the capability it needs. Example mapping:

| Endpoint | Required capability |
|---|---|
| `PUT /learning/objects` | `edit_object` (or `create_object` when new) |
| `DELETE /learning/objects/:id` | `delete_object` |
| `POST /courses/publish` | `publish` |
| `GET /learning/objects` | `repo_read` (or open to any member) |

That endpoint → capability mapping is the concrete work, and it's small — one
line per action.

## The cross-platform pattern (the important generalization)

Two situations, both keeping **Nexus as the single source of truth for roles**:

- **Actions that already run through Nexus's backend** (e.g. the learning-objects
  proxy): add `requireCapability(...)` right there. Nexus has the role store and
  the manifest, so it resolves and checks locally. Nothing else needed.

- **A platform with its own server** (Bridge's Next.js routes, or a future
  Learning server): it doesn't own the role store, so it shouldn't re-implement
  resolution. Instead, Nexus exposes **one authoritative endpoint**:

  ```
  GET /api/platform/:platform/me/capabilities?program_id=…
      → { "capabilities": ["edit_object", "repo_read", …] }   // resolved by Nexus
  ```

  The platform's server calls this once per request (passing the caller's token),
  then checks `caps.includes("create_object")` before acting. Nexus stays the
  authority; any platform enforces the same way without duplicating role logic.

This is why it generalizes: the **resolver + the `/me/capabilities` endpoint** are
platform-agnostic Nexus infrastructure; each platform just names the capability
its endpoint requires.

## The type-scoped case (the deferred "Drill Developer")

If a capability is object-type-restricted (`edit_object` limited to `["drill"]`),
the guard also needs the target's type — so it loads the resource and adds a
second check:

```
requireCapability("edit_object")
AND (role.objectTypes is empty OR target.type in role.objectTypes)
```

This is the only check that must fetch the resource first; everything else is
pure set membership.

## What to add to the Access-Control JSON doc

The original doc's §5 said only *"Actions / APIs: check `capabilities`."*
Replace/extend it with a **§6 Server enforcement** stating:

1. Every mutating endpoint declares one required capability.
2. The server resolves the caller's capabilities from the stored role via the
   manifest (`capabilitiesFor`) — never from client input.
3. It rejects (403) if the capability is absent; the UI hiding the control is
   UX only.
4. Platforms without direct DB access call Nexus's `/me/capabilities` endpoint
   and check the returned set.
5. Type-scoped capabilities additionally compare the target resource's type
   against the role's allowed types.

## Current status / what's wired vs. pending

- **Wired today:** UI/navigation enforcement — which screens show, view vs edit,
  a "View only" banner, and edit-only screens (e.g. Create, Sources) hidden for a
  view-only grant. The capability set is already computable
  (`capabilitiesForPerms`).
- **Pending (this spec):** the server-side `capabilitiesFor` + `requireCapability`
  guards on the mutating endpoints, and the `/me/capabilities` endpoint for
  platforms with their own server. Bounded work — the manifest already provides
  everything needed.

## One-liner for the team

> For each protected action, the endpoint names the capability it needs; the
> server looks up the caller's role in Nexus, expands it through the manifest into
> a capability set, and 403s if the capability isn't in it. Front-end `can()` only
> hides buttons — the server check is the real gate. Platforms with their own
> server get the set from a single Nexus `/me/capabilities` endpoint instead of
> re-deriving it.
