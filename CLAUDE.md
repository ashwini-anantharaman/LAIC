# LAIC Platform

A multi-tenant education platform: one governance layer (**Nexus**), a content
authoring studio, and learner-facing apps that consume what the studio produces.
Roughly **386,000 lines of TypeScript across 2,200 files** and **1,000+ commits**.

The through-line, and the hard part, is **access control**: who may see, edit,
publish and receive each piece of content, expressed once and enforced
identically across four codebases and three deployed surfaces.

---

## What problem it solves

An organisation (say a bridge-teaching non-profit) runs **programs**. A program
has **clubs**, clubs have **members**, some members are **coaches** with assigned
**learners**. Staff author teaching content — tutorials, quizzes, flashcards —
and need to control precisely who receives it: this club, that coach's learners,
everyone on the mobile app, nobody yet.

Every hard problem in the codebase is a variation on that: *the same content,
different audiences, different rights, across different applications.*

---

## Architecture

```
TheNexusPlatform/
  backend-ts/      Hono + Drizzle + Postgres (Supabase). The single API.
  platform_logic/  React + Vite. The Nexus console — orgs, programs,
                   people, roles, content library.
  app_shell/       White-label shell for partner-branded deployments.

Components/
  laic-learning-platform/   The Content Studio. React + Vite. Authoring
                            pipelines for every content type.
  generalizable-coach/      Domain-agnostic coaching engine.
  laic-learner-contracts/   Shared type contracts.

Applications/
  bridge-coach-app/   React Native + Expo (SDK 54). The learner app,
                      "Bridge Bird". Ships via EAS Update.
  BridgePlatform/     The bridge game engine.
```

Three Vercel deployments — API, console, studio — plus the Expo app. The console
and studio are separate origins that frame each other, which is deliberate and
load-bearing (see *Confinement*).

### Data model

Postgres, ~49 core migrations plus per-platform migration lines (`learning/`,
`bridge/`). The learning access model is 14 migrations of its own and is where
most of the design lives:

| Migration | What it introduced |
|---|---|
| `0006` | Object scope — personal vs program content |
| `0007` | Per-object grants (profile, club, app, role) |
| `0009–0010` | App targets — publishing to an app, scoped per club |
| `0012` | Server-side folders with grant **levels** (`view` / `edit`) |
| `0013` | Version history with committed-vs-draft snapshots |
| `0014` | **Drives** — folder roots owned by a person, coach, club or app |

---

## The access model

A **capability catalogue** (39 learning capabilities, 10 groups, 15 UI surfaces)
is the single source of truth. Roles are compositions of capabilities; UI
surfaces declare which capabilities open them; the server enforces the same ids
the client reads.

Four ideas do most of the work:

**Capabilities, not roles.** `learning.studio.access`, `learning.drive.create`,
`learning.library.share_club`. Roles are named bundles; the checks are on
capabilities, so a new role needs no new code.

**Grants with levels.** A folder grant names a subject (`profile` / `club` /
`app` / `role`) and a level. Grants inherit down folder subtrees, and the
*strongest* level across every route in wins — someone explicitly given edit is
never held to view because a club grant happened to be read-only.

**Confinement.** Being trusted with one folder must not hand over the whole
authoring app. So the Studio is **framed** in a popup, booted into a single
object's pipeline, with navigation out of it blocked at the one function every
screen change passes through.

**Drives.** Google Drive splits "My Drive" from "Shared drives" and pays for it
twice — two permission systems, two UIs, a migration path between them. Here a
drive is one concept with an *owner*: a personal drive is simply one whose owner
is a person. Same grants, same inheritance, same sharing dialog.

---

## The content pipeline

Content is authored through staged pipelines — **Plan → Structure → Sources →
Author → Review** — and the pipeline itself is stored, not just its output. That
means a reviewer can see *how* a quiz was built: which template, which settings,
which source sentences a question was drawn from.

An object carries both a **rendered form** (blocks a learner sees) and its
**authoring draft** (sections, units, slots, source pool). Keeping those two in
step across autosave, explicit save, version snapshots and app delivery is a
recurring source of subtle bugs — and a recurring source of the invariants the
code now states explicitly.

**Versioning** is deliberately narrow: only a *committed* save cuts a version.
Autosaves persist content without claiming to be versions, because a history of
eleven identical entries buries the two saves someone actually made. Closing an
editor with uncommitted edits records a **draft-tagged** version — the work is
kept, but an accident never sits beside a decision looking the same. Restore
writes an old version *forward* as a new one, so history stays append-only and
reversing a decision remains part of the record.

---

## Delivery

Content reaches learners through **app targets** — published to an app, scoped to
a club. The mobile app reads a club-scoped feed; the console decides the
audience; the studio decides the content. Three surfaces, one model.

The Expo app ships via **EAS Update** (JS bundles to a CDN, no store review),
pinned to SDK 54 because that is the last Expo Go the App Store approved.

---

## Working conventions

**Comments explain *why*, never *what*.** A comment earns its place by recording
a decision, a constraint, or a failure mode that is not visible in the code.
Several read as short essays on a specific trade-off — that is intentional and
is how the reasoning survives.

**Verify, don't assume.** Deployments are checked by inspecting the live bundle
and the deployment status, not by trusting a CLI's printed URL — a build can fail
*after* the URL is echoed, leaving the alias on an older build.

**Two writers, one column.** Recurring hazard: the Studio owns browser-local
folder ids (`ocol-`), the program library owns server ids (`lcol-`). Any writer
touching both must merge rather than replace, or content silently re-files
itself.

**Deep deletes are explicit.** 30 of 34 FKs to `organizations` cascade; eight
learning tables have none. Deleting the row alone orphans them. Destructive
endpoints require the entity's **name typed back**.

**Deactivate, don't delete, people.** A profile is referenced by everything they
authored, reviewed, coached or were granted. Removing the row either breaks those
references or rewrites history to say nobody did it.

---

## Recent work (this session)

- **Drives** — schema, capabilities, console UI, confined create popup, and a
  conditional app tab. Four owner types through one endpoint.
- **Review / edit access per folder** — a content manager grants Review or Edit
  on a folder; the person opens the *real* Studio pipeline in a popup, scoped to
  one object, with no Studio access at all.
- **Server-side version history** — committed vs draft, with restore.
- **Coaches as a sharing audience** — drawn from assignment data rather than a
  role, so "share with this coach's learners" became sayable.
- **Admin cleanup and deep deletes** — org/program/person removal, rename, and
  deactivation, with orphan handling.

Roughly 30 commits, each with a message that states the defect and the reasoning
rather than the diff.
