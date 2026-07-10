# Nexus Platform Implementation Architecture

Version: 0.2 revised

Date: July 8, 2026

Prepared for: MindBrainAI Nexus / Life in AI Center development workstreams

Primary workstream: Nexus Platform

Related workstreams: Learning Platform, Coaching Platform, Bridge Platform, Brain Bee App, MindAI Bee App, Bridge App

---

## 1. Purpose

This document defines the implementation architecture for the Nexus Platform workstream.

The immediate goal is to help the development team and AI-assisted software-building process start implementation quickly. This document should be usable as a project context file for AI coding agents and as a shared specification for the Nexus workstream.

The Nexus Platform is the highest-level organizational, administrative, identity, registration, app-shell, and access-control layer for MindBrainAI Nexus. It provides the infrastructure needed to create and manage:

- Nexus-level entities, teams, advisors, and administrators
- Member organizations and partner organizations
- Programs such as Brain Bee, MindAI Bee, Bridge, and future programs
- Program teams, advisors, reviewers, fellows, volunteers, coaches, and learners
- Program offerings such as courses, apps, challenges, classes, pilots, events, and cohorts
- App shells and app-level configuration
- Public pages, in-app signup screens, registration forms, and onboarding flows
- Organization-scoped users, groups, roles, permissions, and entitlements
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

Those belong to the Learning Platform, Coaching Platform, Bridge Platform, and app-specific workstreams.

The Nexus Platform provides the container, identity, ownership, permissions, app shell, registration, onboarding, and administrative control structure in which those downstream systems operate.

---

## 2. Brief Architecture Summary

The Nexus Platform is a production-oriented multi-tenant platform, not a demo playground.

It supports:

- MindBrainAI Nexus-level administration
- Nexus-level teams, advisors, and working groups
- Member organizations such as LAIC or future partner organizations
- Programs under organizations
- Program-affiliated organizations such as clubs, coach organizations, school partners, and ACBL-like bridge organizations
- Public and private program offerings
- App shells created under programs
- App configuration for signup, onboarding, labels, theme, roles, and launch behavior
- User and member onboarding
- Phone-based and email-based identity options
- Role-based and scope-based access control
- Registration and application workflows
- Direct admin-created enrollments and invitations
- Groups, coach groups, cohorts, clubs, chapters, and regional structures
- Entitlements to platform modules such as Learning, Coaching, Bridge, Analytics, and Payments
- Future expansion to additional labs, schools, universities, teachers, clubs, professional groups, and partner institutions

The simple mental model is:

```text
MindBrainAI Nexus
  -> Nexus-level teams / advisors / administrators
  -> Member Organizations
    -> Organization-level members / administrators / teams
    -> Programs
      -> Program-level team / advisors / reviewers / fellows / volunteers / coaches
      -> Program-affiliated organizations and groups
      -> Program Offerings
        -> App Shell or Program Runtime Shell
        -> Registration / onboarding configuration
        -> Participants / learners / coaches / reviewers / organizers
        -> Groups / cohorts / chapters / classes / clubs
        -> Artifacts and downstream platform links
```

The important correction is that the model is not only:

```text
Nexus -> Organization -> Program -> Offering -> Participants
```

That simplified chain is useful, but not complete. In real programs, actors may attach at several levels:

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

The first release should create the platform foundation needed for several real apps.

### 3.1 Brain Bee Course App

The Brain Bee app is expected to begin as a relatively simple course app.

At the Nexus level, this requires:

- Brain Bee Program under LAIC or another owning organization
- Brain Bee course app shell
- Course offering or app offering
- Student signup and onboarding
- Instructor or course developer roles
- Course editor access routed to the Learning Platform
- Student access routed to the Learning Platform
- Basic admin dashboard for registration and enrollment
- Mobile-friendly app experience
- Desktop admin interface for program/course management

Nexus does not own the Brain Bee course lessons. Nexus owns the registration, access, shell, roles, and launch context.

### 3.2 MindAI Bee App

The MindAI Bee app is more complex because it combines:

- A course
- A challenge
- Student registration
- Organizer roles
- Reviewer roles
- Chapter or regional structures
- Possible future state, national, and international levels

At the Nexus level, this requires:

- MindAI Bee Program
- MindAI Bee app shell
- Challenge structure configuration
- Course linkage
- Registration at the correct scope, such as chapter, region, state, national, or international
- Student, organizer, reviewer, advisor, volunteer, and program admin roles
- Program-level and offering-level dashboards
- Public or in-app signup screens
- Participant records
- Downstream Learning Platform launch links

Nexus does not own the MindAI study content or assessments. Nexus owns the structure around the program and challenge.

### 3.3 Bridge App Shell

The Bridge platform is large. The immediate concrete product is the Bridge AI Coach app.

At the Nexus level, this requires:

- Bridge Program
- Bridge AI Coach app shell
- Coach onboarding
- Learner onboarding
- Independent coach support
- Coach organization support
- Club support
- Group and class support
- App signup and onboarding configuration
- Role labels and participant labels
- Organization-scoped privacy
- Launch context for the Bridge Platform

Nexus does not own bridge gameplay, AI bridge players, bidding systems, or bridge coaching intelligence. Nexus owns the administrative and app-shell container in which those systems are reached.

### 3.4 App Shell as an Offering

A program offering may be created as an app.

Examples:

- Brain Bee Course App
- MindAI Bee App
- Bridge AI Coach App

An app offering must support configuration from the Nexus admin interface, including:

- App name
- App slug
- App theme
- Logo and icon
- Public or private access
- Who can sign up
- What registrants are called
- Email and/or phone registration
- Onboarding questions
- Approval rules
- Participant roles
- Launch URL or downstream module route
- Enabled modules
- Initial app navigation placeholders

The actual feature depth inside each app belongs to the relevant downstream workstream. The Nexus Platform creates the shell, identity, routing, permissions, and configuration.

---

## 4. Workstreams and Boundaries

| Workstream | Owns | Does Not Own |
|---|---|---|
| Nexus Platform | Organizations, programs, program-affiliated organizations, app shells, roles, permissions, public registration, in-app onboarding configuration, member management, group visibility, entitlements, admin surfaces | Course content internals, coaching logic, bridge gameplay |
| Learning Platform | Courses, lessons, tutorials, drills, assessments, content packages, learning paths, learner-facing course experience | Global organization model, Nexus-level membership, Bridge table |
| Coaching Platform | Generalizable coaching framework, learner model, coach runtime, recommendations, feedback policy | Nexus organization model, organization onboarding, bridge-specific rules |
| Bridge Platform | Bridge app UI, bridge table, bridge engine integration, bridge players, bridge tutorials, bridge coaching behavior, bridge configuration | Nexus membership infrastructure, generic organization/program/app administration |
| App Workstreams | Product-specific user experience for Brain Bee, MindAI Bee, Bridge, or future apps | Global tenancy and permission model |

The Nexus workstream should build the foundation that allows app shells and downstream systems to be created, owned, administered, accessed, and launched.

---

