# Nexus Platform Implementation Architecture

Version: 0.3

Date: July 8, 2026

Prepared for: MindBrainAI Nexus / Life in AI Center development workstreams

Primary workstream: Nexus Platform

Related workstreams: Learning Platform, Coaching Platform, Bridge Platform, Brain Bee App, MindAI Bee App, Bridge App

---

## What Changed in v0.3

This version applies five resolved decisions on top of v0.2:

1. **Database decision made.** Single shared PostgreSQL database on Supabase with Row-Level Security (RLS) for organization isolation. The codebase avoids Supabase-specific APIs wherever practical so a future migration to AWS/GCP/Azure stays feasible.
2. **Registration flips direction.** Apps own their own signup screens, but **Nexus defines the signup data**: a simple field set (starting with Name, Age, Email) that admins can edit or extend as needed. The app fetches the field definition, collects the answers in its own UI, and pushes the registration through the **signup hook (API)** into the shared database. Each offering is configured as auto-approve or manual-approve. Signups are bound to the app they came from, and sign-in on any app goes through Nexus. Nexus does not host public registration pages or signup screen builders.
3. **App Shell is removed as a Nexus concept.** Nexus does not build app containers, app navigation, app theming, or onboarding screen configuration. The only app-facing responsibilities Nexus keeps are: **authentication/login** (all apps authenticate through Nexus, so login issues are debugged in one place), the **signup hook**, and a minimal **Registered App** record (identity, credentials, launch URL).
4. **Theming is Nexus-side only.** An organization can set up to two accent colors and a logo in its settings, which style that organization's pages within the Nexus platform — like Canvas. No app theming through Nexus.
5. **Groups are one simple concept.** Classes, bridge classes, clubs, chapters, cohorts — all are just "Groups" on Nexus. The coach, instructor, or administrator names the group whatever they want; the name is a freeform field, not a fixed type enum.

---

## 1. Purpose

This document defines the implementation architecture for the Nexus Platform workstream.

The immediate goal is to help the development team and AI-assisted software-building process start implementation quickly. This document should be usable as a project context file for AI coding agents and as a shared specification for the Nexus workstream.

The Nexus Platform is the highest-level organizational, administrative, identity, registration-record, and access-control layer for MindBrainAI Nexus. It provides the infrastructure needed to create and manage:

- Nexus-level entities, teams, advisors, and administrators
- Member organizations and partner organizations
- Programs such as Brain Bee, MindAI Bee, Bridge, and future programs
- Program teams, advisors, reviewers, fellows, volunteers, coaches, and learners
- Program offerings such as courses, apps, challenges, classes, pilots, events, and cohorts
- Centralized authentication and login for all apps
- The signup hook that apps use to register students/players into the shared database
- Organization-scoped users, groups, roles, permissions, and entitlements
- Organization-level theming of Nexus pages (accent colors + logo)
- Launch context for downstream Learning, Coaching, and Bridge systems

This document is intentionally focused on the Nexus layer.

It does not define:

- Course authoring internals
- Lesson content structure
- Adaptive coaching runtime behavior
- Bridge gameplay
- Bridge AI players
- Bridge rules
- MindAI curriculum details
- Brain Bee curriculum extraction
- Real-time coaching logic
- App user interfaces, app screens, or app navigation (these belong to the app workstreams)

Those belong to the Learning Platform, Coaching Platform, Bridge Platform, and app-specific workstreams.

The Nexus Platform provides the container, identity, ownership, permissions, registration records, and administrative control structure in which those downstream systems operate.

### What Nexus Explicitly Does NOT Build (v0.3 boundary)

