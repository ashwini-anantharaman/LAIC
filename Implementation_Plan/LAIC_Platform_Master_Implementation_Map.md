# LAIC Platform Master Implementation Map

Version: 1.0  
Status: Implementation handoff  
Audience: Development workstreams  
Scope: Nexus, Learning Platform, Bridge Platform, Coaching Platform, and App Shell delivery

---

## 1. Purpose

This document gives the implementation team a concrete map for building the LAIC platform without drifting into conceptual architecture.

It answers:

1. What does each workstream own?
2. Which objects belong to which platform?
3. Which screens belong to which platform?
4. Which APIs and services should be implemented first?
5. How do the Brain Bee, MindAI Bee, and Bridge Coach apps come together?
6. What should be built in what sequence so the three app shells can move forward quickly?

The immediate product goal is not a generic platform demo. The immediate product goal is to create production-directed foundations for three real apps:

```text
Brain Bee Course App
MindAI Bee App
Bridge Coach App
```

Each app should be able to use common platform capabilities while still appearing as a distinct app with its own name, theme, login/start screen, role labels, content, and app-store identity.

---

## 2. Immediate Product Deliverables

### 2.1 Brain Bee Course App

Concrete deliverable:

```text
A focused learning app containing a Brain Bee course created from Brain Bee source chapters.
```

Primary users:

```text
Student
Course developer / teacher / admin
```

Primary capabilities:

```text
student signup or admin enrollment
course home
module list
lesson player
quiz player
progress tracking
AI study helper where enabled
review material generated from missed items
```

Not required in the first cut:

```text
full challenge administration
deep learner skill model
community features
coach marketplace
bridge runtime
```

### 2.2 MindAI Bee App

Concrete deliverable:

```text
A learning + quiz/challenge preparation app for MindAI Bee.
```

Primary users:

```text
participant / student
chapter lead
regional organizer
program admin
content developer
```

Primary capabilities:

```text
student signup
chapter/region-aware registration where configured
course/challenge preparation material
concept tutorials
scenario questions
quiz/challenge practice
reflection prompts
progress tracking
```

MindAI Bee scope rule:

```text
MindAI Bee is the InsightX-like learning + quiz/challenge system.
It is not MindStory, StageX, or VibeApp.
```

### 2.3 Bridge Coach App

Concrete deliverable:

```text
A bridge learning and coaching app shell that can contain the Bridge platform runtime.
```

Primary users:

```text
player / learner
coach
club / organization
program admin
bridge expert / reviewer
```

Primary capabilities:

```text
bridge app signup/onboarding
configured AI players
bridge table/play interface
PBN/LIN import where available
coach button and coach entitlement state
player/learner profile
coach profile where enabled
organization/club context where configured
```

Not required in the first cut:

```text
full bridge marketplace
deep human coach assistant
complete bridge ecosystem
full BBO extension
advanced bridge systems beyond selected scope
```

---

## 3. Workstream Ownership

The platform has four implementation workstreams. Each workstream should own a concrete set of product capabilities.

| Workstream | Owns | Does Not Own |
|---|---|---|
| Nexus Platform | identity, organizations, programs, program organizations, app shell configuration, roles, access, registrations, invitations, entitlements, app launch context | learning object authoring, bridge game state, bridge rules, coach reasoning |
| Learning Platform | Learning Studio, learning objects, courses, modules, lessons, quizzes, assignments, flashcards, student runtime, content publishing, learning events | organization onboarding, bridge table runtime, AI player decisions, deep bridge coach runtime |
| Bridge Platform | bridge table, seats, deals, boards, auctions, play events, PBN/LIN, AI player configuration, convention cards, bridge knowledge packages, bridge progress signals | generic registration, generic course builder, generic coach profile registry |
| Coaching Platform | coach profiles, coach configuration, coach instances, coaching policies, hints, explanations, postmortems, guided replay, recommendations, coach button behavior | core identity, course editing, bridge game mechanics |
| App Shell / Delivery | app template, app configuration manifest, build variants, start screen, role buttons, app theme, per-app navigation, store app packaging | domain-specific business logic except routing and feature flags |

The App Shell is not a separate business platform. It is the delivery layer that pulls configuration and screen modules from the other platforms.

---

## 4. Object Ownership Map