## 5. Organization Autonomy and Tenant Isolation

Nexus may onboard an organization, but that organization may own and manage its own internal ecosystem.

For example, a partner bridge organization may want to:

- Own its own coach list
- Own its own learner list
- Create its own classes or groups
- Invite its own administrators
- Manage its own coach groups
- Keep its learner data private from other organizations
- Decide which parts of the Nexus/Learning/Coaching/Bridge platform it uses

### Core Principle

```text
Nexus onboards organizations.
Organizations own their internal people, programs, groups, and app/offering participation unless explicitly shared.
```

### Default Data Isolation Rule

Users, coaches, learners, reviewers, volunteers, groups, registrations, and participants are scoped to an organization, program, offering, or group.

No organization should see another organization's internal users, learners, coaches, registrations, participants, or dashboards unless an explicit sharing relationship exists.

### Practical Models Supported

1. Nexus-managed model

   LAIC directly manages programs, coaches, learners, reviewers, and participants.

2. Organization-managed model

   A partner organization joins Nexus and manages its own people and groups inside its own tenant boundary.

3. Program-partner model

   An organization participates inside a program without becoming a full Nexus tenant. Example: a bridge club joins the Bridge Program as a program-affiliated organization.

4. Independent actor model

   An independent coach, reviewer, fellow, or advisor participates directly in a program or app offering.

5. Multi-affiliation model

   The same coach may be independent in one context and affiliated with one or more organizations in another context.

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
| Program | A major activity under an owning organization, such as Brain Bee, MindAI Bee, Bridge |
| Program Affiliation | Relationship between a program and a user, organization, group, or team |
| Program Offering | A concrete thing people can join, access, or use, such as a course, app, challenge, class, cohort, event, pilot, or assessment |
| App Shell | Configurable app container created under a program offering |
| Group | A cohort, class, club, chapter, region, coach group, reviewer group, volunteer team, or learner group |
| Registration | A submitted signup, application, or internally created enrollment record |
| Participant | A user admitted or added into a program offering or group |
| Role Assignment | A user’s role in a specific scope, such as global, organization, program, offering, or group |
| Entitlement | Permission for an organization, program, offering, group, or user to use a platform module |
| Artifact | A concrete uploaded, generated, reviewed, or published object associated with a program or offering |
| AuditEvent | Record of important administrative activity |

### Flexible Mental Model

```text
Nexus
  Organization
    Program
      Program Offering
        App Shell
        Registration / Onboarding
        Participants
        Groups
        Artifacts

Plus cross-cutting relationships:

User -> RoleAssignment -> Scope
Organization -> OrganizationRelationship -> Organization
Program -> ProgramAffiliation -> Organization/User/Group
Coach -> Affiliation -> Program/Organization/Group/Offering
Learner -> Participant -> Offering/Group
```

This avoids forcing everything into one rigid tree.

---

## 7. Terminology: Program Offering, App Shell, Artifact

Use these terms consistently.

### Program Offering

A Program Offering is the generic joinable/access object.

Definition:

> A Program Offering is a concrete course, challenge, app, class, cohort, event, pilot, assessment, or service created under a Program that people can register for, join, access, or manage.

Examples:

- Brain Bee AI-Enabled Course 2026
- MindAI Bee Bay Area Challenge 2026
- Bridge AI Coach App
- Beginner Bridge Class with Coach X
- ACBL Partner Bridge Learning Pilot
- MindAI Bee Regional Round

### App Shell

An App Shell is a configured app container for an offering.

Examples:

- Brain Bee Course App shell
- MindAI Bee App shell
- Bridge AI Coach App shell

The app shell controls:

- Name and branding
- Signup screen
- Role labels
- Onboarding questions
- Launch routes
- Enabled modules
- Mobile/web behavior
- Downstream platform context

### Artifact

An Artifact is something produced, uploaded, generated, reviewed, or published inside a program, offering, or app.

Examples:

- PDF
- Study guide
- Lesson document
- Quiz
- Rubric
- Certificate
- PBN file
- Bridge drill set
- Course syllabus
- Generated report
- Configuration profile
- Coach-created tutorial

Do not use Artifact as the replacement for Program Offering. A course app is a Program Offering. The course syllabus or quiz inside it is an Artifact.

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
| shortName | string nullable | Example: LAIC, ACBL-like |
| organizationType | enum | nexus, initiative, school, university, lab, club, nonprofit, company, individual_practice, coach_org, partner, chapter, region |
| tenantMode | enum | full_tenant, program_affiliate, profile_only |
| parentOrganizationId | uuid nullable | Optional hierarchy |
| status | enum | draft, pending_review, active, suspended, archived |
| missionSummary | text nullable | Public or internal |
| websiteUrl | string nullable | Optional |
| logoUrl | string nullable | Optional |
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

- Edit organization profile
- Invite members
- Assign organization roles
- Create programs if allowed
- Manage program admins
- View registrations for their organization
- Enable or request platform modules
- Manage internal groups if entitled
- View organization audit log

---

## 9. Organization Relationships and Program-Affiliated Organizations

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

## 10. Program Model

A Program is a major organized activity under an owning organization.

Examples under LAIC:

- Brain Bee Program
- MindAI Bee Program
- Bridge Program

Examples under future organizations:

- AI Literacy Program
- School Debate Coach Program
- Dance Learning Program
- Research Fellows Program

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
| publicPageEnabled | boolean | Public profile |
| defaultVisibility | enum | private, organization, public |
| ownerUserId | uuid | Primary program owner |
| metadataJson | jsonb | Program-specific data |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### Program Team and Program Actors

Program-level actors may include:

- Program Owner
- Program Admin
- Fellow
- Advisor
- Reviewer
- Volunteer
- Instructor
- Coach
- Tester
- Content Contributor
- Student Coordinator
- Partner Organization Contact

These roles may exist before a specific offering exists. For example, the Bridge Program may recruit coaches and partner organizations before creating a specific class or pilot.

---

## 11. Program Affiliation Model

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

### Coach Affiliation Examples

```text
Coach A -> Bridge Program -> independent_coach
Coach A -> Bridge Program -> org_affiliated_coach -> Organization X
Coach A -> Bridge App Offering -> coach
Coach A -> Coach Group 1 -> group_admin / coach
```

The same coach may have multiple affiliations.

---

## 12. Program Offering Model

A Program Offering is the concrete thing that people sign up for or use.

Examples:

- Brain Bee AI-Enabled Course 2026
- MindAI Bee Bay Area Challenge 2026
- Bridge AI Coach App
- Beginner Bridge Course with Coach X
- MindAI Bee Regional Round
- ACBL Partner Bridge Learning Pilot

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
| registrationOpen | boolean | Whether signup is open |
| requiresApproval | boolean | Whether admin approval is needed |
| platformModule | enum | nexus_only, learning, coaching, bridge, mixed |
| appShellId | uuid nullable | Links to app shell when offering is an app or has app UX |
| externalRuntimeUrl | string nullable | Where to launch downstream app |
| participantLabelSingular | string nullable | Example: learner, student, player |
| participantLabelPlural | string nullable | Example: learners, students, players |
| metadataJson | jsonb | Offering-specific fields |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