- No app shells, app containers, or app scaffolding
- No app navigation placeholders
- No signup screen builders or onboarding question builders
- No website builder
- No app theming (theming exists only on Nexus's own organization pages)
- No competition/grading management (challenge structure is stored as metadata only)

---

## 2. Brief Architecture Summary

The Nexus Platform is a production-oriented multi-tenant platform, not a demo playground.

It supports:

- MindBrainAI Nexus-level administration
- Nexus-level teams, advisors, and working groups
- Member organizations such as LAIC or future partner organizations
- Programs under organizations
- Program-affiliated organizations such as clubs, coach organizations, school partners, and ACBL-like bridge organizations
- Program offerings (courses, challenges, apps, classes, pilots, events, cohorts)
- Registered apps that authenticate through Nexus and push signups through the signup hook
- User and member onboarding records
- Phone-based and email-based identity options
- Role-based and scope-based access control
- Registration records with auto-approve or manual-approve per offering
- Direct admin-created enrollments and invitations
- Groups (freeform-named: classes, clubs, chapters, cohorts, coach groups)
- Entitlements to platform modules such as Learning, Coaching, Bridge, Analytics
- Organization-level theming of Nexus pages
- Future expansion to additional labs, schools, universities, teachers, clubs, professional groups, and partner institutions

The simple mental model is:

```text
MindBrainAI Nexus
  -> Nexus-level teams / advisors / administrators
  -> Member Organizations (with their own theme on Nexus pages)
    -> Organization-level members / administrators / teams
    -> Programs
      -> Program-level team / advisors / reviewers / fellows / volunteers / coaches
      -> Program-affiliated organizations and groups
      -> Program Offerings
        -> Registered App (if the offering is an app) — auth + signup hook + launch URL
        -> Registration records (pushed in by apps or created by admins/coaches)
        -> Participants / learners / coaches / reviewers / organizers
        -> Groups (freeform-named)
        -> Downstream platform links
```

The important correction retained from v0.2 is that the model is not only a rigid tree:

- Some people belong to Nexus-level teams.
- Some people belong to member organizations.
- Some people are on a program team.
- Some coaches belong to the Bridge Program before they are attached to a specific class or app offering.
- Some coaches are independent.
- Some coaches are affiliated with one or more bridge organizations.
- Some organizations are full Nexus member organizations.
- Some organizations are only program partners or app-level participants.
- Some learners belong under a coach group or club, not directly under Nexus.

Therefore the implementation must support flexible but controlled relationships, not only a rigid tree.

---

## 3. Immediate Product Deliverables from the Nexus View

The first release should create the platform foundation needed for several real apps. The apps themselves are built by their own workstreams — Nexus provides identity, registration records, permissions, and launch context.

### 3.1 Brain Bee Course App

The Brain Bee app is expected to begin as a relatively simple course app, built by the app/Learning workstream.

At the Nexus level, this requires:

- Brain Bee Program under LAIC or another owning organization
- Course/app offering record
- Registered App record (auth integration + signup hook credentials + launch URL)
- Student signups pushed from the app via the signup hook
- Auto-approve or manual-approve configuration on the offering
- Instructor or course developer roles
- Course editor access routed to the Learning Platform
- Student access routed to the Learning Platform
- Basic admin dashboard showing registrations and enrollments

Nexus does not own the Brain Bee course lessons, screens, or app UX. Nexus owns identity, registration records, roles, and launch context.

### 3.2 MindAI Bee App

The MindAI Bee app is more complex because it combines a course, a challenge, student registration, organizer roles, reviewer roles, chapter/regional structures, and possible future state, national, and international levels.

At the Nexus level, this requires:

- MindAI Bee Program
- Challenge offering with challenge structure metadata
- Registered App record for the MindAI Bee app
- Course linkage (required course offering)
- Signups pushed from the app at the correct scope (chapter, region, etc.)
- Student, organizer, reviewer, advisor, volunteer, and program admin roles
- Program-level and offering-level dashboards
- Participant records
- Downstream Learning Platform launch links

Nexus does not own the MindAI study content, assessments, or app screens. Nexus owns the structure around the program and challenge. Competition management and grading are explicitly out of scope — the challenge structure is stored as metadata so the program can evolve.

### 3.3 Bridge App

The Bridge platform is large. The immediate concrete product is the Bridge AI Coach app, built by the Bridge workstream.

At the Nexus level, this requires:

- Bridge Program
- Bridge AI Coach app offering
- Registered App record for the Bridge app
- Coach onboarding (independent and organization-affiliated)
- Learner signups pushed from the app via the signup hook
- Coach organization and club support (as program-affiliated organizations)
- Groups (coach-named classes/clubs)
- Organization-scoped privacy
- Launch context for the Bridge Platform

Nexus does not own bridge gameplay, AI bridge players, bidding systems, bridge coaching intelligence, or the Bridge app's screens. Nexus owns the administrative container, identity, and registration records.

### 3.4 The Registered App Concept (replaces App Shell)

A program offering may be surfaced as an app. The app itself is built entirely by its own workstream. Nexus keeps a minimal **Registered App** record so that:

1. **Authentication is centralized.** Every app authenticates its users through Nexus auth. Signup creates the account in Nexus; every subsequent sign-in on the app goes to Nexus. When login breaks, the team knows to look at Nexus. Apps never implement their own identity stores.
2. **The signup hook is credentialed and the signup data is Nexus-defined.** Each registered app receives API credentials to fetch its signup field definition (Name, Age, Email to start — editable per offering) and to push completed signups through the hook. A signup submitted by an app is bound to that app's offering. Signups land in the shared database, scoped to the right organization/program/offering.
3. **Launch context is routable.** Nexus knows where the app lives (launch URL) and what context to pass (user, org, program, offering, group, role, entitlements).

That is the entire surface area. No theme, no navigation, no onboarding configuration, no screen definitions.

---

## 4. Workstreams and Boundaries

| Workstream | Owns | Does Not Own |
|---|---|---|
| Nexus Platform | Organizations, programs, program-affiliated organizations, registered apps (auth + signup hook + launch context), roles, permissions, registration records, member management, groups, entitlements, admin surfaces, org-level Nexus theming | App UX/screens, course content internals, coaching logic, bridge gameplay |
| Learning Platform | Courses, lessons, tutorials, drills, assessments, content packages, learning paths, learner-facing course experience | Global organization model, Nexus-level membership, Bridge table |
| Coaching Platform | Generalizable coaching framework, learner model, coach runtime, recommendations, feedback policy | Nexus organization model, organization onboarding, bridge-specific rules |
| Bridge Platform | Bridge app UI, bridge table, bridge engine integration, bridge players, bridge tutorials, bridge coaching behavior, bridge configuration | Nexus membership infrastructure, generic organization/program administration |
| App Workstreams | Product-specific user experience for Brain Bee, MindAI Bee, Bridge, or future apps — including all signup/onboarding screens | Global tenancy and permission model, identity storage |

The Nexus workstream builds the foundation that allows downstream systems to be created, owned, administered, accessed, and launched. Apps handle their own screens and call into Nexus for auth and signup.

---

## 5. Organization Autonomy and Tenant Isolation

Nexus may onboard an organization, but that organization may own and manage its own internal ecosystem.

For example, a partner bridge organization may want to:

- Own its own coach list
- Own its own learner list
- Create its own groups
- Invite its own administrators
- Manage its own coach groups
- Keep its learner data private from other organizations
- Decide which parts of the Nexus/Learning/Coaching/Bridge platform it uses

### Core Principle

```text
Nexus onboards organizations.
Organizations own their internal people, programs, groups, and app/offering participation unless explicitly shared.
```

### Data Isolation: Single Database + Row-Level Security (RESOLVED)

The platform uses **one shared PostgreSQL database** (Supabase-managed) with **organization-scoped Row-Level Security**:

- Every tenant-scoped table carries an `organizationId` column.
- Postgres RLS policies enforce isolation **at the database layer**, not only in application code. Even a query that forgets a `WHERE organizationId = ...` clause cannot return another organization's rows.
- Nexus platform operators should not casually read organization data either: admin access paths are role-gated and audited, and RLS policies apply to application roles by default. (True "provider-blind" encryption is out of scope for the first release; the practical commitment is least-privilege access plus audit logging.)
- No organization sees another organization's internal users, learners, coaches, registrations, participants, or dashboards unless an explicit sharing relationship exists.

Separate databases per organization are **not** part of the first release. If a future partner contractually requires physical data separation, that org can be provisioned an isolated database at that time; the `Organization` record reserves a `dataResidency` field for this. Do not build per-tenant databases preemptively.

### Practical Models Supported

1. **Nexus-managed model** — LAIC directly manages programs, coaches, learners, reviewers, and participants.
2. **Organization-managed model** — A partner organization joins Nexus and manages its own people and groups inside its own tenant boundary.
3. **Program-partner model** — An organization participates inside a program without becoming a full Nexus tenant (e.g., a bridge club under the Bridge Program).
4. **Independent actor model** — An independent coach, reviewer, fellow, or advisor participates directly in a program or app offering.
5. **Multi-affiliation model** — The same coach may be independent in one context and affiliated with one or more organizations in another.

The database and permissions model must support all five models.

---

## 6. Core Object Model

The Nexus Platform should use a small number of durable objects, with flexible relationships.

### Primary Objects

| Object | Meaning |
|---|---|
| User | A person who can sign in by email, phone, or another supported identity provider |
| Organization | A tenant, member organization, partner, club, school, lab, initiative, or coaching organization |
| Organization Relationship | Relationship between organizations, such as parent, member, partner, chapter, club, sponsor, or affiliate |
| Organization Theme | Up to two accent colors + logo, applied to that organization's pages on Nexus |
| Program | A major activity under an owning organization, such as Brain Bee, MindAI Bee, Bridge |
| Program Affiliation | Relationship between a program and a user, organization, or group |
| Program Offering | A concrete thing people can join, access, or use, such as a course, app, challenge, class, cohort, event, pilot, or assessment |
| Registered App | Minimal record of an external app: auth integration, signup hook credentials, launch URL |
| Group | A freeform-named grouping: class, club, chapter, cohort, coach group, reviewer group — named by its creator |
| Registration | A signup record pushed in by an app via the signup hook, or created by an admin/coach/invite |
| Participant | A user admitted or added into a program offering or group |
| Role Assignment | A user's role in a specific scope: global, organization, program, offering, or group |
| Entitlement | Permission for an organization, program, offering, group, or user to use a platform module |
| AuditEvent | Record of important administrative activity: who did what, when |

**Removed from v0.2:** App Shell (replaced by Registered App), SignupScreenConfig (apps own signup UX), PublicPage as a general system (reduced to simple org/program profile pages), Artifact (deferred — see Open Questions, Section 21).

### Flexible Mental Model

```text
Nexus
  Organization (+ theme)
    Program
      Program Offering
        Registered App (if app-type offering)
        Registrations (via signup hook / admin add / coach add / invite)
        Participants
        Groups (freeform-named)

Plus cross-cutting relationships:

User -> RoleAssignment -> Scope
Organization -> OrganizationRelationship -> Organization
Program -> ProgramAffiliation -> Organization/User/Group
Coach -> Affiliation -> Program/Organization/Group/Offering
Learner -> Participant -> Offering/Group
```

This avoids forcing everything into one rigid tree.

---

## 7. Terminology

Use these terms consistently.

### Program Offering

A Program Offering is the generic joinable/access object.

> A Program Offering is a concrete course, challenge, app, class, cohort, event, pilot, assessment, or service created under a Program that people can register for, join, access, or manage.

Examples:

- Brain Bee AI-Enabled Course 2026
- MindAI Bee Bay Area Challenge 2026
- Bridge AI Coach App
- Beginner Bridge Class with Coach X
- ACBL Partner Bridge Learning Pilot

### Registered App

A Registered App is the minimal Nexus-side record of an externally built app. It is **not** a container, shell, or configuration surface for the app. It holds: identity, signup hook credentials, allowed auth methods, and launch URL/context mapping.

### Group

A Group is any named collection of people under an organization, program, or offering. **The name is freeform and chosen by whoever creates it** — "Tuesday Beginners," "Chapter 5 — Bay Area," "Fall 2026 Reviewers." Nexus does not impose a class/club/chapter taxonomy; those are just names people give their groups. An optional freeform `label` field lets creators tag what kind of group it is for their own filtering.

---

## 8. Organization Model

An Organization is the primary tenant-like unit, but it can also represent partner organizations, clubs, or program-level organizations.

Examples:

- MindBrainAI Nexus
- Life in AI Center
- A university lab
- A school
- A bridge club
- A coaching organization
- An ACBL-like bridge organization
- A partner nonprofit
- A future chapter organization

### Organization Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | string | Full name |
| slug | string | URL-safe unique name |
| shortName | string nullable | Example: LAIC |
| organizationType | enum | nexus, initiative, school, university, lab, club, nonprofit, company, individual_practice, coach_org, partner, chapter, region |
| tenantMode | enum | full_tenant, program_affiliate, profile_only |
| parentOrganizationId | uuid nullable | Optional hierarchy |
| status | enum | draft, pending_review, active, suspended, archived |
| missionSummary | text nullable | Public or internal |
| websiteUrl | string nullable | Optional |
| logoUrl | string nullable | Org logo — also used by theming |
| themeJson | jsonb nullable | Up to two accent colors; see Theming (Section 9) |
| dataResidency | enum | shared (default); reserved for future isolated-db orgs |
| publicProfileEnabled | boolean | Directory visibility |
| createdByUserId | uuid | Creator |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### Tenant Modes

| Tenant Mode | Meaning |
|---|---|
| full_tenant | Organization owns its own internal users, admins, programs, groups, and data boundary |
| program_affiliate | Organization is attached to a specific program or app, such as a bridge club under the Bridge Program |
| profile_only | Organization record exists for display, reference, partner listing, or future activation |

### Organization Admin Capabilities

Organization admins can:

- Edit organization profile and theme (accent colors + logo)
- Invite members
- Assign organization roles
- Create programs if allowed
- Manage program admins
- View and approve registrations for their organization (where manual approval is configured)
- Enable or request platform modules
- Manage internal groups if entitled
- View organization audit log

---

## 9. Organization Theming (Nexus Pages Only)

Theming works like Canvas: an organization customizes how **its own pages within the Nexus platform** look. Theming does not extend into apps — apps own their own look entirely.

### Scope

- Organization dashboard and all organization-associated pages on Nexus (programs, offerings, member lists, registration queues, group pages) render with the organization's theme.
- Nexus global admin pages keep the default Nexus theme.

### Theme Settings

Set in organization settings:

| Setting | Constraint |
|---|---|
| Primary accent color | One hex color |
| Secondary accent color | Optional second hex color |
| Logo | Uploaded image (stored via S3-compatible storage API); reasonable size limit enforced (e.g., 1 MB) |

That is the entire theming system. No fonts, no custom CSS, no page builders. Implement as CSS custom properties set per organization context.

### themeJson Shape

```json
{
  "primaryColor": "#7C3AED",
  "secondaryColor": "#0D9488",
  "logoUrl": "https://storage.../org-logo.png"
}
```

---

## 10. Organization Relationships and Program-Affiliated Organizations

The platform must distinguish between:

1. A Nexus member organization
2. A partner organization participating in a program
3. A club or coach organization inside an app ecosystem
4. A profile-only organization used for reference

A bridge organization such as an ACBL-like entity may be:

- A full Nexus member organization
- A partner organization under the Bridge Program
- A coach organization inside the Bridge AI Coach app
- A club-level group or organization
- A profile-only organization until it is activated

### OrganizationRelationship Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| sourceOrganizationId | uuid | Organization A |
| targetOrganizationId | uuid | Organization B |
| relationshipType | enum | parent, child, member, partner, affiliate, chapter_of, club_of, sponsor, host, collaborator |
| status | enum | proposed, active, paused, ended |
| metadataJson | jsonb | Optional details |
| createdAt | timestamp | Created date |

### ProgramOrganizationAffiliation Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| programId | uuid | Program |
| organizationId | uuid | Affiliated organization |
| affiliationType | enum | partner, club, coach_org, reviewer_org, host, sponsor, chapter, region, content_partner |
| tenantAccessMode | enum | none, limited_admin, full_subtenant |
| visibility | enum | private, program, public |
| status | enum | invited, active, paused, archived |
| metadataJson | jsonb | Optional program-specific details |
| createdAt | timestamp | Created date |

This model allows ACBL-like organizations, clubs, and coach organizations to appear under the Bridge Program without confusing them with the top-level MindBrainAI Nexus organization structure.

---

## 11. Program Model

A Program is a major organized activity under an owning organization.

Examples under LAIC: Brain Bee Program, MindAI Bee Program, Bridge Program.

Examples under future organizations: AI Literacy Program, School Debate Coach Program, Dance Learning Program, Research Fellows Program.

### Program Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| owningOrganizationId | uuid | Owning organization, such as LAIC |
| name | string | Program name |
| slug | string | URL-safe |
| programType | enum | course_program, challenge_program, app_program, research_program, community_program, coaching_program, mixed |
| status | enum | draft, active, paused, archived |
| description | text | Program overview |
| publicPageEnabled | boolean | Simple public profile page |
| defaultVisibility | enum | private, organization, public |
| ownerUserId | uuid | Primary program owner |
| metadataJson | jsonb | Program-specific data |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### Program Team and Program Actors

Program-level actors may include: Program Owner, Program Admin, Fellow, Advisor, Reviewer, Volunteer, Instructor, Coach, Tester, Content Contributor, Student Coordinator, Partner Organization Contact.

These roles may exist before a specific offering exists. For example, the Bridge Program may recruit coaches and partner organizations before creating a specific class or pilot.

---

## 12. Program Affiliation Model

Program Affiliation is needed because many actors attach to a program before or beyond a specific offering.

Examples:

- A coach joins the Bridge Program as an independent coach.
- A coach joins the Bridge Program through a bridge organization.
- A bridge club becomes a Bridge Program partner.
- A reviewer joins the MindAI Bee Program.
- A fellow contributes to multiple offerings inside the Bridge Program.
- A school participates in the Brain Bee Program.

### ProgramAffiliation Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| programId | uuid | Program |
| subjectType | enum | user, organization, group |
| subjectId | uuid | User, organization, or group |
| affiliationType | enum | independent_coach, org_affiliated_coach, coach_org, club, school, reviewer, advisor, fellow, volunteer, instructor, learner_group, partner |
| representedOrganizationId | uuid nullable | Used when a user is acting on behalf of an organization |
| status | enum | invited, active, inactive, archived |
| visibility | enum | private, program, public |
| metadataJson | jsonb | Program-specific data |
| createdAt | timestamp | Created date |

The same coach may have multiple affiliations:

```text
Coach A -> Bridge Program -> independent_coach
Coach A -> Bridge Program -> org_affiliated_coach -> Organization X
Coach A -> Bridge App Offering -> coach
Coach A -> Group "Tuesday Beginners" -> coach
```

---

## 13. Program Offering Model

A Program Offering is the concrete thing that people sign up for or use.

Examples: Brain Bee AI-Enabled Course 2026, MindAI Bee Bay Area Challenge 2026, Bridge AI Coach App, Beginner Bridge Class with Coach X, MindAI Bee Regional Round, ACBL Partner Bridge Learning Pilot.

### Program Offering Types

| Offering Type | Examples |
|---|---|
| course | Brain Bee course, MindAI Bee preparation course |
| challenge | MindAI Bee regional challenge |
| app | Bridge AI Coach app, MindAI Bee app, Brain Bee app |
| cohort | Summer cohort, class cohort |
| class | Human coach bridge class |
| event | Info session, challenge day |
| assessment | Placement test, challenge quiz |
| pilot | Private beta or partner pilot |

### Program Offering Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid | Parent program |
| name | string | Offering name |
| slug | string | URL-safe |
| offeringType | enum | course, challenge, app, cohort, class, event, assessment, pilot |
| status | enum | draft, private_beta, open, closed, completed, archived |
| description | text | Overview |
| startDate | date nullable | Optional |
| endDate | date nullable | Optional |
| registrationOpen | boolean | Whether the signup hook accepts new registrations |
| approvalMode | enum | auto_approve, manual_approve | The key registration decision, per offering |
| signupFieldsJson | jsonb nullable | Nexus-defined signup fields for this offering; defaults to Name, Age, Email — editable/extensible by admins |
| platformModule | enum | nexus_only, learning, coaching, bridge, mixed |
| registeredAppId | uuid nullable | Links to Registered App when the offering is an app |
| externalRuntimeUrl | string nullable | Where to launch downstream |
| participantLabelSingular | string nullable | Example: learner, student, player |
| participantLabelPlural | string nullable | Example: learners, students, players |
| metadataJson | jsonb | Offering-specific fields (challenge structure, etc.) |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

---

## 14. Registered App Model (replaces App Shell)

A Registered App is the minimal record Nexus keeps about an externally built app. Apps are built by their own workstreams (Brain Bee app, MindAI Bee app, Bridge app, or a partner org's app that we build for them). Nexus's responsibilities to an app are exactly three: **authentication, the signup hook, and launch context.**

### Why Auth Lives in Nexus

All apps authenticate their users through Nexus (Supabase Auth behind a Nexus-owned service layer). This means:

- One identity store — a user is the same user across Brain Bee, MindAI Bee, and Bridge.
- One place to debug login problems. If login breaks, look at Nexus.
- Apps never store passwords or manage identity themselves.

### RegisteredApp Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid | Parent program |
| offeringId | uuid nullable | Related offering |
| appName | string | Internal/reference name |
| appSlug | string | Stable identifier used in hook calls |
| apiKeyHash | string | Hashed credential for signup hook calls |
| allowedIdentifiersJson | jsonb | email / phone / both — which login methods this app offers |
| status | enum | active, paused, revoked |
| launchUrl | string | Where users are sent to use the app |
| launchContextJson | jsonb | Which context fields are passed on launch |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### What Was Deliberately Removed (vs. v0.2 App Shell)

- themeJson — apps style themselves
- navigationJson — apps own their navigation
- onboardingConfigJson — apps own their onboarding *screens*; the signup *data fields* are Nexus-defined on the offering (`signupFieldsJson`, Section 15)
- roleLabelConfigJson — participant labels live on the offering, not a shell
- signup screen configuration — apps render signup UX; Nexus defines the fields and receives the registration via the hook
- featureFlagsJson — app-level flags belong to the app workstreams

---

## 15. Registration Model: Nexus-Defined Signup Data + The Signup Hook

Registration is a shared responsibility with a clear split:

- **Nexus owns the signup data.** Nexus defines which fields a signup collects — starting simple: **Name, Age, Email** — and admins can edit or add fields per offering as needs evolve. Nexus stores the registration records, scopes them to the right organization/program/offering/app, and runs the approval flow.
- **Apps own the signup screens.** The app renders the signup UI in its own style, but the fields it collects come from the Nexus field definition. The app knows (and Nexus enforces) that a signup made inside it is *for that app's offering*.
- **Sign-in always goes to Nexus.** When a user signs in on any app, the app authenticates against Nexus Auth. One identity store, one place to debug login.

### The Flow

```text
App fetches its signup field definition from Nexus (GET /api/hook/signup-fields)
  -> User opens the app's signup screen (rendered by the app, fields defined by Nexus)
  -> User submits: Name, Age, Email (plus any fields admins have added)
  -> App creates/authenticates the user via Nexus Auth
  -> App calls POST /api/hook/registrations with its API key
  -> Nexus validates the app credential; the registration is bound to that app's offering
  -> Registration record created in shared DB (organization-scoped)
  -> If offering.approvalMode = auto_approve:
       Participant record created immediately; app informed: access granted
  -> If offering.approvalMode = manual_approve:
       Registration status = pending_review
       Appears in the approval queue of admins with registration.approve permission
       On approval -> Participant record created -> user gains access
  -> Either way, the signup is visible on the Nexus admin dashboards
  -> From then on, sign-in on the app authenticates through Nexus
```

### Signup Field Definition

Nexus stores the field set per offering (falling back to a sensible default). Initial default:

```json
{
  "fields": [
    { "key": "name",  "label": "Name",  "type": "text",   "required": true },
    { "key": "age",   "label": "Age",   "type": "number", "required": true },
    { "key": "email", "label": "Email", "type": "email",  "required": true }
  ]
}
```

Admins can edit labels, add fields (e.g., school, region, bridge level), or mark fields optional from the offering admin screen — no code change, no app redeploy required beyond the app re-fetching the definition. Field types for the first release: text, number, email, phone, select, boolean.

```text
GET /api/hook/signup-fields?appSlug=...&offeringId=...
Authorization: Bearer <app API key>

Response: the field definition JSON above
```

### Signup Hook Contract (draft)

```text
POST /api/hook/registrations
Authorization: Bearer <app API key>

{
  "appSlug": "bridge-ai-coach",
  "offeringId": "...",
  "user": {
    "nexusUserId": "...",        // from Nexus Auth session
    "email": "...",
    "phone": "... | null",
    "name": "..."
  },
  "requestedRole": "learner",     // canonical role; app displays student/player per category
  "groupHint": "... | null",      // optional: join code / coach / group reference
  "fieldData": {                  // answers keyed to the Nexus-defined fields
    "name": "...",
    "age": 14,
    "email": "..."
  }
}

Response:
{
  "registrationId": "...",
  "status": "approved | pending_review",
  "participantId": "... | null"
}
```

Nexus validates `fieldData` against the offering's field definition (required fields present, types correct) and rejects malformed submissions. The signup is bound server-side to the app that submitted it — an app credential can only create registrations for its own offering(s).

### Other Entry Paths (kept, secondary)

1. **Admin-created participant** — an admin adds a user directly from the Nexus admin interface.
2. **Coach-created learner** — a coach adds known learners to their group.
3. **Invitation link / join code** — an admin, coach, or organization sends a signup link or code; the app or Nexus sign-in completes it.
4. **Bulk import** — an authorized admin uploads/pastes a participant list.

**Removed from v0.2:** public web registration pages hosted by Nexus, and the SignupScreenConfig object. There is one built-in way in — the signup hook with Nexus-defined fields — plus the direct-add paths above.

### Registration Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid nullable | Optional program |
| offeringId | uuid | Offering being joined |
| groupId | uuid nullable | Optional group |
| registeredAppId | uuid nullable | Which app pushed this, if via hook — the signup is bound to it |
| registrationSource | enum | app_hook, admin_add, coach_add, invite_link, bulk_import |
| email | string nullable | Registrant email |
| phone | string nullable | Registrant phone (E.164) |
| name | string | Registrant name |
| age | integer nullable | From the default field set |
| userId | uuid nullable | Linked Nexus user |
| status | enum | pending_review, approved, rejected, waitlisted, withdrawn, directly_added |
| fieldDataJson | jsonb | Answers keyed to the Nexus-defined fields, validated on receipt |
| reviewedByUserId | uuid nullable | Reviewer |
| reviewedAt | timestamp nullable | Review date |
| createdByUserId | uuid nullable | Admin/coach who added, for direct paths |
| createdAt | timestamp | Submission date |

### Participant Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Organization boundary |
| programId | uuid nullable | Optional program |
| offeringId | uuid | Offering |
| groupId | uuid nullable | Group assignment |
| userId | uuid | User |
| participantType | enum | learner, coach, reviewer, advisor, volunteer, organizer, instructor |
| status | enum | active, inactive, completed, removed |
| addedByUserId | uuid nullable | Admin/coach who added |
| registrationId | uuid nullable | Source registration if any |
| metadataJson | jsonb | Optional participant-specific data |
| createdAt | timestamp | Created date |

Note: `learner` is the canonical type; apps display "student" (Edu) or "player" (Game) per the offering's participant labels.

### Phone-Based Registration

Sign-in and the hook support phone as a first-class identifier where the app allows it (`allowedIdentifiersJson` on the Registered App): email only, phone only, or both. Phone numbers are normalized to E.164.

---

## 16. Group Model (Simplified)

Classes, bridge classes, clubs, chapters, cohorts, coach groups, reviewer groups — **on Nexus these are all just Groups.** The coach, instructor, or administrator titles the group whatever they want, and it is saved under that name in the groups category.

### Group Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid nullable | Optional |
| offeringId | uuid nullable | Optional |
| name | string | **Freeform, chosen by the creator** — "Tuesday Beginners", "Chapter 5 — Bay Area" |
| label | string nullable | Optional freeform tag for the creator's own filtering ("class", "club", "chapter") — not an enum, not enforced |
| visibility | enum | private, organization, program, public |
| parentGroupId | uuid nullable | Supports hierarchy (e.g., MindAI Bee region containing chapters) |
| ownerUserId | uuid nullable | Optional group owner (e.g., the coach) |
| ownerOrganizationId | uuid nullable | Optional org owner (e.g., a club org) |
| metadataJson | jsonb | Optional group-specific data |
| createdAt | timestamp | Created date |

**Changed from v0.2:** `groupType` is no longer an enum (`cohort, coach_group, club, ...`). It is replaced by the freeform `label`. Group semantics come from who owns them and where they sit, not from a fixed taxonomy.

Hierarchy is retained via `parentGroupId` because MindAI Bee's chapter → region → state → national → international structure maps onto nested groups, and admin access at a level cascades to descendant groups:

```text
resolveAdminScope(groupId) = { groupId } ∪ all descendant group IDs (recursive, within the same program)
```

### Bridge Example

```text
Bridge Program
  -> Program-affiliated organization: ACBL-like Organization
    -> Group "Palo Alto Club"        (label: club)
      -> Group "Monday Intermediate" (label: class, owner: Coach B)
  -> Independent Coach A
    -> Group "Coach A's Learners"    (owner: Coach A)
```

Learners are visible only to their assigned coach/group unless shared.

---

## 17. Role and Permission Model

Use scoped role-based access control.

### Role Scopes

| Scope | Meaning |
|---|---|
| global | Applies across Nexus |
| organization | Applies within one organization |
| program | Applies within one program |
| offering | Applies within one program offering |
| group | Applies within a group |

**Removed from v0.2:** the `app_shell` scope (no app shells). App credential management is an organization/program-scoped permission.

All non-global roles must be evaluated inside an organization/program/offering/group boundary. A coach role in one bridge organization does not imply access to another organization's learners.

### Initial Roles

| Role | Scope | Capabilities |
|---|---|---|
| nexus_super_admin | global | Full access |
| nexus_admin | global | Manage organizations and platform settings |
| nexus_advisor | global | View selected Nexus-level dashboards and advise |
| nexus_team_member | global | Internal Nexus workstream/team role |
| organization_owner | organization | Full control of organization, including theme |
| organization_admin | organization | Manage organization profile, programs, members |
| program_owner | program | Full control of program |
| program_admin | program | Manage program team, affiliations, offerings, registered apps |
| program_advisor | program | View selected dashboards, comment, advise |
| program_reviewer | program/offering | Review applications or challenge items |
| fellow | program/offering | Contributor role |
| volunteer | program/offering | Limited operational access |
| coach / instructor | program/offering/group | Manage assigned learners/groups (canonical role: instructor; label varies) |
| offering_owner | offering | Manage offering |
| offering_admin | offering | Manage registrations and participants; approve where manual_approve |
| learner | offering/group | Access assigned offering (displayed as student/player per category) |
| participant | offering | General participant access |

### Permission Examples

Permissions should be stored as strings. Examples:

- organization.create / organization.update / organization.invite_member / organization.view_members / organization.manage_theme
- program.create / program.update / program.manage_team / program.manage_affiliations
- offering.create / offering.publish
- registered_app.create / registered_app.update / registered_app.rotate_key
- registration.view / registration.approve
- participant.add / participant.manage
- group.create / group.manage_members
- entitlement.manage
- audit.view

Do not hardcode permissions only in the UI. Permission checks must happen server-side, and organization isolation is additionally enforced by RLS at the database layer.

---

## 18. MindAI Bee Challenge Structure Model

MindAI Bee requires the ability to represent challenge structures without overbuilding. It may begin only at a regional level and later expand to state, national, or international levels.

Challenge levels map onto **nested Groups** (Section 16). The structure record stores configuration metadata only. **No competition management, scoring, or grading is built** — that is explicitly out of scope.

### Challenge Structure Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| programId | uuid | MindAI Bee Program |
| offeringId | uuid | Challenge offering |
| structureType | enum | single_level, chapter_region, regional_state, regional_national, international, custom |
| levelsJson | jsonb | Flexible level definitions, each mapping to a group |
| registrationRulesJson | jsonb | Eligibility, age, school, region |
| requiredCourseOfferingId | uuid nullable | Linked course offering |
| createdAt | timestamp | Created date |

### Example Levels JSON

```json
[
  { "level": "chapter",       "label": "Chapter Round",       "enabled": true  },
  { "level": "regional",      "label": "Regional Round",      "enabled": true  },
  { "level": "state",         "label": "California Round",    "enabled": false },
  { "level": "national",      "label": "National Round",      "enabled": false },
  { "level": "international", "label": "International Round", "enabled": false }
]
```

Store enough structure so the program can evolve. Do not implement advancement rules, scoring, or round management in the first release.

---

## 19. Bridge Program Structure Model

The Bridge Program must support a more complex actor network than a simple course.

### Actor Types

Independent coaches; coaches under organizations; coaches who are both; bridge organizations; bridge clubs; fellows; reviewers; volunteer players; learners; learner groups; partner organizations; ACBL-like organizations.

### Bridge Program-Level Structures

At the program level, Nexus supports:

- Coach onboarding (independent and org-affiliated)
- Coach organization and club onboarding (program-affiliated organizations)
- Program-level coach directory if enabled
- Program-level reviewer/fellow/volunteer lists
- App offering (Bridge AI Coach App) with its Registered App record
- Groups created and named by coaches, clubs, or admins

### Bridge Launch Context

When a user launches the Bridge app, Nexus passes or makes available:

```json
{
  "userId": "...",
  "organizationId": "...",
  "programId": "...",
  "offeringId": "...",
  "groupId": "...",
  "coachId": "...",
  "role": "learner",
  "affiliations": ["independent_coach", "club_member"],
  "entitlements": ["bridge", "coaching", "learning"]
}
```

The Bridge Platform then owns gameplay and coaching behavior. The Bridge app owns all of its own screens, including signup screens (which call the Nexus signup hook).

---

## 20. Entitlements and Platform Modules

Nexus must know which organizations, programs, and offerings can use which downstream platform modules.

### Platform Modules

| Module | Meaning |
|---|---|
| nexus | Base organization/program/offering management |
| learning | AI-enabled courses, tutorials, lessons, assessments |
| coaching | Generalized coaching runtime — card-game simulation coaching; bridge is the first game, generalizable to poker and other card games given rules + coach context |
| analytics | Dashboards and reporting |

Notes:

- **Bridge is not a separate module.** Bridge is one game configuration inside the coaching module. (Per review: "bridge and coaching is one — bridge is one specific type of coaching mode.")
- **Payments are not a module in this release.** Not being handled at this time.

### Entitlement Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subjectType | enum | organization, program, offering |
| subjectId | uuid | The entitled object |
| module | enum | nexus, learning, coaching, analytics |
| status | enum | active, trial, requested, disabled |
| limitsJson | jsonb | Seats, offerings, storage caps (MB limits), usage limits |
| startsAt | timestamp nullable | Optional |
| endsAt | timestamp nullable | Optional |
| createdAt | timestamp | Created date |

### Integrations (external communication tools)

Separately from platform modules, an `Integration` entity gates access to external communication tools. **Generic, not hardcoded to Discord** — Discord is simply the first instance.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid nullable | Optional program scope |
| integrationType | string | "discord" first; slack, email_digest, etc. later |
| configJson | jsonb | Server link, webhook, channel mapping |
| permissionLevel | enum | can_edit, can_view, per_level |
| status | enum | active, disabled |
| createdAt | timestamp | Created date |

---

## 21. Open Questions (carried forward)

1. **Artifacts.** Should uploaded/generated content objects (PDFs, syllabi, PBN files, certificates) be stored in or visible to Nexus at all, or live entirely in the downstream platforms? Deferred out of the first release; revisit when the Learning Platform's storage model is concrete. Nexus reserves no artifact table for now.
2. **Learning Platform ↔ Nexus content-readiness contract.** What signal does the Learning Platform send Nexus when a course is ready to publish (webhook vs. status poll)? Needs a decision with the Learning Platform workstream. Since emails/accounts are linked, the course is linked and visible on Nexus for monitoring — the exact status contract is the open part.
3. **Approval default.** Manual vs. auto approval exists per offering (`approvalMode`). Open for Ashvin: should any offering types default to manual approval (e.g., challenges with eligibility rules), or default everything to auto and let admins opt in?

---

## 22. Admin Interface

The Nexus Platform must include a desktop-friendly admin dashboard. Mobile-friendly admin can come later. (App signup flows are mobile-native inside the apps themselves — not a Nexus concern.)

### Global Nexus Admin

Screens: Global dashboard; Nexus teams/advisors; Organizations list; Create organization; Organization detail; Users list; Platform modules; Entitlements; Audit log.

### Organization Admin

Screens: Organization dashboard; Organization profile; **Theme settings (accent colors + logo)**; Members; Invite/add member; Programs list; Create program; Entitlements; Integrations; Organization groups if enabled.

### Program Admin

Screens: Program dashboard; Program profile; Program team; Program affiliations; Partner organizations; Coach/fellow/reviewer/advisor lists; Program offerings list; Create program offering; **Registered apps list (credentials, launch URLs)**; Program registrations.

### Program Offering Admin

Screens: Offering dashboard; Offering settings (**including approvalMode**); **Signup field editor (defaults: Name, Age, Email — add/edit fields without code changes)**; **Registration queue (approve/reject where manual)**; Participant list; Groups; Launch downstream module.

### Initial UI Priority

Build these first:

1. Sign in
2. Global admin dashboard
3. Organization list/create/detail (+ theme settings)
4. Program list/create/detail
5. Program team and affiliations
6. Program offering list/create/detail (with approvalMode)
7. Registered app create + credential management
8. Registration queue (hook-fed) and direct-add flows
9. Participant list
10. Groups and group membership
11. Entitlements and launch links

**Removed from v0.2 priority list:** app shell configuration, public page / signup screen configuration.

---

## 23. Implementation Stack (RESOLVED)

The stack decision is made. TypeScript-first, Supabase-backed, written portably.

### The Stack

```text
Next.js + TypeScript + Tailwind + shadcn/ui
+ Supabase Postgres (single shared DB, RLS enforced)
+ Supabase Auth (email + phone)
+ Supabase Storage (via S3-compatible API)
+ Prisma or Drizzle (standard SQL/ORM — no Supabase query helpers)
+ Vercel (app hosting) — Cloud Run acceptable alternative
+ Zod + React Hook Form (validation/forms)
+ TanStack Table (admin lists)
+ Resend or equivalent (invitation emails)
+ Sentry (error reporting)
```

### Portability Rules (mandatory)

These keep a future migration to AWS/GCP/Azure feasible:

1. **Database access goes through Prisma/Drizzle with standard SQL** — never Supabase's client-side query helpers (`supabase.from(...)`) in business logic. Standard Postgres migrates cleanly to RDS, Cloud SQL, or Azure Database for PostgreSQL.
2. **Storage goes through the S3-compatible API** — never Supabase-only storage helpers. Migrates to real S3 or Azure Blob with minimal code change.
3. **Auth is wrapped in a Nexus-owned service layer** (`getCurrentUser()`, `requireRole()`, `requirePermission()`) — Supabase Auth SDK calls appear only inside `lib/auth/`, never scattered through the codebase. Swapping the provider later means rewriting one module. Auth migration is still the hardest part of any future move (user credentials, sessions); this containment is the mitigation.
4. **RLS policies are written as plain Postgres SQL** in migration files, so they travel with the schema.

### Explicitly Deferred (no DevOps labor available now)

Do **not** build this yet:

```text
Dockerized Next.js/Node app + managed PostgreSQL + object storage
+ managed secrets + CI/CD + monitoring stack
```

This is the eventual production-hardening path if/when a concrete trigger appears (partner SSO requirement, contractual data isolation, scale). Revisit on trigger, not preemptively.

### Database Rules

- One shared PostgreSQL database. Every tenant-scoped table has `organizationId` with an RLS policy.
- Relational tables + JSONB for program-specific configuration.
- No JSON-file, Airtable, or spreadsheet starting points.

---

## 24. Mobile App Strategy (Apps Workstream Reference)

Apps are built by their own workstreams; this section is reference guidance only.

- Responsive web app first; installable PWA where useful; native wrapper only when app-store distribution becomes necessary.
- **Expo** is a good wrapper for taking the web app native (team has experience; supports modern native UI treatments). Capacitor is the alternative if the app stays fully web-first.
- Whatever the wrapper, the app authenticates through Nexus Auth and registers users through the signup hook.

---

## 25. Folder Structure

```text
apps/
  nexus-web/
    app/
      (public)/
        org/[orgSlug]/                # simple themed org profile page
        programs/[programSlug]/       # simple program profile page
      (auth)/
        sign-in/
        sign-up/
      (admin)/
        admin/
          organizations/
          programs/
          affiliations/
          offerings/
          registered-apps/
          registrations/
          participants/
          groups/
          settings/
      api/
        hook/
          registrations/              # the signup hook
        webhooks/
    components/
      admin/
      public/
      forms/
      layout/
      tables/
      theme/                          # org accent-color/logo application
    lib/
      auth/                           # ALL Supabase Auth calls live here
      db/                             # Prisma/Drizzle client
      storage/                        # S3-compatible storage adapter
      permissions/
      validation/
      services/
      audit/
      config/
    modules/
      organizations/
      programs/
      affiliations/
      offerings/
      registered-apps/
      memberships/
      registrations/
      participants/
      groups/
      entitlements/
      integrations/
      audit/
    prisma/                           # schema + RLS policies in migrations
    tests/

packages/
  shared-types/                       # shared with app workstreams (stable string IDs, context shapes)
  permissions/
  config-schemas/
```

A single Next.js app works for the first release. The `shared-types` package is worth having early so app workstreams consume the same launch-context and hook-payload types.

---

## 26. Database Schema Draft

Implementation-oriented draft, not final production SQL.

### Core Tables

```text
users
user_identities
organizations                  (includes themeJson, dataResidency)
organization_relationships
organization_memberships
programs
program_affiliations
program_offerings              (includes approvalMode)
registered_apps
groups                         (freeform name + optional label; parentGroupId)
group_memberships
registrations                  (registrationSource includes app_hook)
participants
roles
role_assignments
permissions
role_permissions
entitlements
integrations
invitations
audit_events
```

**Removed from v0.2:** `app_shells`, `public_pages` (general system), `signup_screen_configs`, `artifacts` (deferred).

### Role Assignment Table

| Field | Type |
|---|---|
| id | uuid |
| userId | uuid |
| scopeType | enum: global, organization, program, offering, group |
| scopeId | uuid nullable |
| roleKey | string |
| status | enum: active, invited, suspended, removed |
| createdByUserId | uuid nullable |
| createdAt | timestamp |

### Generic Scoped Membership Option

For implementation speed, use generic scoped membership for relationships that are not complex yet:

```text
scoped_memberships
  id, user_id, scope_type, scope_id, membership_type, status, metadata_json, created_at
```

Use specific tables only where needed: program_affiliations, participants, registrations, group_memberships.

### RLS Baseline

Every tenant-scoped table gets a policy of the shape:

```sql
CREATE POLICY org_isolation ON <table>
  USING (organization_id = current_setting('app.current_org_id')::uuid
         OR has_global_role(current_setting('app.current_user_id')::uuid));
```

(Exact mechanism — session settings vs. Supabase JWT claims — decided at implementation; the policy intent is fixed: no cross-organization row visibility, global Nexus roles excepted and audited.)

---

## 27. API and Service Layer

Do not put business logic directly into page components. Use service modules.

### Organization Service

createOrganization, updateOrganization, updateOrganizationTheme, archiveOrganization, listOrganizationsForUser, getOrganizationDashboard, inviteOrganizationMember, createOrganizationRelationship, listOrganizationRelationships

### Program Service

createProgram, updateProgram, listProgramsForOrganization, assignProgramRole, getProgramDashboard, addProgramAffiliation, listProgramAffiliations

### Program Offering Service

createProgramOffering, updateProgramOffering, setApprovalMode, **updateSignupFields**, publishProgramOffering, closeProgramOffering, listOfferingsForProgram, getOfferingDashboard

### Registered App Service

registerApp, updateApp, rotateApiKey, revokeApp, getAppLaunchContext

### Registration Service (hook-centric)

**getSignupFieldDefinition** (serve the offering's field set to the app), **receiveHookRegistration** (validate app credential → validate fieldData against the field definition → create registration bound to the app's offering → auto-approve or queue), createRegistrationFromAdminAdd, createRegistrationFromCoachAdd, reviewRegistration, approveRegistration, rejectRegistration, createParticipantFromRegistration, bulkImportRegistrations

### Participant Service

addParticipant, updateParticipant, removeParticipant, assignParticipantToGroup, listParticipantsForOffering, listParticipantsForGroup

### Group Service

createGroup (freeform name), updateGroup, listGroups, addGroupMember, removeGroupMember, resolveGroupScope (recursive descendant resolution)

### Permission Service

hasPermission, requirePermission, listUserScopes, assignRole, revokeRole, resolveEffectiveRoles

### Entitlement Service

checkModuleAccess, enableModule, disableModule, listEntitlements, enforceUsageLimit

### Audit Service

recordAuditEvent, listAuditEvents, attachActorAndScope

---

## 28. Logical API Endpoints

### The Signup Hook (app-facing)

```text
GET    /api/hook/signup-fields          # app fetches Nexus-defined signup fields for its offering
POST   /api/hook/registrations          # apps push signups here (Bearer app API key)
GET    /api/hook/registrations/:id      # app checks status (approved/pending)
```

### Organizations

```text
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:id
PATCH  /api/organizations/:id
PATCH  /api/organizations/:id/theme
POST   /api/organizations/:id/invite
GET    /api/organizations/:id/members
POST   /api/organizations/:id/relationships
GET    /api/organizations/:id/relationships
```

### Programs

```text
GET    /api/organizations/:organizationId/programs
POST   /api/organizations/:organizationId/programs
GET    /api/programs/:id
PATCH  /api/programs/:id
POST   /api/programs/:id/roles
GET    /api/programs/:id/affiliations
POST   /api/programs/:id/affiliations
```

### Program Offerings

```text
GET    /api/programs/:programId/offerings
POST   /api/programs/:programId/offerings
GET    /api/offerings/:id
PATCH  /api/offerings/:id              # includes approvalMode
POST   /api/offerings/:id/publish
POST   /api/offerings/:id/close
```

### Registered Apps

```text
GET    /api/programs/:programId/apps
POST   /api/programs/:programId/apps
GET    /api/apps/:id
PATCH  /api/apps/:id
POST   /api/apps/:id/rotate-key
GET    /api/apps/:id/launch-context
```

### Registrations (admin-facing)

```text
POST   /api/offerings/:id/registrations/admin-add
POST   /api/groups/:id/participants/coach-add
GET    /api/offerings/:id/registrations
POST   /api/registrations/:id/approve
POST   /api/registrations/:id/reject
```

### Participants and Groups

```text
GET    /api/offerings/:id/participants
POST   /api/offerings/:id/participants
PATCH  /api/participants/:id
POST   /api/participants/:id/assign-group

GET    /api/programs/:programId/groups
POST   /api/programs/:programId/groups
GET    /api/groups/:id
PATCH  /api/groups/:id
GET    /api/groups/:id/members
POST   /api/groups/:id/members
```

---

## 29. Integration Boundaries

Nexus should not know the internals of downstream systems. It knows: who the user is; what organization/program/offering they belong to; what role and group they have; what modules they can access; where to send them.

### Learning Platform

Nexus sends: organizationId, programId, offeringId, userId, participant role, entitlement status, groupId if applicable.
Learning returns: courseId, course launch URL, enrollment status, progress summary if needed later. (Content-readiness signal: open question, Section 21.)

### Coaching Platform (includes Bridge)

Nexus sends: userId, organization/program/offering context, role, coach/learner relationship, group context, game type (bridge first; poker etc. later).
Coaching returns: coach profile URL, session launch URL, high-level status if needed later.

### Apps (Brain Bee, MindAI Bee, Bridge, partner apps)

Apps consume: Nexus Auth sessions, launch context, hook responses.
Apps provide: signup pushes via the hook. Nothing else crosses the boundary.

---

## 30. Where AI/LLM Comes In

For the Nexus release, AI is not required. The platform is structured CRUD, workflow, permissions, registration records, and admin logic.

**Do not use LLM for:** permission decisions; role enforcement; approvals; user identity; security-sensitive actions; database writes without explicit user action; program or organization status changes; access to minors' data.

**Possible later AI uses (admin assistance only):** drafting program descriptions, summarizing applications, suggesting reviewer assignments, writing announcements, summarizing organization activity.

Build clean structured data first. Add AI assistant features only after core workflows work.

---

## 31. Security and Privacy Requirements

The Nexus Platform controls access to people, organizations, students, programs, and future minors. Security must be designed from the beginning.

### Required

- Authenticated admin routes
- Role-based access checks on every protected action, server-side
- **RLS enforcement at the database layer for organization isolation**
- **Signup hook authentication: per-app API keys, hashed at rest, rotatable, revocable; rate limiting on the hook endpoint**
- No relying only on hidden UI buttons
- Audit log for admin changes (who did what, when)
- Scoped access to registrations and participants
- Private groups for coach/learner relationships
- Minimal public exposure
- Secure invitation tokens
- Email and/or phone verification as configured
- No cross-organization visibility unless explicitly configured
- Data export/delete workflow later

### Student and Minor Considerations

Since Brain Bee, MindAI Bee, and internships may involve high school students: store only necessary personal information; never expose student lists publicly; support guardian-related fields later if needed; separate public profiles from private participant records; limit coach access to assigned learners/groups; audit admin/coach access to student lists.

### Data Visibility Rule

Default to private. Public profile pages use explicitly published content only. Admin data, registrations, participant lists, and group membership never become public accidentally.

---

## 32. Audit Log

Every important admin action creates an audit event: **who did what, when.**

### Audit Event Examples

organization.created, organization.updated, organization.theme_updated, organization.relationship_created, member.invited, member.added, role.assigned, role.revoked, program.created, program.updated, program_affiliation.created, program_offering.created, program_offering.published, registered_app.created, registered_app.key_rotated, registration.hook_received, registration.admin_added, registration.coach_added, registration.approved, registration.rejected, participant.created, participant.assigned_to_group, entitlement.enabled, entitlement.disabled

### Audit Fields

| Field | Type |
|---|---|
| id | uuid |
| actorUserId | uuid nullable |
| action | string |
| scopeType | string |
| scopeId | uuid nullable |
| targetType | string nullable |
| targetId | uuid nullable |
| metadataJson | jsonb |
| createdAt | timestamp |

---

## 33. Build Sequence

Organized as implementation slices (AI-assisted development; not a fixed weekly schedule). Order follows: **admin data structures and permissions first, app-facing surfaces (auth integration + hook) after the core, polish last.**

### Slice 1: Project Foundation

Repository initialized; Next.js/TypeScript app; Supabase project (Postgres + Auth); Prisma/Drizzle wired with standard SQL; auth wrapped in `lib/auth/` service layer; base admin layout; user + identity tables; seed Nexus super admin.

### Slice 2: Organization Foundation

Organization schema (+ themeJson, dataResidency); organization CRUD; **RLS policies on all tenant-scoped tables from the first migration**; organization relationships; organization dashboard; members; role assignment basics; permission checks; audit events.

### Slice 3: Program Foundation

Program schema; program CRUD; program dashboard; program team roles; program affiliations; partner/club/coach-organization affiliation records; seed Brain Bee, MindAI Bee, Bridge programs.

### Slice 4: Offerings and Groups

Program offering schema (with approvalMode); offering CRUD; group schema (freeform names, parentGroupId); group CRUD and membership; recursive group-scope resolution; coach/learner isolation test.

### Slice 5: Registered Apps and Auth Integration

Registered app schema; app credential issuance and rotation; Nexus Auth session flow usable by an external app; launch-context endpoint; shared-types package for app workstreams.

### Slice 6: The Signup Hook and Registration

Signup field definition (default Name/Age/Email; per-offering editing in admin); field-definition endpoint; hook endpoint (validate credential → validate fieldData → create registration bound to the app's offering → auto-approve or queue); admin-add flow; coach-add flow; invitation links; bulk import; approval queue UI; participant creation; email/phone identity handling.

### Slice 7: Entitlements, Integrations, and Downstream Launch

Entitlement model (modules: nexus, learning, coaching, analytics); module access checks; Integration entity (Discord first, generic shape); Learning/Coaching launch contracts; launch URL placeholders.

### Slice 8: Theming and Public Profiles

Organization theme settings (two accent colors + logo, size-limited upload via S3-compatible API); theme application across org-scoped Nexus pages; simple org/program public profile pages (no page builder).

### Slice 9: Hardening and Release Preparation

Permission test coverage; cross-organization isolation tests (RLS verified); hook auth and rate-limit tests; audit log review; admin UI cleanup; error handling; production environment configuration; backup and restore check; basic monitoring (Sentry).

---

## 34. Implementation Priorities

Build in this order:

1. Authenticated admin shell
2. User and identity model
3. Organization model + RLS
4. Scoped role/permission enforcement
5. Program model
6. Program affiliation model
7. Program offering model (approvalMode)
8. Groups (freeform) and group membership
9. Registered apps + auth integration for apps
10. Signup hook + registration flows + approval queue
11. Participant model
12. Entitlements + integrations
13. Downstream launch links
14. Audit log
15. Theming + simple public profiles
16. Seed data for Brain Bee, MindAI Bee, Bridge

Do not begin with visual polish. Begin with the admin and data model.

---

## 35. Acceptance Criteria

The Nexus release is successful when the team can perform these flows.

### Flow 1: Create LAIC

- Nexus admin signs in
- Creates LAIC organization
- Assigns organization admin
- Enables learning and coaching modules
- Sets LAIC theme (accent colors + logo); LAIC pages on Nexus render themed

### Flow 2: Nexus-Level Team/Advisor Records

- Nexus admin adds an advisor or team member scoped at global level
- Advisor does not automatically gain access to private organization data unless authorized

### Flow 3: Create Three Programs

- LAIC admin creates Brain Bee, MindAI Bee, and Bridge Programs
- Each program has its own dashboard and team

### Flow 4: Brain Bee App Signup via Hook

- Program admin creates Brain Bee course offering with approvalMode = auto_approve
- Registers the Brain Bee app; issues API key
- Admin views the default signup fields (Name, Age, Email) and adds a "School" field — no code change
- A test client (simulating the app) fetches the field definition, authenticates a user via Nexus Auth, and calls the signup hook with the collected answers
- Nexus validates the fieldData, binds the registration to the app's offering, and auto-approves
- Registration appears on the Nexus dashboard; participant created immediately
- Participant launches Learning Platform placeholder with correct context; subsequent sign-in on the app authenticates through Nexus

### Flow 5: MindAI Bee Challenge with Manual Approval

- Program admin creates MindAI Bee challenge offering with approvalMode = manual_approve
- Defines regional/chapter structure metadata; chapters exist as nested groups
- Test signup via hook lands in pending_review
- Admin with registration.approve permission approves; participant created at the correct group scope

### Flow 6: Bridge Coaches and Groups

- Program admin registers the Bridge app
- Adds an independent coach and a coach organization (program affiliation)
- Coach creates a group named whatever they want ("Tuesday Beginners")
- Coach adds learners directly; learner signup also arrives via hook
- Learner launches downstream Bridge placeholder with org/group/coach context

### Flow 7: Permissions and Isolation Hold

- A Brain Bee reviewer cannot access Bridge learner lists
- A bridge coach sees only assigned learners
- A coach organization manages only its own groups
- Organization admin sees programs inside their organization only
- Nexus admin sees all organizations
- **RLS test: a query executed in Org A's context returns zero rows from Org B, even with the WHERE clause removed**

---

## 36. Recommended Seed Data

### Organizations

MindBrainAI Nexus; Life in AI Center; Example ACBL-like Bridge Organization; Example Bridge Club; Example School

### Programs Under LAIC

Brain Bee Program; MindAI Bee Program; Bridge Program

### Program Offerings

Brain Bee AI-Enabled Course 2026 (auto_approve); MindAI Bee Bay Area Challenge 2026 (manual_approve); Bridge AI Coach App Pilot

### Registered Apps

Brain Bee Course App; MindAI Bee App; Bridge AI Coach App — each with test credentials

### Roles

Nexus Super Admin; Nexus Advisor; LAIC Organization Admin; Brain Bee Program Admin; MindAI Bee Program Admin; Bridge Program Admin; Bridge Independent Coach; Bridge Organization Coach; Learner; Reviewer; Advisor; Fellow

### Groups (freeform-named)

"Coach A's Learners"; "Palo Alto Club — Monday Intermediate"; "MindAI Bee Bay Area Region" ⊃ "Chapter 1"; "Brain Bee Course Reviewers"

---

## 37. Naming Recommendations

| Concept | Recommended Name |
|---|---|
| Overall platform | Nexus Platform |
| Legal/nonprofit umbrella | MindBrainAI Nexus |
| Main initiative | Life in AI Center |
| Short initiative name | LAIC |
| Top-level tenant/member entity | Organization |
| Organization participating inside a program | Program-Affiliated Organization |
| Major activity under organization | Program |
| Concrete joinable/access item | Program Offering |
| External app known to Nexus | Registered App |
| The API apps call to push signups | Signup Hook |
| Course/challenge/app participant | Participant |
| Person account | User |
| Email/phone/provider login record | Identity |
| Relationship to org/program/offering/group | Membership / Affiliation / Role Assignment |
| Access to platform module | Entitlement |
| External communication tool access | Integration |
| Signup record | Registration |
| Named collection of people | Group |

Avoid using app, program, course, and challenge interchangeably. Use Program Offering as the generic container. **"App Shell" is retired** — use Registered App, and only for the auth/hook/launch record.

---

## 38. Key Design Decisions

### Decision 1: Nexus Is the System of Record for Organization and Access Structure

Nexus owns organizations, programs, program offerings, registered apps, users, roles, groups, registrations, participants, and entitlements.

### Decision 2: Single Shared Database with RLS (v0.3)

One Supabase Postgres database; organization isolation enforced by Row-Level Security at the data layer. Per-tenant databases only if a future contract demands it (`dataResidency` reserved).

### Decision 3: Portability Over Convenience (v0.3)

Supabase is the provider, but the code is written cloud-portable: Prisma/Drizzle + standard SQL, S3-compatible storage API, auth contained in one service module.

### Decision 4: Apps Own Their Screens; Nexus Owns Identity, Signup Data, and Records (v0.3)

No app shells. Apps build all their own screens including signup UI — but the signup *fields* are defined by Nexus (Name, Age, Email to start; admin-editable per offering), signups are bound to the app that submitted them, and sign-in on every app goes through Nexus. Registration approval (auto/manual) is a per-offering Nexus setting.

### Decision 5: Theming Is Nexus-Side and Minimal (v0.3)

Two accent colors + logo per organization, applied to that org's Nexus pages. Like Canvas. Nothing more.

### Decision 6: Groups Are One Freeform Concept (v0.3)

Classes, clubs, chapters, cohorts are all Groups with creator-chosen names. Hierarchy via parent pointer. No fixed taxonomy.

### Decision 7: Bridge Is a Coaching Mode, Not a Module (v0.3)

The coaching module covers card-game simulation coaching generally; bridge is the first game, generalizable to poker and others. No payments module in this release.

### Decision 8: Nexus Allows Multiple Levels of Actors

Actors attach at Nexus, organization, program, offering, or group level. Program-affiliated organizations are first-class. Coaches can be independent or organization-affiliated, or both.

### Decision 9: Use Scoped Roles with Canonical Names

One canonical role per function (instructor, learner); Teacher/Coach and Student/Player are display labels per offering.

### Decision 10: Structured Data Before AI; Default to Private; Production-Capable From the Start

No LLM in core logic. Everything private unless explicitly published. Real database, real auth, environment separation, audit logs from day one.

---

## 39. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Overbuilding into a full LMS | Keep course internals out of Nexus |
| Overbuilding app infrastructure in Nexus | App Shell removed; Nexus surface is auth + hook + launch context only |
| Rigid hierarchy fails for Bridge | Program affiliations, organizations, groups, scoped roles |
| Data leakage across organizations | RLS at the database layer + server-side permission checks + isolation tests |
| Hook abuse / fake signups | Per-app API keys (hashed, rotatable), rate limiting, offering-scope validation |
| Supabase lock-in | Portability rules: standard SQL via ORM, S3-compatible storage, auth contained in one module |
| Auth migration pain later | Acknowledged as the hardest future migration; contained via service layer; revisit on partner-SSO trigger |
| Confusing Nexus organizations with Bridge organizations | tenantMode and ProgramOrganizationAffiliation |
| Group taxonomy churn | Freeform names + optional label; semantics from ownership and placement |
| AI distraction | Defer LLM features |
| Schema churn | Core relational model plus metadataJson/configJson |

---

## 40. Final Architecture Formula

```text
Organizations (+ themes)
+ Organization Relationships
+ Programs
+ Program Affiliations
+ Program Offerings (auto/manual approval)
+ Registered Apps (auth + signup hook + launch context)
+ Users and Identities
+ Scoped Roles
+ Registrations (hook-fed) and Direct Adds
+ Participants
+ Groups (freeform-named)
+ Entitlements and Integrations
+ Audit Logs
= Administrative, identity, registration, and access foundation for all Nexus/LAIC products
```

The Nexus Platform should make it possible to say:

```text
LAIC owns the Brain Bee Program.
The Brain Bee app (built by its own workstream) authenticates users through Nexus.
A student signs up inside the app; the app pushes the registration through the signup hook.
The offering auto-approves; the student appears on the Nexus dashboard and launches into the Learning Platform.
```

Or:

```text
LAIC owns the MindAI Bee Program.
The challenge offering requires manual approval.
Signups from the app queue for review; an authorized organizer approves them at the right chapter scope.
```

Or:

```text
LAIC owns the Bridge Program.
Independent coaches, coach organizations, and clubs are onboarded.
A coach creates a group named whatever they want and adds learners.
Learners launch into the Bridge Platform with correct organization, group, coach, and role context.
```

That is the role of the Nexus Platform: the organizational, administrative, identity, membership, registration-record, and access layer that allows the specialized learning, coaching, and bridge systems — and the apps built on top of them — to exist cleanly underneath it.