| Object | System of Record | Used By | Notes |
|---|---|---|---|
| User | Nexus | all apps | one person may access multiple apps, but progress is domain-isolated |
| Identity credential | Nexus | all apps | email, phone, OTP, social login if enabled |
| Organization | Nexus | all apps | top-level or tenant organization |
| Program | Nexus | all apps | Brain Bee, MindAI Bee, Bridge Program |
| Program Organization | Nexus with program scope | Bridge, MindAI Bee | ACBL-like orgs, clubs, chapters, regional groups |
| Program Offering | Nexus | Learning, Bridge, Coaching | concrete app/course/challenge/class/service under a program |
| App Shell | Nexus + App Shell build system | all apps | configurable app delivery object |
| App Configuration | Nexus | App Shell | controls app name, theme, role labels, start screen, onboarding |
| Course | Learning Platform | Brain Bee, MindAI Bee, Bridge learning | reusable course object |
| Module | Learning Platform | student runtime | course grouping |
| Lesson | Learning Platform | student runtime | smallest instructional sequence |
| Learning Block | Learning Platform | student runtime | rich text, source excerpt, image, quiz, flashcard, activity launcher |
| Quiz | Learning Platform | student runtime, coaching | question delivery and scoring |
| Question | Learning Platform | quiz, coaching | mapped to concept/difficulty/source |
| Assignment | Learning Platform | student runtime | may include external or domain activity |
| Learning Event | Learning Platform | Coaching, analytics | block viewed, quiz answered, lesson completed |
| Course Progress | Learning Platform | dashboards | domain/app scoped |
| Bridge Session | Bridge Platform | Coaching | table/play runtime object |
| Bridge Event | Bridge Platform | Coaching, Bridge progress | bid/play/logic events |
| AI Player Profile | Bridge Platform | Bridge app | configured player instance |
| Bridge Knowledge Item | Bridge Platform | Bridge runtime/coaching | human-readable source of truth for bridge systems/rules |
| Coach Profile | Coaching Platform | app shell, Learning, Bridge | configured coach definition |
| Coach Instance | Coaching Platform | apps | runtime deployment of a coach profile in context |
| Coaching Policy | Coaching Platform | apps | hint/intervention/reveal/recommendation behavior |
| Recommendation | Coaching Platform initially; Learning can store simple recommendations | all apps | must be domain-scoped |
| Entitlement | Nexus | App Shell, Coaching | controls access to app features and paid/free states |
| Artifact | Owning platform | all apps | file, generated output, report, certificate, package |

---

## 5. Screen Ownership Map

### 5.1 Common App Shell Screens

Owned by App Shell, configured by Nexus.

```text
Splash screen
Welcome/start screen
Login/signup screen
Role selection screen
Onboarding questions
App home frame
Bottom tab / side navigation shell
Profile/account screen
Access denied / upgrade / entitlement screen
Error and maintenance screens
```

These screens must be driven by `AppShellConfig`, not hardcoded per app.

### 5.2 Nexus Admin Screens

Owned by Nexus.

```text
Organization admin
Program admin
Program organization admin
Program offering admin
App shell configuration admin
Role and permission admin
Invitation/enrollment admin
Entitlement admin
```

### 5.3 Learning Studio Screens

Owned by Learning Platform.

```text
Studio dashboard
Source library
Source viewer / extraction workspace
Learning object library
Course builder
Lesson/block editor
Quiz/question builder
Flashcard builder
Assignment builder
Review queue
Version/publish manager
Preview mode
```

### 5.4 Student Learning Runtime Screens

Owned by Learning Platform, shown inside each app shell.

```text
Course home
Module page
Lesson player
Block renderer
Quiz player
Flashcard review
Assignment/reflection screen
AI study panel
Progress page
```

### 5.5 Bridge Runtime Screens

Owned by Bridge Platform, shown inside Bridge Coach app shell.

```text
Bridge home
Bridge table
Player configuration
Convention card
Board/deal library
PBN/LIN import
Session history
Bridge progress summary
```

### 5.6 Coaching Screens and Components

Owned by Coaching Platform, embedded in Learning or Bridge screens.

```text
Coach button
Coach panel
Hint ladder
Explanation panel
Postmortem screen
Guided replay screen
Recommendation panel
Coach configuration studio
Human coach dashboard light
```

---

## 6. API Ownership Map