---

## 13. App Shell and App Configuration Model

An App Shell is one of the most important Nexus-level implementation objects.

The app shell is not the full app logic. It is the configurable container around the app.

### App Shell Responsibilities

The app shell defines:

- App identity
- App name and slug
- App icon/logo
- Theme
- Basic app navigation placeholders
- Signup and sign-in modes
- Onboarding questions
- User role labels
- Participant labels
- Whether the app is public, invite-only, private beta, or organization-only
- Whether registration is through public web page, in-app flow, admin add, bulk upload, or invitation
- Which downstream module to launch
- What context is passed to downstream modules

### AppShell Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid | Parent program |
| offeringId | uuid nullable | Related offering |
| appName | string | User-facing app name |
| appSlug | string | URL/app route slug |
| appType | enum | course_app, challenge_app, coaching_app, bridge_app, mixed_app |
| status | enum | draft, private_beta, active, paused, archived |
| themeJson | jsonb | Colors, logo, icon, typography tokens |
| navigationJson | jsonb | App sections and downstream links |
| authConfigJson | jsonb | Email/phone/social/invite modes |
| onboardingConfigJson | jsonb | Questions, screens, labels, form fields |
| roleLabelConfigJson | jsonb | What users are called in this app |
| launchConfigJson | jsonb | Downstream module URLs and context mapping |
| featureFlagsJson | jsonb | App-level feature toggles |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### Example App Configuration

```json
{
  "appName": "Bridge AI Coach",
  "appType": "bridge_app",
  "auth": {
    "allowedIdentifiers": ["email", "phone"],
    "allowPublicSignup": true,
    "allowAdminAdd": true,
    "allowCoachAddLearners": true,
    "requiresApproval": false
  },
  "labels": {
    "participantSingular": "learner",
    "participantPlural": "learners",
    "coachLabel": "coach",
    "groupLabel": "class or club"
  },
  "onboarding": {
    "questions": [
      { "key": "bridge_level", "label": "Bridge level", "type": "select" },
      { "key": "has_coach", "label": "Do you have a coach?", "type": "boolean" }
    ]
  },
  "launch": {
    "module": "bridge",
    "route": "/bridge",
    "context": ["userId", "organizationId", "programId", "offeringId", "groupId", "coachId"]
  }
}
```

The same app shell structure can support Brain Bee, MindAI Bee, Bridge, and future apps.

---

## 14. User, Identity, and Membership Model

The platform must distinguish between:

- Identity
- User account
- Organization membership
- Program affiliation
- Offering participation
- Group membership
- Role assignment

### User Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| primaryEmail | string nullable | Unique if present |
| primaryPhone | string nullable | Unique if present, E.164 format |
| displayName | string | User-visible name |
| firstName | string nullable | Optional |
| lastName | string nullable | Optional |
| avatarUrl | string nullable | Optional |
| accountStatus | enum | active, pending, disabled |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### Identity Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| userId | uuid | User |
| provider | enum | email, phone, google, apple, microsoft, auth_provider |
| identifier | string | Email, phone, or provider identifier |
| verified | boolean | Whether verified |
| createdAt | timestamp | Created date |

### Membership Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| userId | uuid | User |
| organizationId | uuid | Organization |
| membershipType | enum | admin, member, advisor, fellow, volunteer, partner, coach, learner, reviewer |
| status | enum | invited, active, suspended, removed |
| invitedByUserId | uuid nullable | Who invited |
| joinedAt | timestamp nullable | Activation date |
| createdAt | timestamp | Created date |

A user may exist without being a member of the top-level Nexus organization. For example, a learner added by a coach under a bridge organization may only have app-level or group-level participation.

---

## 15. Role and Permission Model

Use scoped role-based access control.

### Role Scopes

| Scope | Meaning |
|---|---|
| global | Applies across Nexus |
| organization | Applies within one organization |
| program | Applies within one program |
| offering | Applies within one program offering |
| group | Applies within a subgroup, such as a coach group or class |
| app_shell | Applies to app configuration |

All non-global roles must be evaluated inside an organization/program/offering/group boundary.

A coach role in one bridge organization does not imply access to another organization’s learners.

### Initial Roles

| Role | Scope | Capabilities |
|---|---|---|
| nexus_super_admin | global | Full access |
| nexus_admin | global | Manage organizations and platform settings |
| nexus_advisor | global | View selected Nexus-level dashboards and advise |
| nexus_team_member | global | Internal Nexus workstream/team role |
| organization_owner | organization | Full control of organization |
| organization_admin | organization | Manage organization profile, programs, members |
| program_owner | program | Full control of program |
| program_admin | program | Manage program team, affiliations, offerings, app shells |
| program_advisor | program | View selected dashboards, comment, advise |
| program_reviewer | program/offering | Review applications, content, or challenge items |
| fellow | program/offering | Contributor role |
| volunteer | program/offering | Limited operational access |
| coach | program/offering/group | Manage assigned learners or classes |
| instructor | offering/group | Manage assigned course/class learners |
| offering_owner | offering | Manage offering |
| offering_admin | offering | Manage registrations and participants |
| app_admin | app_shell | Configure app shell and onboarding |
| learner | offering/group | Access assigned offering |
| participant | offering | General participant access |

### Permission Examples

Permissions should be stored as strings.

Examples:

- organization.create
- organization.update
- organization.invite_member
- organization.view_members
- program.create
- program.update
- program.manage_team
- program.manage_affiliations
- offering.create
- offering.publish
- app_shell.create
- app_shell.update
- registration.submit
- registration.view
- registration.approve
- participant.add
- participant.manage
- group.create
- group.manage_members
- entitlement.manage
- audit.view

Do not hardcode permissions only in the UI. Permission checks must happen server-side.

---

## 16. Group Model

Groups are needed across programs, especially for Bridge and MindAI Bee.

Examples:

- A bridge coach’s learner group
- A bridge club
- A pilot class
- A reviewer group
- A volunteer team
- A student cohort
- A MindAI Bee chapter
- A MindAI Bee region

### Group Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid nullable | Optional |
| offeringId | uuid nullable | Optional |
| appShellId | uuid nullable | Optional |
| name | string | Group name |
| groupType | enum | cohort, coach_group, club, reviewer_group, volunteer_team, class, chapter, region, learner_group |
| visibility | enum | private, organization, program, public |
| parentGroupId | uuid nullable | Supports hierarchy |
| ownerUserId | uuid nullable | Optional group owner |
| ownerOrganizationId | uuid nullable | Optional org owner |
| metadataJson | jsonb | Optional group-specific data |
| createdAt | timestamp | Created date |

### Bridge Example

```text
Bridge Program
  -> Program-affiliated organization: ACBL-like Organization
    -> Club groups
    -> Coach groups
    -> Classes
    -> Learners visible only to assigned coaches/groups unless shared

Bridge Program
  -> Independent Coach A
    -> Coach Group A1
    -> Learners assigned to Coach A
```

