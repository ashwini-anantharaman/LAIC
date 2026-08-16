# Access Control — Administrator's Guide

**Who this is for:** anyone who grants, removes, or debugs access in the Nexus console —
platform operators, organization owners, program administrators, and club staff.

**What you'll be able to do after reading it:** enable a platform for a club, trim exactly
what that club can do, author roles, add people, take access away correctly, and diagnose
the handful of failures that look mysterious but have simple causes.

**You do not need to read any code.** Where a claim is easy to disbelieve, this guide says
where in the system it comes from so an engineer can confirm it. Engineers should read
`ACCESS_CONTROL_ENGINEERING_GUIDE.md` instead — it is the same system described in far more
depth.

---

## Contents

1. [The mental model](#1-the-mental-model)
2. [The four platforms](#2-the-four-platforms)
3. [How a single access decision is made](#3-how-a-single-access-decision-is-made)
4. [The Full / Partial / No access control](#4-the-full--partial--no-access-control)
5. [The one rule that surprises everyone](#5-the-one-rule-that-surprises-everyone)
6. [Two ceilings: organization and program](#6-two-ceilings-organization-and-program)
7. [Roles — where each kind is authored](#7-roles--where-each-kind-is-authored)
8. [People — adding, naming, removing](#8-people--adding-naming-removing)
9. [Recipes](#9-recipes)
10. [Troubleshooting](#10-troubleshooting)
11. [Taking access away — correctly](#11-taking-access-away--correctly)
12. [What the console cannot do](#12-what-the-console-cannot-do)
13. [What gets audited](#13-what-gets-audited)
14. [Glossary](#14-glossary)

---

## 1. The mental model

Five things. Everything else is detail.

| Thing | What it is | Example |
|---|---|---|
| **Organization** | The top-level tenant. Owns people and programs. | Life in AI Center |
| **Program** | A body of work inside an organization. | LAIC Bridge Program |
| **Partner club** | A program flagged as a partner and **connected to a parent program**. Its members reach the parent's material through the connection. | B2F3, Club 1 |
| **Person** | A profile with a membership in an organization, optionally pinned to one program. | a club mentor |
| **Platform** | An application the program can switch on. | Bridge Bird App |

The shape:

```
Organization  ─────────────────────────────────────────────┐
   │                                                        │
   ├── Program  "LAIC Bridge Program"  (the parent)         │  people live at
   │      │                                                 │  the organization,
   │      ├── Partner club  "B2F3"      ── connected ───────┤  pinned to a program
   │      └── Partner club  "Club 1"    ── connected ───────┘
   │
   └── Program  "Brain Bee Program"
```

**A partner club is a program.** It has its own id, its own people, its own roles, its own
features — and a pointer to a parent program whose curriculum its members can read. That
single pointer is why a club can see shared content without being able to edit it, and why
one club's own material never reaches another.

> **The most common misconception.** "Partner" is used for two different things in this
> system. A **partner club** (above) is a program inside your organization. A **partner
> organization affiliation** is a different, rarer arrangement where an *outside*
> organization is granted capabilities in your program. This guide is about clubs; the
> affiliation screen is noted in §12.

---

## 2. The four platforms

A program's **Features** panel lists seven switches. Four of them are platforms that carry
their own permission catalogue, and those four are what this guide is really about.

| Feature | Product name | What it is |
|---|---|---|
| `learning` | **Content Studio** | Where tutorials, quizzes, flashcards and summaries are authored and published. |
| `bridge` | **Bridge Platform** | The desktop bridge web app — knowledge base, tables, challenges, library. |
| `clubapp` | **Bridge Bird App** | The phone app club members actually use. |
| `appbuilder` | App Studio | App shells. |
| `community` | Community | — |
| `teams` | People | — |
| `partners` | Partners | — |

The first three (`learning`, `bridge`, `clubapp`) are the ones with a **Full / Partial / No
access** control. The rest are plain on/off switches.

**Note the naming mismatch**, because it causes real confusion in tickets: the feature key
is `clubapp`, the catalogue is called `club-app`, the product is called **Bridge Bird App**,
and its capabilities all begin `app.`. They are all the same thing.

---

## 3. How a single access decision is made

When someone taps a button, three questions are asked **in this order**. A "no" at any stage
ends it.

```
   ┌──────────────────────────────────────────────────────────┐
   │ 1. THE CEILING — did the org/program provision this?      │
   │    "Is this club even allowed to have this capability?"    │
   └──────────────────────────────────────────────────────────┘
                              │ yes
                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │ 2. THE TIER — is this person structurally in charge?      │
   │    owner / administrator of the org or this program        │
   └──────────────────────────────────────────────────────────┘
                    │ yes → allowed        │ no
                    ▼                      ▼
                  ALLOW      ┌──────────────────────────────────┐
                             │ 3. THE ROLE — does their role     │
                             │    grant this capability?         │
                             └──────────────────────────────────┘
```

The order matters and explains most surprises:

- **The ceiling beats everything, including administrators.** If the organization did not
  provision a capability for a club, nobody in that club has it — not the club owner, not
  a program administrator. Provisioning is a *ceiling*, and roles distribute authority
  underneath it. They cannot raise it.
- **Structural tiers skip the role check entirely.** An owner or administrator of the
  organization, or of the specific program, gets everything in the catalogue that is not
  marked reserved. You do not need to give them a role.
- **Roles only matter for everyone else.**

---

## 4. The Full / Partial / No access control

Program → Partners → *(club card)* → **Features**.

Each of the three platform features shows a dropdown with exactly three options.

| Setting | What the club gets | What is actually stored |
|---|---|---|
| **No access** | Nothing. A hard denial. | The feature is switched **off**. |
| **Full access** | Every capability the catalogue offers, now and in future. | The feature is **on**, and *no restriction is recorded*. |
| **Partial** | Only the capabilities you tick. | The feature is **on**, and the ticked list is recorded. |

Two things follow from that table, and both matter:

**1. "Full access" is a promise about the future, not a list.** It records no capability
list at all. If a capability is added to the product next month, a club on Full access gets
it automatically. A club on Partial does not — someone has to tick it. That is usually what
you want, but it means Partial needs revisiting when the product grows.

**2. Switching to Partial starts with everything ticked.** The picker seeds every grantable
capability ON so you trim downward, rather than starting from nothing and having to
reconstruct a working club. If you tick everything back on, the system quietly returns to
Full; if you untick everything, it returns to No access. The dropdown follows your ticks.

**Reserved capabilities never appear in the picker.** A few capabilities are held only by
structural tiers and cannot be granted to a role — organization-wide things like removing
administrators, or platform-operator powers. They are excluded from the list by design.

---

## 5. The one rule that surprises everyone

> **ABSENT IS NOT DENIAL.**

An empty capability list does not mean "this club may do nothing." It means "no restriction
was recorded" — which is the *Full access* state.

This has already cost the project a live bug: an empty club-app list was once read as
"denied", and the `+` button vanished for every mentor in B2F3. Denial has its own dedicated
channel — the feature switch — and does not need to borrow this one.

Practically, for you:

- **To deny a platform, set it to No access.** Do not try to express denial by unticking
  every capability in Partial (the system will interpret that as No access anyway, which is
  correct — but do it deliberately through the dropdown so it is legible to the next admin).
- **An empty list is never stored.** The server refuses to persist one. So "Full access" and
  "No access" both reach the runtime with no list attached, and are told apart purely by the
  feature switch.
- **When you are debugging, "the list is empty" is not evidence of anything.** Check the
  feature switch.

The same principle runs all the way down. A person whose role grants no fine-grained
capabilities at all is treated as a legacy coarse-grained account and falls back to the
older behaviour, rather than being locked out. Silence means "not specified", never "no".

---

## 6. Two ceilings: organization and program

There are two levels of provisioning, and a capability must survive **both**.

| Level | Who sets it | Where |
|---|---|---|
| **Organization** | A Nexus platform operator | Operator → Organizations → *(org)* → the same Features control |
| **Program / club** | An organization owner or administrator | Program → Partners → *(club)* → Features |

```
   Organization envelope   ┃████████████████████████┃   what LAIC is licensed for
                                     ∩
   Program envelope         ┃██████████████┃           what this club was given
                                     ║
                                     ▼
   Effective ceiling        ┃██████████████┃           the intersection
```

**What this means in practice:** if you are an organization administrator and a capability
you tick simply does not take effect, check whether a platform operator has restricted it at
the organization level. Your program picker will not show you capabilities outside the
organization envelope, so the usual symptom is *"the capability I want isn't in the list"* —
that is the organization ceiling, and only a Nexus operator can raise it.

> **One inconsistency to be aware of.** The Bridge Bird App's ceiling is currently read from
> the **program level only** — the organization envelope is not intersected for that one
> path. Content Studio and Bridge Platform intersect both. If you rely on an organization-level
> restriction for the phone app specifically, verify it rather than assuming; flag it to
> engineering (it is recorded in the engineering guide as a known divergence).

---

## 7. Roles — where each kind is authored

Roles say *who gets what* within the ceiling. There are three separate role systems, and
knowing which one you are in saves a lot of time.

### (a) Program roles — the main one

**Program → People → Roles & Groups.**

This is the builder you will use most. It authors a named role (e.g. "Club Mentor") and, for
each platform area, gives it **No access / Partial / Full access** — the same three-way
control as provisioning, one level down. Under Partial you tick individual capabilities.

Two useful properties:

- **The builder is clamped by provisioning.** It will not even display a capability the club
  was not provisioned, so you cannot author a role that promises something the ceiling
  forbids. What you see in the builder is genuinely grantable.
- **One role can span platforms.** A single program role may carry Content Studio, Bridge
  Platform and Bridge Bird App capabilities at once. You do not need one role per platform.

There is also an **older, simpler role builder** still present on the Program → People screen
that offers only area + view/comment/edit and does not write fine-grained capabilities. If
your ticked capabilities are not saving, check you are in **Roles & Groups**, not the legacy
dialog.

### (b) Bridge Bird App roles — club-authored

**Reachable by club administrators** through the app's own role screens. This is how a club
authors a name of its own — "Club Mentor", "Strange Mentor" — bound to `app.*` capabilities.

Three starter templates ship with the product:

| Template | Roughly |
|---|---|
| **Club Member** | See the club, chat, view challenges and deals |
| **Club Mentor** | Everything a member has, plus the coaching surfaces |
| **Club Manager** | Everything a mentor has, plus moderation, editing and deleting |

Use a template as a starting point and adjust. Note that these roles are stored per club, so
two clubs with a role of the same name are genuinely two different roles.

### (c) Pre-built platform roles

A fixed vocabulary assigned per person per platform — `bridge_coach`, `bridge_reviewer`,
`bridge_learner`, `content-developer`, `student`, and so on. These are assigned from the
platform's own People screen rather than built. They are the coarse ladder that predates
fine-grained capabilities, and they still work.

**`bridge_coach` is the important one.** It is what makes the Bridge Platform treat someone
as a coach, and it also grants Content Studio access as a side effect.

### Membership roles are not app roles

A person's **membership role** is one of four structural values: `owner`, `administrator`,
`instructor`, `learner`. That is a different axis from the roles above.

> **This trips people up constantly:** every person enrolled into a club is written as
> `instructor` regardless of what they do there. It is the low-privilege base value, not a
> statement that they teach. **Never read `instructor` as "coach".** Coach-ness comes from
> the `app.coaching.view` capability or the `bridge_coach` platform role — never from
> membership.

---

## 8. People — adding, naming, removing

**Program → People → Invite member.** One dialog, two paths:

| Path | What happens |
|---|---|
| **Add directly** | The person is enrolled immediately. If the account is new, a one-time starting password is shown **once** — copy it before closing. If the account already exists, they simply gain the club. |
| **Send link** | You get a redeemable invite URL. The role and groups you picked are held against their email and applied when they accept. |

Other operations on the same screen: change someone's role, correct a display name, set
credentials, issue a one-time claim code, remove a member, revoke a pending invitation.

Roles and groups are **email-keyed**, so you can assign a role to somebody who has not
signed up yet, and it will apply on acceptance.

**Groups are not roles.** Groups are organizational placement (who is in "Littles"); roles
are permissions. A person can be in several groups. A role can optionally be *displayed* as
its own group, which is a presentation choice and grants nothing extra.

---

## 9. Recipes

### 9.1 Give a club the Bridge Bird App

1. Program → **Partners** → the club's card → **Features**.
2. Set **Bridge Bird App** to **Full access** (or **Partial** and trim).
3. Save.
4. Program → **People** → check the club's members exist and have a role.
5. Have someone in the club force-close and reopen the app.

Nothing else is required. The app reads its ceiling and the person's capabilities on launch.

### 9.2 Let a club author its own content

This is the one with a non-obvious dependency chain, so follow it in order.

1. Program → **Partners** → the club → **Features** → **Content Studio** → **Partial**.
2. Tick exactly these five:
   - `learning.object.read`
   - `learning.object.create`
   - `learning.object.edit`
   - `learning.publish.release`
   - `learning.publish.version`
3. Save.
4. Program → **People** → **Roles & Groups** → the club's authoring role → Content Studio →
   **Partial** → tick the same five.
5. Assign that role to the people who should author.

**Why each one is needed:**

| Capability | Why |
|---|---|
| `object.read` | Otherwise the library is empty and there is nothing to open. |
| `object.create` | The `+` button does not appear without it. |
| `object.edit` | **Autosave fails silently without it** — work appears to save and does not. |
| `publish.release` | Publishing returns a refusal without it. |
| `publish.version` | Publishing a specific version returns a refusal without it. |

Both `publish.*` are genuinely required. Granting only one produces a refusal at the last
step of a long authoring session, which is the worst possible place to discover it.

### 9.3 Make someone a coach

Two ways, and they do different things.

- **For the phone app:** give them a role carrying `app.coaching.view` (and usually the rest
  of the `app.coaching.*` family). The Club Mentor template already includes these.
- **For the Bridge Platform:** assign the pre-built `bridge_coach` role on the platform's
  People screen.

If someone should be a coach in both, do both. They are separate systems that happen to use
the same word.

### 9.4 Author a club role from a template

1. Open the club's role screen.
2. Create a role, choosing **Club Mentor** (or Member / Manager) as the starting point.
3. Rename it to whatever the club calls it.
4. Adjust the ticks.
5. Assign it to people.

The saved capabilities are validated against the catalogue on write, so a stale or
mistyped capability is dropped rather than stored.

### 9.5 Move a club from Full access to Partial

1. Features → the platform → **Partial**. Everything arrives ticked.
2. Untick what the club should not have.
3. Save.
4. **Re-check the club's roles.** A role that granted something you have just removed will
   silently stop granting it — the ceiling wins — but the role still *says* it grants it,
   which will confuse the next person. Tidy the role too.

---

## 10. Troubleshooting

Work down the table. The causes are ordered by how often they turn out to be the answer.

### "They can't see the club's challenges / activities"

| Check | How |
|---|---|
| Is the right club selected in the app? | The app scopes everything to the selected club. With two or more clubs it opens on the club picker. |
| Is the platform on for **this** club? | Features → the club → the relevant platform is not **No access**. |
| Does their role grant the view capability? | e.g. `app.challenge.view`. |
| Did they reopen the app? | Capabilities are cached for the session; a role change needs an app restart or a return to foreground. |

### "Publishing says it was refused"

Almost always a missing `publish.release` **or** `publish.version` — see §9.2. Check both, at
**both** levels (provisioning and role).

### "Autosave isn't saving, but nothing says so"

Missing `learning.object.edit`. This one fails quietly by design of the underlying flow;
there is no error banner. If an author reports "it lost my work", check this first.

### "The capability I want isn't in the picker"

The organization ceiling excludes it. Only a Nexus platform operator can widen the
organization envelope (§6).

### "One club can see another club's content"

This is the scope-leak class of bug and it is worth escalating rather than working around.
Two known causes, both engineering-side:

- Content created before club scoping existed carries **no owner club**, and unowned content
  is deliberately treated as shared curriculum — visible to everyone. It needs attributing
  to a club by an engineer.
- Bridge challenges created before the scoping migration have the same shape.

Give engineering the club id and the title; they have a documented statement to run.

### "A club administrator can't do something they should be able to"

Remember the order in §3: the **ceiling is checked before the tier**. An administrator is not
above provisioning. Check Features first.

### "It worked yesterday"

Ask whether anyone changed provisioning. Narrowing a ceiling silently disarms every role
underneath it, with no error and no notification to the affected people.

---

## 11. Taking access away — correctly

Removing access has more failure modes than granting it. In descending order of reliability:

1. **Set the platform to No access.** This is the hard denial. It cannot be overridden by any
   role, and it takes effect on the next launch.
2. **Narrow the Partial list.** Reliable, and it beats roles — but the role still claims the
   capability, so tidy the role as well or the next admin will be misled.
3. **Change the person's role.** Reliable, but it is per person and easy to miss someone.
4. **Remove the membership.** Reliable, and it removes them from everything at once.

**What does *not* work:** unticking capabilities while leaving the platform on and expecting
an empty list to mean denial. An empty list is never stored (§5).

**Timing.** None of these are instant on a device that is already open. The app caches the
answer for the session and re-reads on launch and on returning to the foreground. For an
urgent revocation, the membership removal is the one to reach for, and confirm on the device.

---

## 12. What the console cannot do

These need an engineer. Knowing the boundary saves a round trip.

| Task | Why it is not in the console |
|---|---|
| Attribute existing content or challenges to a club | Needs a database statement; there is no backfill UI. |
| Apply database migrations | Run from a developer machine with credentials the console does not hold. |
| Add a new capability to a catalogue | It is a code change plus a catalogue edit; the capability must exist before it can be ticked. |
| Grant a reserved capability | Reserved capabilities are held only by structural tiers, by design. |
| Grant an outside organization access to your program | That is the **Partner access** dialog on the Partners screen — a different mechanism from partner clubs, granting capabilities to every active member of the other organization. Use it deliberately. |
| See why a specific request was refused | The bridge platform deliberately answers "not found" rather than "forbidden", so the reason is in server logs, not the UI. |

> **On database credentials:** they are not available on the development machines by design —
> the hosting provider's environment variables are write-only. Every migration, backfill and
> diagnostic query is handed to an administrator to run in the database console. Expect that
> handoff; it is not a workaround.

---

## 13. What gets audited

The Bridge Platform keeps an **append-only** audit log — records can be written and read,
never edited or deleted, and that is enforced at the database level.

Viewable at **Bridge Platform → Admin → Audit** (requires the audit capability). It shows the
most recent 200 entries and filters by actor and action.

Recorded: knowledge-base changes, profile and scope changes, organization profile and
affiliation changes, play submissions and comments, the whole assignment lifecycle, library
sharing, session undo/fork/discard, access-catalogue updates, and challenge create / delete /
archive / invite responses.

The Nexus console separately records provisioning changes — `program.features.updated`,
`partner.created`, `organization.catalogue_updated`, `program.catalogue_updated`.

**Not audited:** reads. The log tells you what changed, not who looked.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Capability** | An atomic permission string the code checks, e.g. `app.challenge.create`. The join key between catalogues, roles, and enforcement. |
| **Catalogue** | The inventory of capabilities a platform offers. Says what *can* be gated, never who gets it. |
| **Provider** | One catalogue's owner. There are seven: the three consoles (Nexus, Org, Program), Content Studio (`learning`), Bridge Platform (`bridge`), the Library component, and the Bridge Bird App (`club-app`). |
| **Provisioning / envelope / ceiling** | What an organization gave a program, or an organization operator gave an organization. The maximum; roles distribute underneath it. |
| **Structural tier** | Owner or administrator, at organization or program level. Bypasses role checks entirely; still bound by the ceiling. |
| **Membership role** | `owner`, `administrator`, `instructor`, `learner`. Structural, not a permission set. Everyone enrolled in a club is `instructor`. |
| **Partner club** | A program flagged as a partner and connected to a parent program. Has its own people, roles and features. |
| **Partner organization affiliation** | A different mechanism: an outside organization granted capabilities in your program. |
| **Launch token** | A single-use, 60-second ticket that hands a signed-in person from Nexus to a platform. Carries identity only — no permissions. |
| **Surface** | A screen or nav item, unlocked by holding any of its required capabilities. |
| **Reserved capability** | Exists in the inventory but is never offered to a role builder — held only by structural tiers. |
| **Scope leak** | One club seeing another's material. Usually caused by content that predates scoping and carries no owner club. |

---

## Quick reference card

```
GRANT A PLATFORM      Program → Partners → club → Features → Full access
TRIM A PLATFORM       ...same, → Partial → untick
DENY A PLATFORM       ...same, → No access          ← the only true denial
AUTHOR A ROLE         Program → People → Roles & Groups
ADD A PERSON          Program → People → Invite member
ORG-LEVEL CEILING     Operator → Organizations → org → Features   (operators only)
AUDIT                 Bridge Platform → Admin → Audit

ORDER OF CHECKS       ceiling  →  structural tier  →  role
                      (the ceiling beats administrators)

ABSENT ≠ DENIAL       an empty capability list means "unrestricted",
                      never "forbidden". Deny with the feature switch.

instructor ≠ coach    every club enrollee is `instructor`.
                      Coach-ness = app.coaching.view, or the bridge_coach role.
```
