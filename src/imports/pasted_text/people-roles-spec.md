# People & Roles Tab — Full Feature Spec (Administrator)

Everything on the **People & Roles** screen and its role-editor modal, captured from
source. Nothing omitted.

**Screen header**
- Kicker: **{instance name} · Administrator**
- Title: **People & Roles**
- Subtitle: "The team behind this program, and the roles that govern what each person can do. LAIC ships recommended roles — you can also define your own."

The screen has four stacked sections: **Instance configuration** → **Roles & access** (recommended + custom) → **People** table. A **Role editor** modal opens for creating/editing roles.

---

## Section 1 — Instance configuration card
A read-only summary of how this LP instance is provisioned. Header: the program's theme icon + **{instance name}** + subline "How this instance is configured — the platform reads this to decide what's available here." + a **{programType} configuration** chip.

Four summary cells:
- **Object types enabled (N)** — a chip per enabled type (Lesson, Quiz, …).
- **Specialized blocks (N)** — an amber chip per team-built block (e.g. Bridge Play, Bidding Sequence).
- **Declared roles (N)** — a chip per role declared for this instance.
- **Metering** — "**{used} of {limit} {label}** used" + a **purchase more available** chip when purchasable.

Footer note (lock icon): "Content created here is isolated to this instance. Provisioning is managed upstream; this view shows what the platform received."

---

## Section 2 — Roles & access
Section header **Roles & access** (shield icon) with a **＋ New role** button (opens the Role editor blank).
Intro: "A role is a name plus the exact set of things it can access. Recommended roles are a sensible starting point; build your own by granting any combination — e.g. a 'Drill Developer' who can only create drills, or a 'Tester' who can just play and comment."

### 2a. Recommended roles — "Recommended by LAIC · declared for this instance"
A grid of **RoleCard**s, one per role declared on this instance (from the six shipped roles). Each recommended card:
- Dark/amber role icon; role **name** + a **LAIC** chip; the role's blurb.
- Up to **5 permission chips** + a "**+N more**" chip.
- Action: **⧉ Duplicate & customize** — opens the Role editor pre-filled with that role's recommended permissions so you can tweak and save a custom variant.

### 2b. Custom roles — "Custom roles in {program}"
A grid of custom **RoleCard**s (violet icon + **custom** chip). Each shows its permission chips and, if restricted, a "**⌗ Can create: {types}**" line. Actions: **✎ Edit** and **🗑 Delete**.
Empty state: "No custom roles yet. Duplicate a recommended role above, or create one from scratch."
(Seeded examples across programs: "Drill Developer" — can create drills only; "Tester" — play & comment, read-only otherwise.)

---

## Section 3 — People table
Section header **People** (users icon). A table with columns:
- **Person** — avatar (initials) + name.
- **Roles** — role chips (Student chips are cyan-tinted; others neutral).
- **Team** — comma-joined team names.
- **Active** — last-active label (e.g. "today", "2d ago").
- (actions) — a **⚙ Roles** button per row to change that person's roles (fires a toast "Roles updated").

Rows are the people assigned to this program (seeded per program).

---

## Modal — Role editor  (New role / Edit role / Duplicate & customize)
- **Title:** "New role" or "Edit role". **Sub:** "A role is just a name plus the exact set of things it can access. Grant any combination."
- **Role name** — input (placeholder "e.g. Drill Developer").
- **Description** — input ("what this role is for").
- **Permission catalog** — every permission as a toggle button (green/checked when granted), grouped:

**Authoring & sources**
- Create learning objects `create_objects`
- Edit & regenerate objects `edit_objects`
- Delete objects `delete_objects`
- Mark up sources & extract content `markup_extract`
- Create & manage source pools `manage_sources`
- Use tools & utilities `use_tools`

**Courses**
- Create & build courses `create_courses`
- Edit courses `edit_courses`
- Reuse library objects in courses `reuse_library`
- Submit work for review `submit_review`

**Review & feedback**
- Comment on blocks (leave feedback) `comment`
- Approve / request changes — objects `review_objects`
- Approve / request changes — courses `review_courses`
- Resolve feedback threads `resolve_comments`

**Publishing & governance**
- Publish & set audience `publish`
- Manage versions `manage_versions`
- Promote content to program scope `scope_program`
- Promote content to organization scope `scope_org`

**Teaching**
- Assign courses to learners `assign_courses`
- Set cohort interaction settings `cohort_settings`
- Use the learner experience `preview_learner`

**Repository & administration**
- Browse the object repository `repo_read`
- Organize repository folders `repo_write`
- Manage people & roles `manage_people`

- **Object-type restriction** (conditional): as soon as **Create learning objects** is granted, an inline panel appears under *Authoring & sources* — "**Which object types can this role create?** — leave empty for all" — a pill toggle for each of the ten object types (amber when selected). This is what makes a "Drill Developer" (drill only) possible.
- **Footer:** **Cancel** / **✓ Save role · {N} permission(s)** (the count updates live).

---

## Recommended permission sets (what each shipped role grants by default)
- **Content Developer** — create/edit/delete objects, mark-up & extract, manage sources, use tools, create/edit courses, reuse library, submit for review, comment, browse repo, use learner experience.
- **Object Reviewer** — review objects, comment, resolve comments, browse repo.
- **Course Reviewer** — review courses, comment, resolve comments, browse repo.
- **Administrator** — publish & set audience, manage versions, promote to program/org scope, manage people, review objects & courses, resolve comments, browse & organize repo.
- **Coach** — assign courses, set cohort settings, use learner experience, comment.
- **Student** — use the learner experience.

---

## Traps a design tool tends to miss here
- The screen is **four sections**, not just a people list: an **instance-configuration summary card**, **recommended roles**, **custom roles**, and the **people table**.
- Roles are **fully composable** — a role is "a name + any subset of ~23 granular permissions" across six groups, edited in a dedicated modal, not a fixed set.
- The Role editor has a **conditional object-type restriction** picker that only appears once *Create learning objects* is on (empty = all types).
- Recommended (LAIC) roles can't be edited directly — they're **duplicated into a custom role** first; custom roles get Edit/Delete.
- The instance card surfaces **enabled object types, specialized blocks, declared roles, and metering** — all read-only ("provisioning is managed upstream").

**Honest caveat (prototype):** role authoring is fully interactive, but assigning a role to a person is a stub (the per-row **Roles** button just toasts) and permissions are **displayed, not enforced** at runtime — the surface documents the intended governance model.