This supports partner adoption without exposing learners across unrelated coaches or organizations.

---

## 17. Registration, Invitation, and Onboarding Model

Registration can happen in multiple ways. The platform must not assume every person enters through a public web registration page.

### Supported Entry Paths

1. Public web page signup

   A visitor opens a public page and submits a registration form.

2. In-app signup

   A user opens an app signup screen inside Brain Bee, MindAI Bee, Bridge, or another app.

3. Admin-created participant

   An admin adds a user directly from the admin interface.

4. Coach-created learner

   A coach adds known learners to a bridge class or coach group.

5. Organization-created users

   A partner organization adds its own coaches, learners, or internal members.

6. Invitation link

   An admin, coach, or organization sends a signup link.

7. Bulk import

   A list of participants is uploaded or pasted by an authorized admin.

8. Approval-based application

   A person submits an application and waits for approval.

9. Direct enrollment without approval

   A known person is added and receives a link to access the platform.

### Registration Flow Variants

#### Public application flow

```text
Visitor opens public page or app signup screen
  -> Visitor submits form
  -> Registration stored as submitted or pending_review
  -> Admin reviews if approval is required
  -> Participant record created
  -> User receives invite/sign-in link
  -> User gets access
```

#### Direct admin add flow

```text
Admin opens offering/group participant screen
  -> Admin adds name + email or phone
  -> System creates or links user
  -> Participant record created immediately
  -> Notification/invite link sent if configured
  -> User signs in and accesses app/offering
```

#### Coach learner add flow

```text
Coach opens coach group
  -> Coach adds learner by name + email or phone
  -> Learner is assigned to that coach group
  -> Link or notification is sent if configured
  -> Learner signs in and sees assigned app/class
```

### Registration Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Owning organization |
| programId | uuid nullable | Optional program |
| offeringId | uuid nullable | Optional offering |
| groupId | uuid nullable | Optional group |
| appShellId | uuid nullable | Optional app shell |
| registrationSource | enum | public_page, in_app, admin_add, coach_add, organization_add, invite_link, bulk_import |
| email | string nullable | Registrant email |
| phone | string nullable | Registrant phone |
| name | string | Registrant name |
| userId | uuid nullable | Linked user after account creation |
| status | enum | submitted, pending_review, approved, rejected, waitlisted, withdrawn, directly_added, invited |
| requiresApproval | boolean | Whether approval is needed |
| formDataJson | jsonb | Flexible answers |
| reviewedByUserId | uuid nullable | Reviewer |
| reviewedAt | timestamp nullable | Review date |
| createdByUserId | uuid nullable | Admin/coach who added |
| createdAt | timestamp | Submission date |

### Participant Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organizationId | uuid | Organization boundary |
| programId | uuid nullable | Optional program |
| offeringId | uuid nullable | Optional offering |
| groupId | uuid nullable | Group assignment |
| userId | uuid | User |
| participantType | enum | learner, student, player, coach, reviewer, advisor, volunteer, organizer, instructor |
| status | enum | active, inactive, completed, removed |
| addedByUserId | uuid nullable | Admin/coach who added |
| registrationId | uuid nullable | Source registration if any |
| metadataJson | jsonb | Optional participant-specific data |
| createdAt | timestamp | Created date |

### Phone-Based Registration

Registration and sign-in should support phone number as a first-class identifier where configured.

App or organization configuration should define:

- email only
- phone only
- email or phone
- email required plus phone optional
- phone required plus email optional

Phone numbers should be normalized to E.164 format.

---

## 18. Public Pages and In-App Signup Screens

The platform should distinguish between public web pages and in-app signup screens.

### Public Web Page

A public web page is a marketing or information page that may include registration.

Examples:

- Brain Bee course landing page
- MindAI Bee regional challenge information page
- Bridge AI Coach public app page
- Partner organization profile page

Typical fields:

- Hero title
- Summary
- Details
- Dates
- Eligibility
- Call to action
- Registration form link

### In-App Signup Screen

An in-app signup screen is part of a mobile/web app shell.

It may not need a full hero page. It may only need:

- App name
- Short explanation
- Role selection if allowed
- Email/phone sign-in
- Onboarding questions
- Consent or acknowledgement
- Join/invite code
- Coach/group/class selection if allowed

### PublicPage Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subjectType | enum | organization, program, offering, group, app_shell |
| subjectId | uuid | Owner object |
| slug | string | URL slug |
| title | string | Page title |
| summary | text | Short summary |
| bodyJson | jsonb | Structured content blocks |
| status | enum | draft, published, archived |
| seoJson | jsonb | Optional |
| createdAt | timestamp | Created date |
| updatedAt | timestamp | Updated date |

### SignupScreenConfig Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| appShellId | uuid | App shell |
| title | string | Screen title |
| subtitle | string nullable | Short explanation |
| allowedIdentifiersJson | jsonb | email/phone/social |
| onboardingQuestionsJson | jsonb | Questions |
| roleSelectionJson | jsonb | Allowed self-selected roles if any |
| inviteCodeRequired | boolean | Whether an invite code is required |
| approvalRequired | boolean | Whether signup needs approval |
| createdAt | timestamp | Created date |

Do not build a full website builder in the first release. Use structured blocks and templates.

---

## 19. MindAI Bee Challenge Structure Model

MindAI Bee requires the ability to represent challenge structures without overbuilding.

MindAI Bee may begin only at a regional level and later expand to state, national, or international levels.

### Challenge Structure Fields

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| programId | uuid | MindAI Bee Program |
| offeringId | uuid | Challenge offering |
| appShellId | uuid nullable | App shell if challenge is app-based |
| structureType | enum | single_level, chapter_region, regional_state, regional_national, international, custom |
| levelsJson | jsonb | Flexible level definitions |
| registrationRulesJson | jsonb | Eligibility, age, school, region |
| advancementRulesJson | jsonb | Placeholder rules |
| requiredCourseOfferingId | uuid nullable | Linked course offering |
| createdAt | timestamp | Created date |

### Example Levels JSON

```json
[
  {
    "level": "chapter",
    "label": "Chapter Round",
    "enabled": true
  },
  {
    "level": "regional",
    "label": "Regional Round",
    "enabled": true
  },
  {
    "level": "state",
    "label": "California Round",
    "enabled": false
  },
  {
    "level": "national",
    "label": "National Round",
    "enabled": false
  },
  {
    "level": "international",
    "label": "International Round",
    "enabled": false
  }
]
```

Do not implement full competition management in the first release. Store enough structure so the program can evolve.

---

## 20. Bridge Program Structure Model

The Bridge Program must support a more complex actor network than a simple course.

### Actor Types

Bridge may include:

- Independent coaches
- Coaches under organizations
- Coaches who are both independent and organization-affiliated
- Bridge organizations
- Bridge clubs
- Fellows
- Reviewers
- Volunteer players
- Learners
- Learner groups
- Classes
- Partner organizations
- ACBL-like organizations