| API Area | Owning Workstream | Immediate Endpoint Examples |
|---|---|---|
| Auth/session | Nexus | `/api/auth/*`, `/api/me` |
| App config | Nexus/App Shell | `/api/apps/{appSlug}/config` |
| Organizations | Nexus | `/api/orgs`, `/api/program-orgs` |
| Programs/offerings | Nexus | `/api/programs`, `/api/offerings` |
| Registrations/invitations | Nexus | `/api/registrations`, `/api/invitations` |
| Courses | Learning | `/api/learning/courses` |
| Learning objects | Learning | `/api/learning/objects` |
| Runtime course manifest | Learning | `/api/runtime/courses/{courseId}/manifest` |
| Learning events | Learning | `/api/runtime/events` |
| Progress | Learning | `/api/runtime/progress` |
| Bridge sessions | Bridge | `/api/bridge/sessions` |
| Bridge events | Bridge | `/api/bridge/events` |
| AI player profiles | Bridge | `/api/bridge/player-profiles` |
| PBN/LIN | Bridge | `/api/bridge/import`, `/api/bridge/export` |
| Coach profiles | Coaching | `/api/coaching/profiles` |
| Coach instances | Coaching | `/api/coaching/instances` |
| Hints/explanations | Coaching | `/api/coaching/hint`, `/api/coaching/explain` |
| Postmortems | Coaching | `/api/coaching/postmortems` |
| Recommendations | Coaching | `/api/coaching/recommendations` |

API rule:

```text
Apps should not directly read random platform tables.
Apps should receive an app launch context, app config, and domain manifests through defined services.
```

---

## 7. Required Cross-Platform Data Flows

### 7.1 App Launch Flow

```text
User opens app
↓
App Shell loads local build-time app slug
↓
App Shell requests /api/apps/{slug}/config
↓
Nexus returns app config, auth methods, role labels, enabled features, route map
↓
User signs in or signs up
↓
Nexus returns launch context: user, roles, memberships, entitlements, app access
↓
App Shell routes user to Learning, Bridge, or Coaching screen modules
```

### 7.2 Brain Bee Course Flow

```text
Nexus creates Brain Bee app shell
↓
Learning Platform publishes Brain Bee course manifest
↓
App Shell points default route to course home
↓
Student signs up or is enrolled
↓
Student completes lessons/quizzes
↓
Learning Platform records progress and missed items
↓
Coaching Platform may generate lightweight review material if enabled
```

### 7.3 MindAI Bee App Flow

```text
Nexus creates MindAI Bee app shell
↓
Nexus configures role labels, chapter/region registration fields, and app route map
↓
Learning Platform publishes MindAI Bee course/challenge prep content
↓
Student signs up into configured chapter/region context
↓
Student studies tutorials, scenarios, quiz practice, reflections
↓
Progress and quiz events remain MindAI Bee scoped
```

### 7.4 Bridge Coach App Flow

```text
Nexus creates Bridge Coach app shell
↓
Nexus enables Bridge roles: player, coach, club/org admin
↓
Bridge Platform receives launch context
↓
Player config, bridge session, and table runtime happen in Bridge Platform
↓
Bridge events are emitted
↓
Coaching Platform may observe passively, intervene live, or generate postmortem depending on coach entitlement/policy
↓
Bridge progress signals remain Bridge scoped
```

---

## 8. Domain Isolation Rules

The implementation must enforce these rules from the start:

```text
A learner's Bridge skill state must not appear in Brain Bee progress screens.
A learner's Brain Bee course progress must not appear in Bridge skill dashboards.
A learner's MindAI Bee challenge preparation must not appear in Brain Bee reports unless explicitly exported by an admin-approved flow.
Recommendations must be generated inside a domain/app context.
```

Recommended database pattern:

```text
progress_context = {
  appId,
  programId,
  domainId,
  courseId?,
  bridgeWorkspaceId?,
  coachInstanceId?
}
```

Every progress, recommendation, event, and analytics record should carry a context.

---

## 9. Build Dependency Map

### 9.1 Build First

```text
shared TypeScript types
user/auth model
app shell config model
app launch context API
basic app shell runtime
course manifest API
learning block renderer
```

### 9.2 Build Second

```text
Nexus admin for app configuration
Brain Bee app shell
MindAI Bee app shell
Bridge app shell
student course runtime
basic progress events
```

### 9.3 Build Third

```text
Learning Studio source viewer and course builder
Bridge table/player configuration integration
coach button and entitlement states
coach profile registry
basic recommendations
```

### 9.4 Build Fourth

```text
Bridge coaching/postmortem
coach configuration studio
MindAI Bee chapter/region registration extensions
mobile store packaging pipeline
```

---

## 10. Monorepo Package Map

Recommended monorepo shape:

```text
laic-platform/
  apps/
    admin-web/
    app-runtime-web/
    brainbee-mobile/
    mindaib-mobile/
    bridgecoach-mobile/
  packages/
    app-shell-core/
    app-shell-ui/
    nexus-types/
    learning-types/
    learning-runtime/
    learning-studio-ui/
    bridge-types/
    bridge-runtime/
    coaching-types/
    coaching-runtime/
    ui-system/
    api-client/
    config-loader/
  services/
    nexus-api/
    learning-api/
    bridge-api/
    coaching-api/
  db/
    migrations/
    seeds/
    fixtures/
  tools/
    generate-app-config/
    validate-app-config/
    build-app-variant/
    seed-demo-data/
```

Implementation rule:

```text
The three mobile apps should share code. They should not become three unrelated applications.
```

---

## 11. Concrete Build Sequence

### Sequence 1: Shared Types and Config Contracts

Build:

```text
AppShellConfig type
LaunchContext type
RoleButton type
ThemeConfig type
FeatureFlag type
NavigationConfig type
CourseManifest type
BridgeLaunchContext type
CoachButtonConfig type
```

Done when:

```text
A JSON config can validate for Brain Bee, MindAI Bee, and Bridge Coach.
```

### Sequence 2: Nexus App Config Admin

Build:

```text
create app shell
edit app name
edit app slug
edit theme
edit welcome message
edit role buttons
edit enabled auth methods
edit onboarding questions
edit default route
edit feature flags
publish config version
```

Done when:

```text
An admin can create three app shell configs without code changes.
```

### Sequence 3: App Runtime Shell

Build:

```text
load app config by slug
theme provider
welcome/start screen
role button renderer
login/signup container
onboarding renderer
route resolver
entitlement gate
profile/account screen
```

Done when:

```text
The same runtime renders Brain Bee, MindAI Bee, and Bridge Coach start screens from different configs.
```

### Sequence 4: Learning Runtime Integration

Build:

```text
course manifest loader
course home
module page
lesson player
quiz player
progress event writer
AI study panel placeholder
```

Done when:

```text
Brain Bee and MindAI Bee can launch a course from app shell.
```

### Sequence 5: Bridge Runtime Integration

Build:

```text
Bridge app home
bridge launch context
player profile selection
bridge table route
bridge session creation
bridge event stream connection
coach button placeholder
```

Done when:

```text
Bridge Coach app opens into the bridge runtime with an authenticated player context.
```

### Sequence 6: Native App Variant Build

Build:

```text
three app identifiers
three icons/splash screens
three native config files
three environment configs
three app-store metadata drafts
CI script to build each app variant
```

Done when:

```text
The team can generate test builds for Brain Bee, MindAI Bee, and Bridge Coach as separate installable apps.
```

---

## 12. Immediate Acceptance Criteria

### 12.1 Brain Bee App

```text
App opens with Brain Bee branding.
Start screen says Student and Teacher/Admin or configured role names.
Student can sign up or sign in.
Student lands on Brain Bee course home.
Student can open module, lesson, and quiz.
Progress event is stored with Brain Bee context.
```

### 12.2 MindAI Bee App

```text
App opens with MindAI Bee branding.
Start screen uses participant/chapter lead/program admin language.
Registration can capture configured chapter/region fields.
Student lands on MindAI Bee learning/challenge preparation home.
Quiz and scenario practice events are stored with MindAI Bee context.
```

### 12.3 Bridge Coach App

```text
App opens with Bridge Coach branding.
Start screen can show Player, Coach, Club/Organization buttons.
Player can sign in.
Player lands on Bridge home.
Player can reach bridge table/player configuration route.
Coach button appears in configured locations.
Bridge events are stored with Bridge context.
```

### 12.4 Cross-App

```text
Same user account can access multiple apps if entitled.
Progress remains separated by app/domain context.
App-specific role labels and onboarding fields are rendered from config.
No app requires hardcoded login/start screen changes.
```

---

## 13. Key Implementation Decisions

1. Treat app shells as real configured products, not demo wrappers.
2. Keep app configuration in Nexus, but runtime behavior in App Shell and domain platforms.
3. Build one shared App Shell Runtime that renders multiple apps from config.
4. Use separate app-store identities for Brain Bee, MindAI Bee, and Bridge Coach.
5. Keep admin/studio interfaces web-first; keep student/player apps mobile-first.
6. Enforce context on every progress/event/recommendation record.
7. Avoid one-off app screens unless a reusable hook cannot support the requirement.

---

## 14. What This Document Does Not Replace

This document does not replace:

```text
App Shell Implementation Spec
Shared Data Model + API Contract
Learning Platform Implementation Plan
Bridge Platform Implementation Plan
Coaching Platform Implementation Plan
Nexus Platform Implementation Architecture
```

It is the map that tells the team how those documents fit together.