### Bridge Program-Level Structures

At the program level, Nexus should support:

- Coach onboarding
- Coach organization onboarding
- Club onboarding
- Program-level coach directory if enabled
- Program-level reviewer/fellow/volunteer lists
- Program-affiliated organizations
- App offerings such as Bridge AI Coach App
- Class or cohort offerings
- Coach groups and learner groups

### Bridge App-Level Structures

At the app shell/offering level, Nexus should support:

- App signup configuration
- Learner onboarding questions
- Coach onboarding questions
- Coach-owned learner groups
- Organization-owned coach groups
- Club-owned groups
- Visibility rules
- Launch context passed to Bridge Platform

### Bridge Launch Context

When a user launches the Bridge app, Nexus should pass or make available:

```json
{
  "userId": "...",
  "organizationId": "...",
  "programId": "...",
  "offeringId": "...",
  "appShellId": "...",
  "groupId": "...",
  "coachId": "...",
  "role": "learner",
  "affiliations": ["independent_coach", "club_member"],
  "entitlements": ["bridge", "coaching", "learning"]
}
```

The Bridge Platform then owns gameplay and coaching behavior.

---

## 21. Brain Bee Course App Structure

The Brain Bee course app is expected to be simpler than Bridge.

At the Nexus level, it needs:

- Brain Bee Program
- Brain Bee Course App Shell
- Course offering
- Student registration
- Instructor/course developer role
- Course editor/admin role
- Learning Platform entitlement
- Public page or in-app signup screen
- Student participant list
- Launch into Learning Platform

### Brain Bee App Configuration Examples

- Participant label: student
- Instructor label: instructor
- Signup: email or phone, configurable
- Approval: optional
- Onboarding: grade, school, region, prior Brain Bee participation
- Downstream module: Learning Platform

---

## 22. Admin Interface

The Nexus Platform must include a desktop-friendly admin dashboard. Mobile-friendly admin can come later, but the public/app signup flows must be mobile-friendly from the beginning.

### Global Nexus Admin

Screens:

- Global dashboard
- Nexus teams/advisors
- Organizations list
- Create organization
- Organization detail
- Users list
- Platform modules
- Entitlements
- Audit log

### Organization Admin

Screens:

- Organization dashboard
- Organization profile
- Members
- Invite/add member
- Programs list
- Create program
- Entitlements
- Public organization page
- Organization groups if enabled

### Program Admin

Screens:

- Program dashboard
- Program profile
- Program team
- Program affiliations
- Partner organizations
- Coach/fellow/reviewer/advisor lists
- Program offerings list
- Create program offering
- App shells list
- Public program page
- Program registrations

### Program Offering Admin

Screens:

- Offering dashboard
- Offering settings
- Public page editor
- Signup screen configuration
- Registration/onboarding form editor
- Registrations list
- Participant list
- Groups
- Launch downstream module

### App Shell Admin

Screens:

- App identity
- App theme
- Signup and sign-in configuration
- Onboarding questions
- Role/participant labels
- App navigation placeholders
- Downstream module launch settings
- Feature flags

### Initial UI Priority

Build these first:

1. Sign in
2. Global admin dashboard
3. Organization list/create/detail
4. Program list/create/detail
5. Program team and affiliations
6. Program offering list/create/detail
7. App shell create/configure
8. Public page or in-app signup configuration
9. Registration and direct-add flows
10. Participant list
11. Groups and group membership
12. Entitlements and launch links

---

## 23. Recommended Implementation Stack

The recommended stack is TypeScript-first and production-capable.

The first implementation should not be a Vercel-only demo. It can still use Vercel for frontend speed if desired, but the architecture should assume a real production database, backups, environment separation, access control, and deployability to a major cloud provider.

### Recommended Language and Application Stack

| Layer | Recommendation | Reason |
|---|---|---|
| Language | TypeScript | One language across frontend, backend, shared types, validations, and API clients |
| Web/Admin Framework | Next.js App Router | Fast web/admin development, file-based routing, server components, route handlers, server actions |
| UI | React + Tailwind CSS | Fast implementation and maintainable admin UI |
| Component Library | shadcn/ui | Practical admin components, forms, tables, dialogs |
| Validation | Zod | Shared schema validation between frontend and backend |
| Forms | React Hook Form + Zod | Good admin and onboarding form implementation |
| Data Tables | TanStack Table | Admin lists, filters, sortable tables |
| Database | PostgreSQL | Strong relational fit for tenancy, users, roles, programs, groups, registrations |
| ORM | Prisma or Drizzle | Type-safe database access and migrations |
| Auth | Supabase Auth, Clerk, Auth.js, Firebase Auth, or Cognito depending on cloud choice | Avoid building auth from scratch |
| File Storage | S3-compatible storage, Google Cloud Storage, Azure Blob, or Supabase Storage | Logos, documents, uploads, artifacts |
| Email | Resend, AWS SES, SendGrid, or equivalent | Invitations and registration emails |
| SMS/Phone | Supabase phone auth, Firebase phone auth, Twilio, or equivalent | Phone-based registration and login |
| Background Jobs | Inngest, Trigger.dev, Cloud Tasks, BullMQ, or provider queue | Invitations, imports, notifications, future automations |
| Observability | Sentry + provider logs | Error reporting and production support |

### Recommended Deployment Options

#### Option A: Fastest production-capable start

```text
Next.js + TypeScript + Supabase Auth + Supabase Postgres + Supabase Storage + Vercel or Cloud Run
```

Use this if the priority is the fastest real product implementation with integrated auth, Postgres, phone/email identity options, storage, and a manageable admin dashboard.

#### Option B: Google Cloud production baseline

```text
Next.js or Node API container
+ Cloud Run
+ Cloud SQL for PostgreSQL
+ Cloud Storage
+ Secret Manager
+ Cloud Build / GitHub Actions
+ Firebase Auth or Supabase/Auth0/Clerk for identity
```

Use this if the team wants a more conventional cloud deployment on Google Cloud while keeping infrastructure manageable.

#### Option C: AWS production baseline

```text
Next.js or Node API container
+ ECS Fargate / App Runner / Lambda where appropriate
+ RDS PostgreSQL or Aurora PostgreSQL
+ S3
+ Secrets Manager
+ SES
+ Cognito, Clerk, Auth0, or Supabase Auth
```

Use this if AWS is preferred for long-term infrastructure.

#### Option D: Azure production baseline

```text
Next.js or Node API container
+ Azure App Service / Container Apps
+ Azure Database for PostgreSQL Flexible Server
+ Azure Blob Storage
+ Key Vault
+ Azure Communication Services or external email/SMS provider
+ Microsoft Entra External ID / Auth0 / Clerk / Supabase Auth
```

Use this if Microsoft/Azure integration becomes important.

### Practical Recommendation

For the immediate build:

```text
Next.js + TypeScript + Tailwind + shadcn/ui + PostgreSQL + Prisma/Drizzle + Supabase Auth
```

Use Supabase for Postgres and Auth if speed and phone/email login matter. Keep the codebase cloud-portable by avoiding Supabase-specific business logic outside auth/storage adapters.

For more formal production deployment later:

```text
Dockerized Next.js/Node app
+ managed PostgreSQL
+ object storage
+ managed secrets
+ CI/CD
+ monitoring
```

This allows migration from Vercel/Supabase to GCP, AWS, or Azure if needed.

### Database Recommendation

Use PostgreSQL from the beginning.

The platform is fundamentally relational:

- users
- identities
- organizations
- organization relationships
- programs
- program affiliations
- program offerings
- app shells
- memberships
- role assignments
- groups
- registrations
- participants
- entitlements
- audit events

Do not start with only JSON files, Airtable, or a spreadsheet. Use relational tables plus JSONB for program-specific configuration.

---

## 24. Mobile App Strategy

The immediate apps should be designed as responsive web apps first, with mobile app wrapping when needed.

### Recommended Near-Term Strategy

```text
Responsive web app
+ installable PWA where useful
+ optional native wrapper later
```

This fits the stated direction that mobile apps may initially be web apps wrapped with a native container.

### Native Wrapper Options

| Option | Fit |
|---|---|
| Capacitor | Good if the app is primarily web-first and later needs native app store packaging |
| Expo / React Native | Good if the app needs deeper native interaction or a more native app architecture |
| PWA only | Good for fastest launch and school/community use without app store friction |

### Recommendation

For Brain Bee and MindAI Bee, start with responsive web/PWA. Add native wrapper only if distribution through app stores becomes necessary.

For Bridge, the product may eventually require a richer app experience. Still start with web-first responsive architecture unless bridge gameplay requirements force a native approach.

---

## 25. Folder Structure

Recommended monorepo structure:

```text
apps/
  nexus-web/
    app/
      (public)/
        org/[orgSlug]/
        programs/[programSlug]/
        offerings/[offeringSlug]/
        register/[offeringSlug]/
        app/[appSlug]/signup/
      (auth)/
        sign-in/
        sign-up/
      (admin)/
        admin/
          organizations/
          programs/
          affiliations/
          offerings/
          app-shells/
          registrations/
          participants/
          groups/
          settings/
      api/
        webhooks/
        integrations/
    components/
      admin/
      public/
      app-shell/
      forms/
      layout/
      tables/
    lib/
      auth/
      db/
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
      app-shells/
      memberships/
      registrations/
      participants/
      groups/
      entitlements/
      audit/
    tests/

packages/
  shared-types/
  ui/
  database/
  permissions/
  config-schemas/
```

A single Next.js app can work for the first release, but a monorepo makes it easier to share types with future Brain Bee, MindAI Bee, and Bridge app surfaces.

---

## 26. Database Schema Draft

This is an implementation-oriented draft, not final production SQL.

### Core Tables

```text
users
user_identities
organizations
organization_relationships
organization_memberships
programs
program_affiliations
program_offerings
app_shells
groups
group_memberships
registrations
participants
roles
role_assignments
permissions
role_permissions
entitlements
public_pages
signup_screen_configs
invitations
audit_events
artifacts
```

### Recommended Simplification

Use a generic scoped role assignment table instead of separate role tables for every level.

### Role Assignment Table

| Field | Type |
|---|---|
| id | uuid |
| userId | uuid |
| scopeType | enum: global, organization, program, offering, group, app_shell |
| scopeId | uuid nullable |
| roleKey | string |
| status | enum: active, invited, suspended, removed |
| createdByUserId | uuid nullable |
| createdAt | timestamp |

### Generic Scoped Membership Option

For implementation speed, use generic scoped membership for relationships that are not complex yet.

```text
scoped_memberships
  id
  user_id
  scope_type
  scope_id
  membership_type
  status
  metadata_json
  created_at
```

Use more specific tables only where needed:

- program_affiliations
- participants
- registrations
- group_memberships

---

## 27. API and Service Layer

Do not put all business logic directly into page components.

Use service modules.

### Organization Service

Responsibilities:

- createOrganization
- updateOrganization
- archiveOrganization
- listOrganizationsForUser
- getOrganizationDashboard
- inviteOrganizationMember
- createOrganizationRelationship
- listOrganizationRelationships

### Program Service

Responsibilities:

- createProgram
- updateProgram
- listProgramsForOrganization
- assignProgramRole
- getProgramDashboard
- addProgramAffiliation
- listProgramAffiliations

### Program Offering Service

Responsibilities:

- createProgramOffering
- updateProgramOffering
- publishProgramOffering
- closeProgramOffering
- listOfferingsForProgram
- getOfferingDashboard
- generatePublicOfferingPage

### App Shell Service

Responsibilities:

- createAppShell
- updateAppShell
- updateTheme
- updateSignupConfig
- updateOnboardingConfig
- updateRoleLabels
- updateLaunchConfig
- getAppLaunchContext

### Registration Service

Responsibilities:

- submitRegistration
- createRegistrationFromAdminAdd
- createRegistrationFromCoachAdd
- reviewRegistration
- approveRegistration
- rejectRegistration
- createParticipantFromRegistration
- bulkImportRegistrations

### Participant Service

Responsibilities:

- addParticipant
- updateParticipant
- removeParticipant
- assignParticipantToGroup
- listParticipantsForOffering
- listParticipantsForGroup

### Permission Service

Responsibilities:

- hasPermission
- requirePermission
- listUserScopes
- assignRole
- revokeRole
- resolveEffectiveRoles

### Entitlement Service

Responsibilities:

- checkModuleAccess
- enableModule
- disableModule
- listEntitlements
- enforceUsageLimit

### Audit Service

Responsibilities:

- recordAuditEvent
- listAuditEvents
- attachActorAndScope

---

## 28. Logical API Endpoints

If using Next.js server actions, endpoints may be internal. Still define logical APIs.

### Organizations

```text
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:id
PATCH  /api/organizations/:id
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
PATCH  /api/offerings/:id
POST   /api/offerings/:id/publish
POST   /api/offerings/:id/close
```

### App Shells

```text
GET    /api/programs/:programId/app-shells
POST   /api/programs/:programId/app-shells
GET    /api/app-shells/:id
PATCH  /api/app-shells/:id
PATCH  /api/app-shells/:id/theme
PATCH  /api/app-shells/:id/signup
PATCH  /api/app-shells/:id/onboarding
GET    /api/app-shells/:id/launch-context
```

### Registrations

```text
POST   /api/public/offerings/:offeringSlug/register
POST   /api/app/:appSlug/signup
POST   /api/offerings/:id/registrations/admin-add
POST   /api/groups/:id/participants/coach-add
GET    /api/offerings/:id/registrations
POST   /api/registrations/:id/approve
POST   /api/registrations/:id/reject
```

### Participants

```text
GET    /api/offerings/:id/participants
POST   /api/offerings/:id/participants
PATCH  /api/participants/:id
POST   /api/participants/:id/assign-group
```

### Groups

```text
GET    /api/programs/:programId/groups
POST   /api/programs/:programId/groups
GET    /api/groups/:id
PATCH  /api/groups/:id
GET    /api/groups/:id/members
POST   /api/groups/:id/members
```

---

## 29. Integration Boundaries

The Nexus Platform should integrate with downstream platforms through clear boundaries.

### Learning Platform Integration

Nexus sends:

- organizationId
- programId
- offeringId
- appShellId
- userId
- participant role
- entitlement status
- groupId if applicable

Learning returns:

- courseId
- course launch URL
- enrollment status
- progress summary if needed later

### Coaching Platform Integration

Nexus sends:

- userId
- organization/program/offering context
- role
- coach/learner relationship
- group context
- app shell configuration if needed

Coaching returns:

- coach profile URL
- coaching session launch URL
- high-level status if needed later

### Bridge Platform Integration

Nexus sends:

- userId
- bridge offeringId
- appShellId
- organizationId
- groupId
- coachId if assigned
- learner/coach role
- bridge entitlement
- app configuration flags

Bridge returns:

- bridge app launch URL
- bridge profile status
- coach group status

### Integration Principle

Nexus should not know the internals of downstream systems.

It should know:

- who the user is
- what organization/program/offering/app shell they belong to
- what role they have
- what group they belong to
- what modules they can access
- where to send them

---

## 30. Where AI/LLM Comes In

For the Nexus MVP, AI is not required.

The Nexus Platform is primarily structured CRUD, workflow, permissions, registration, onboarding, app configuration, and admin logic.

### Do Not Use LLM For

- Permission decisions
- Role enforcement
- Payment entitlement decisions
- Approvals
- User identity
- Security-sensitive actions
- Database writes without explicit user action
- Program or organization status changes
- Access to minors' data

### Possible Later AI Uses

AI may later assist with:

- Drafting public program descriptions
- Suggesting registration form questions
- Summarizing applications
- Suggesting reviewer assignments
- Generating launch checklist drafts
- Writing email announcements
- Summarizing organization activity
- Helping admins configure app shells
- Generating starter onboarding questions

These are admin-assistance features, not core platform logic.

### Recommendation

Build clean structured data first. Add AI assistant features only after core workflows work.

---

## 31. Security and Privacy Requirements

The Nexus Platform controls access to people, organizations, students, programs, and future minors. Security must be designed from the beginning.

### Required

- Authenticated admin routes
- Role-based access checks on every protected action
- Server-side permission checks
- No relying only on hidden UI buttons
- Audit log for admin changes
- Scoped access to registrations and participants
- Private groups for coach/learner relationships
- Minimal public exposure
- Secure invitation tokens
- Email and/or phone verification as configured
- Organization-scoped queries by default
- No cross-organization visibility unless explicitly configured
- Rate limiting on public signup and auth endpoints
- Data export/delete workflow later

### Student and Minor Considerations

Since Brain Bee, MindAI Bee, and internships may involve high school students:

- Store only necessary personal information
- Avoid exposing student lists publicly
- Support guardian-related fields later if needed
- Separate public profiles from private participant records
- Limit coach access to assigned learners/groups
- Audit admin/coach access to student lists

### Data Visibility Rule

Default to private.

Public pages should use explicitly published content only.

Admin data, registrations, participant lists, and group membership should never become public accidentally.

---

## 32. Audit Log

Every important admin action should create an audit event.

### Audit Event Examples

- organization.created
- organization.updated
- organization.relationship_created
- member.invited
- member.added
- role.assigned
- role.revoked
- program.created
- program.updated
- program_affiliation.created
- program_offering.created
- program_offering.published
- app_shell.created
- app_shell.updated
- signup_config.updated
- registration.submitted
- registration.admin_added
- registration.coach_added
- registration.approved
- registration.rejected
- participant.created
- participant.assigned_to_group
- entitlement.enabled
- entitlement.disabled

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

Do not structure the build plan as a fixed weekly schedule. The team is using AI-assisted development, so the work should be organized as a sequence of implementation slices.

### Slice 1: Project Foundation

Deliverables:

- Repository initialized
- Next.js/TypeScript app created
- Database connected
- Environment configuration
- Auth provider selected and integrated
- Base admin layout
- User table and identity mapping
- Seed Nexus super admin

### Slice 2: Organization Foundation

Deliverables:

- Organization schema
- Organization CRUD
- Organization relationship schema
- Organization dashboard
- Organization members
- Role assignment basics
- Permission checks
- Audit events

### Slice 3: Program Foundation

Deliverables:

- Program schema
- Program CRUD
- Program dashboard
- Program team roles
- Program affiliations
- Partner/club/coach-organization affiliation records
- Seed Brain Bee, MindAI Bee, Bridge programs

### Slice 4: Program Offering and App Shell

Deliverables:

- Program offering schema
- Offering CRUD
- App shell schema
- App shell create/edit
- App identity/theme configuration
- Participant labels
- Signup/onboarding configuration
- Launch configuration placeholder

### Slice 5: Registration and Onboarding

Deliverables:

- Public registration flow
- In-app signup flow
- Admin-add flow
- Coach-add learner flow
- Email/phone registration fields
- Approval workflow
- Participant creation
- Invitations/notifications if available

### Slice 6: Groups and Visibility

Deliverables:

- Group schema
- Group CRUD
- Group membership
- Coach group model
- Club/class/chapter/region groups
- Visibility rules
- Bridge coach/learner isolation test

### Slice 7: Entitlements and Downstream Launch

Deliverables:

- Entitlement model
- Platform module access checks
- Learning/Bridge/Coaching launch contracts
- Launch URL placeholders
- App shell context passed to downstream modules

### Slice 8: Seed Product Shells

Deliverables:

- Brain Bee Course App shell
- MindAI Bee App shell
- Bridge AI Coach App shell
- Sample signup/onboarding config for each
- Sample public page or in-app signup screen for each
- Sample participants and groups

### Slice 9: Hardening and Release Preparation

Deliverables:

- Permission test coverage
- Cross-organization isolation tests
- Audit log review
- Admin UI cleanup
- Error handling
- Production environment configuration
- Backup and restore check
- Basic monitoring

---

## 34. Implementation Priorities

Build in this order:

1. Authenticated admin shell
2. User and identity model
3. Organization model
4. Scoped role/permission enforcement
5. Program model
6. Program affiliation model
7. Program offering model
8. App shell model and configuration
9. Registration and direct-add flows
10. Participant model
11. Public page and in-app signup screen templates
12. Groups and group membership
13. Entitlements
14. Downstream launch links
15. Audit log
16. Product seed shells for Brain Bee, MindAI Bee, and Bridge

Do not begin with website polish. Begin with the admin and data model.

---

## 35. Acceptance Criteria

The Nexus release is successful when the team can perform these flows.

### Flow 1: Create LAIC

- Nexus admin signs in
- Creates LAIC organization
- Assigns organization admin
- Enables learning, coaching, and bridge modules

### Flow 2: Create Nexus-Level Team/Advisor Records

- Nexus admin adds an advisor or team member
- Role is scoped at Nexus/global level
- Advisor/team member does not automatically gain access to private organization data unless authorized

### Flow 3: Create Three Programs

- LAIC admin creates Brain Bee Program
- LAIC admin creates MindAI Bee Program
- LAIC admin creates Bridge Program
- Each program has its own dashboard and team

### Flow 4: Create Brain Bee Course App Shell

- Program admin creates Brain Bee course offering
- Creates Brain Bee app shell
- Configures student signup
- Adds instructor/course developer role
- Student registers or is directly added
- Student launches Learning Platform placeholder

### Flow 5: Create MindAI Bee Challenge App Shell

- Program admin creates MindAI Bee challenge offering
- Creates MindAI Bee app shell
- Defines regional/chapter challenge structure metadata
- Links required course offering
- Student registers at the correct scope
- Reviewer/organizer roles are visible in admin

### Flow 6: Create Bridge App Shell

- Program admin creates Bridge AI Coach app offering
- Creates Bridge app shell
- Adds independent coach
- Adds coach organization
- Creates coach group
- Adds learners through admin or coach-add flow
- Learner can launch downstream Bridge app placeholder

### Flow 7: Permissions Work

- A Brain Bee reviewer cannot access Bridge learner lists
- A bridge coach can see only assigned learners
- A coach organization can manage only its own coach groups if allowed
- Organization admin can see programs inside organization
- Nexus admin can see all organizations
- Program-level partner organization does not automatically become full Nexus tenant unless configured

---

## 36. Recommended Seed Data

The implementation should include seed data for realistic testing.

### Organizations

- MindBrainAI Nexus
- Life in AI Center
- Example ACBL-like Bridge Organization
- Example Bridge Club
- Example School

### Programs Under LAIC

- Brain Bee Program
- MindAI Bee Program
- Bridge Program

### Program Offerings

- Brain Bee AI-Enabled Course 2026
- MindAI Bee Bay Area Challenge 2026
- Bridge AI Coach App Pilot

### App Shells

- Brain Bee Course App Shell
- MindAI Bee App Shell
- Bridge AI Coach App Shell

### Roles

- Nexus Super Admin
- Nexus Advisor
- LAIC Organization Admin
- Brain Bee Program Admin
- MindAI Bee Program Admin
- Bridge Program Admin
- Bridge Independent Coach
- Bridge Organization Coach
- Learner
- Reviewer
- Advisor
- Fellow

### Groups

- Bridge Independent Coach Group
- Example Bridge Club Learner Group
- MindAI Bee Bay Area Region
- MindAI Bee Chapter 1
- Brain Bee Course Reviewers

---

## 37. Naming Recommendations

Use these names consistently.

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
| Configurable app container | App Shell |
| Course/challenge/app participant | Participant |
| Person account | User |
| Email/phone/provider login record | Identity |
| Relationship to org/program/offering/group | Membership / Affiliation / Role Assignment |
| Access to platform module | Entitlement |
| Public signup/application object | Registration |
| Uploaded/generated/published object | Artifact |

Avoid using app, program, course, and challenge interchangeably.

Use Program Offering as the generic container.

Use App Shell when the offering is surfaced as an app or app-like experience.

Use Artifact for content/assets produced or managed inside programs and offerings.

---

## 38. Key Design Decisions

### Decision 1: Nexus Is the System of Record for Organization and Access Structure

Nexus owns organizations, programs, program offerings, app shells, users, roles, groups, registrations, participants, and entitlements.

### Decision 2: Nexus Allows Multiple Levels of Actors

Actors can attach at Nexus level, organization level, program level, offering level, app shell level, or group level.

### Decision 3: Program-Affiliated Organizations Are First-Class

Bridge organizations, clubs, schools, and partners may participate inside a program without necessarily becoming full Nexus member organizations.

### Decision 4: Coaches Can Be Independent or Organization-Affiliated

The same coach may act independently in one context and through an organization in another context.

### Decision 5: App Shell Is a Nexus-Level Object

Nexus creates and configures app shells for Brain Bee, MindAI Bee, Bridge, and future apps. The downstream platforms implement app-specific internals.

### Decision 6: Learning and Coaching Are Downstream Modules

Nexus can create an app or offering that uses Learning or Coaching, but Nexus does not implement the learning/coaching behavior.

### Decision 7: Use Scoped Roles

The same user can have different roles in different scopes.

### Decision 8: Use Structured Data Before AI

Nexus should not depend on LLMs for core functionality.

### Decision 9: Default to Private

Public pages and shared views are explicitly published or configured. Admin data remains private.

### Decision 10: Use Production-Capable Infrastructure From the Start

The first release may be small, but it should use a real database, real auth, environment separation, audit logs, and a deployable architecture.

---

## 39. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Overbuilding into a full LMS | Keep course internals out of Nexus |
| Overbuilding into a full bridge platform | Keep bridge gameplay and coaching out of Nexus |
| Rigid hierarchy fails for Bridge | Use program affiliations, organizations, groups, and scoped roles |
| Confusing Nexus organizations with Bridge organizations | Use tenantMode and ProgramOrganizationAffiliation |
| Data leakage across organizations or coach groups | Implement scoped visibility and server-side permission checks early |
| Public page and app signup confusion | Separate PublicPage from SignupScreenConfig |
| Phone/email identity confusion | Use User plus UserIdentity table |
| AI distraction | Defer LLM features for Nexus MVP |
| Schema churn | Use core relational model plus metadataJson and configJson |
| Vercel-only demo architecture | Use managed Postgres and cloud-portable deployment from the start |

---

## 40. Final Architecture Formula

The Nexus Platform formula is:

```text
Organizations
+ Organization Relationships
+ Programs
+ Program Affiliations
+ Program Offerings
+ App Shells
+ Users and Identities
+ Scoped Roles
+ Registrations and Direct Adds
+ Participants
+ Groups
+ Entitlements
+ Audit Logs
= Administrative, identity, registration, app-shell, and access foundation for all Nexus/LAIC products
```

The Nexus Platform should make it possible to say:

```text
LAIC owns the Brain Bee Program.
Brain Bee Program creates a Brain Bee Course App Shell.
Students register or are added.
Instructors/course developers receive the right roles.
Approved students launch into the Learning Platform.
```

Or:

```text
LAIC owns the MindAI Bee Program.
MindAI Bee Program creates an app-based regional challenge.
The challenge has course linkage, chapters, regions, organizers, reviewers, and students.
Students register at the appropriate level and launch into the learning/challenge experience.
```

Or:

```text
LAIC owns the Bridge Program.
Bridge Program creates the Bridge AI Coach App Shell.
Independent coaches, coach organizations, clubs, groups, and learners are onboarded.
Learners launch into the Bridge Platform with correct organization, group, coach, and role context.
```

That is the role of the Nexus Platform.

It is the organizational, administrative, identity, membership, registration, app-shell, and access layer that allows the specialized learning, coaching, and bridge systems to exist cleanly underneath it.
