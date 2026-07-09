# Bridge Platform Implementation Plan

**Document status:** Implementation planning draft  
**Scope:** Bridge Platform workstream only  
**Primary outcome:** Production-capable Bridge app/platform foundation that preserves the existing prototype architecture while extending it toward authenticated users, bridge program organizations, structured bridge knowledge ingestion, bridge player modeling, progress tracking, BEN availability, and future integration with learning and coaching services.

---

## 1. Executive Summary

The Bridge Platform workstream should build the bridge-specific application and runtime infrastructure for LAIC / MindBrainAI Nexus. The immediate product direction is a Bridge AI Coach / Bridge Coaching app, but this document focuses only on the **Bridge Platform** layer, not the Learning Platform and not the Coaching Platform.

The Bridge Platform owns:

- Bridge app shell and bridge runtime
- Bridge table, board, deal, auction, and play state
- Event-driven game/session architecture
- Human, deterministic AI, and BEN player seats
- Bridge player profiles and convention configurations
- Convention card generation
- Structured ingestion of bridge system/configuration knowledge
- Bridge-specific data model for deals, boards, sessions, events, player profiles, conventions, and learner progress signals
- Integration surfaces for Nexus, Learning Platform, and Coaching Platform

The Bridge Platform does **not** own:

- Generic Nexus organization, invitation, authentication, membership, or entitlement infrastructure
- General learning course creation
- Lesson/tutorial authoring workflows
- Human-readable coaching content generation
- Adaptive coach response generation
- A cross-domain progress view that mixes Bridge skill data with Brain Bee, MindAI Bee, or other learning domains

However, the Bridge Platform must expose the bridge-specific data, events, and state required by those other workstreams.

The existing prototype should be treated as a strong architectural baseline. It already demonstrates key bridge-specific concepts: a configuration-driven bridge player, event-sourced game loop, deterministic rule execution, rule attribution, convention card generation, BEN integration path, and separation between pure engine and UI. These should be preserved unless a specific implementation issue requires change.

The main change from the prototype is that the new implementation should move from a trusted expert prototype to a production-capable platform with real authentication, organization-scoped data, bridge program organizations, durable database storage, structured ingestion, learner profiles, and progress signal capture.

---

## 2. Workstream Boundary

### 2.1 Bridge Platform Workstream

This document is for the **Bridge Platform workstream**.

It should answer:

- How is the bridge app shell built?
- How are bridge sessions represented?
- How do players sit at seats?
- How are human, AI, and BEN players plugged in?
- How are deals, boards, auctions, and card play represented?
- How are bridge events emitted, persisted, replayed, and consumed?
- How are bridge player configurations created and used?
- How are convention cards generated from configuration?
- How are bridge knowledge sources ingested in a structured way?
- How is the human learner/player model represented at the bridge level?
- How are bridge progress signals captured for later coaching and learning services?
- How does the bridge app inherit organization and user context from Nexus?

### 2.2 Explicitly Outside This Workstream

The following belong to other workstreams:

| Area | Owning Workstream | Bridge Platform Responsibility |
|---|---|---|
| Course creation | Learning Platform | Provide links to bridge app contexts and bridge artifacts |
| Lesson/tutorial authoring | Learning Platform | Provide bridge concepts, configurations, sessions, and examples as inputs |
| Coach response generation | Coaching Platform | Provide bridge event stream, state, evaluation facts, and progress signals |
| Adaptive coach runtime | Coaching Platform | Emit domain events and expose bridge evaluator results |
| General organization onboarding | Nexus Platform | Consume organization/user/group/access context from Nexus |
| Generic learner model | Coaching/Common Platform | Store bridge-specific skill/progress signals and synchronize them |
| Public registration | Nexus Platform | Let registration originate in Bridge app UI but system-of-record stays Nexus |

### 2.3 Practical Rule

The Bridge Platform should be able to run a complete bridge session without the Learning Platform or Coaching Platform being finished.

But it should emit enough structured information that, when the Coaching Platform is connected later, the coach can observe, diagnose, and respond.

---

## 3. Relationship to Nexus Platform

### 3.1 Correct Mental Model

The Bridge Platform should **inherit organization and membership capabilities from Nexus**, but the bridge ecosystem should be scoped under the LAIC Bridge Program.

The intended hierarchy is:

```text
MindBrainAI Nexus Platform
  -> LAIC / Life in AI Center
    -> Program: Bridge Program
      -> Bridge Program Organizations
        -> ACBL-like partner organization
        -> bridge club
        -> coaching organization
        -> independent coach group
        -> informal class/group
      -> Bridge App / Bridge Platform
        -> bridge workspaces
        -> bridge sessions
        -> bridge player profiles
        -> bridge configurations
        -> learner progress signals
```

The important distinction is:

- Nexus provides the reusable machinery.
- LAIC Bridge Program uses that machinery to onboard Bridge-scoped organizations and users.
- Bridge Platform manages bridge-specific runtime and data.

### 3.2 Program Organization

Use the term **Program Organization** for organizations onboarded under a particular program.

A Bridge Program Organization is not necessarily a top-level Nexus organization. It is an organization-like entity scoped under the Bridge Program.

Examples:

- ACBL-like bridge organization
- Bridge club
- Coach organization
- Fellow-led bridge group
- Independent coach practice
- Informal class group
- Pilot partner organization

### 3.3 Nexus-Owned Capabilities Reused by Bridge

Bridge should not rebuild these generic services:

- User identity
- Authentication
- Phone/email login support
- Invitations
- Organization creation
- Program organization creation
- Role assignment
- Membership management
- Entitlements/app access
- Organization-scoped permissions
- Admin audit log

Instead, Bridge receives a bridge-scoped context object from Nexus.

```ts
type NexusBridgeContext = {
  nexusUserId: string;
  laicOrgId: string;
  programId: "bridge_program";
  programOrganizationId?: string;
  groupId?: string;
  appId: "bridge_ai_coach" | string;
  roles: Array<
    | "bridge_program_admin"
    | "bridge_org_admin"
    | "bridge_club_admin"
    | "bridge_coach"
    | "bridge_reviewer"
    | "bridge_fellow"
    | "bridge_learner"
    | "bridge_guest"
  >;
  permissions: string[];
  accessLevel: "admin" | "coach" | "learner" | "reviewer" | "guest";
};
```

### 3.4 Bridge-Owned Extensions to Nexus Context

Bridge can add bridge-specific data to a Nexus user or organization context without owning the base identity.

Examples:

```ts
type BridgeUserProfile = {
  bridgeUserProfileId: string;
  nexusUserId: string;
  displayNameAtTable: string;
  preferredSeat?: "N" | "E" | "S" | "W";
  bridgeExperienceLevel?: "new" | "beginner" | "intermediate" | "advanced" | "expert";
  biddingSystemFamiliarity?: string[];
  preferredFeedbackMode?: "none" | "after_hand" | "during_pause";
};
```

```ts
type BridgeProgramOrganizationProfile = {
  bridgeProgramOrganizationProfileId: string;
  programOrganizationId: string;
  bridgeOrgType:
    | "acbl_like_partner"
    | "bridge_club"
    | "coach_organization"
    | "independent_coach_group"
    | "class_group"
    | "pilot_partner";
  allowedBiddingSystems: string[];
  defaultLearnerLevel?: string;
  defaultConventionProfileId?: string;
  allowBenPlayers: boolean;
  allowAiPlayers: boolean;
};
```

### 3.5 Independent and Organization-Affiliated Coaches

A coach may be:

- Independent under the Bridge Program
- Affiliated with one Bridge Program Organization
- Affiliated with multiple Bridge Program Organizations
- Running a private group/class
- Acting as a reviewer or fellow in another context

The model should allow many-to-many coach affiliations.

```ts
type BridgeCoachAffiliation = {
  coachAffiliationId: string;
  bridgeUserProfileId: string;
  programOrganizationId?: string;
  groupId?: string;
  affiliationType: "independent" | "organization_coach" | "club_coach" | "class_coach" | "reviewer" | "fellow";
  status: "active" | "pending" | "inactive";
};
```

---

## 4. Core Architecture Principles Preserved from Prototype

The existing prototype established architectural principles that should remain unless a strong reason arises to change them.

### 4.1 Config-Driven Player

The AI bridge player should be driven by explicit configuration, not by opaque LLM judgment.

Configuration includes:

- Bidding system
- Convention settings
- Opening lead settings
- Defensive carding settings
- Play technique settings
- Skill/complexity level
- Rule selection policy
- Fallback behavior

A player profile is a resolved configuration plus metadata.

```text
Bridge Configuration
  -> resolved settings map
  -> rule engine inputs
  -> AI player behavior
  -> convention card
  -> attribution/citation trail
```

### 4.2 Deterministic Rule Executor

Default AI player behavior should be deterministic.

Same input:

```text
position + player configuration + decision policy
```

should produce the same output unless randomness is explicitly enabled.

This is important for:

- Review by bridge experts
- Repeatable tests
- Replaying event logs
- Student/coach comparison
- Debugging rule gaps
- Explaining why a bid/card was chosen

### 4.3 Attribution Honesty

Every AI decision should clearly identify why it was made.

A decision should indicate:

- Chosen bid/card
- Matched rule or rules
- Settings that controlled the decision
- Rules that were checked and rejected if useful
- Whether a fallback was used
- Whether BEN, human, or deterministic AI made the decision

The system must not present a fallback as if it were a rule-supported expert decision.

### 4.4 Event-Sourced, Single-Writer Game State

Game state should be reconstructed from an ordered event log.

Only one controller writes authoritative action events. Other components subscribe.

```text
Initial deal/context
  + ordered bid/play events
  = current game state
```

Benefits:

- Replay
- Undo/redo
- Postmortem analysis
- Coach observation
- Learner progress extraction
- Debugging
- Session export/import
- Re-running a board with changed configuration

### 4.5 Engine Separated from UI

The bridge engine should remain pure TypeScript where possible and should not depend on React, DOM, or mobile UI code.

The engine should be usable from:

- Web UI
- Mobile app wrapper
- Test suite
- Headless benchmark tools
- Backend services
- Future coaching services

### 4.6 BEN as Player, Not Primary Learner Evaluator

BEN should be available as a bridge player/opponent. However, BEN should not be treated as the primary evaluator for constrained learning environments.

Reasons:

- BEN may be useful as a strong AI player/opponent.
- BEN is not necessarily aligned with beginner-level learning constraints.
- BEN may not use the exact convention system configured for the learner.
- BEN’s decisions may not be explainable in the way required for teaching.
- In learning modes, evaluation often needs to be constrained by the lesson target, system, learner level, and allowed concepts.

So the plan should support:

```text
BEN = optional player/opponent
Deterministic bridge evaluator = constrained rule/system evaluator
Coaching evaluator = future integration with Coaching Platform
```

---

## 5. High-Level System Layers

```text
Bridge Platform
│
├── 1. Bridge App Shell
│   ├── authenticated app entry
│   ├── bridge home/dashboard
│   ├── table/session UI
│   ├── configuration UI
│   ├── convention card UI
│   ├── board/deal library UI
│   ├── progress summary UI
│   └── integration points for learning/coaching panes later
│
├── 2. Nexus Context Adapter
│   ├── user context
│   ├── program organization context
│   ├── group/class context
│   ├── role/permission context
│   └── app access context
│
├── 3. Bridge Domain Engine
│   ├── bridge types
│   ├── legality helpers
│   ├── GameState fold
│   ├── Game controller
│   ├── auction engine
│   ├── play engine
│   └── scoring/session helpers
│
├── 4. Event System
│   ├── action events
│   ├── logic events
│   ├── session event log
│   ├── event bus
│   ├── replay/reconstruction
│   └── event subscribers
│
├── 5. Player System
│   ├── human player adapter
│   ├── deterministic AI player
│   ├── BEN player adapter
│   ├── future coach-observed player mode
│   └── player profile library
│
├── 6. Configuration and Convention System
│   ├── settings registry
│   ├── presets
│   ├── configuration resolver
│   ├── dependency/conflict rules
│   ├── convention card generator
│   └── configuration versioning
│
├── 7. Structured Knowledge Ingestion
│   ├── source intake
│   ├── bridge system schema
│   ├── extraction workflow
│   ├── gap identification
│   ├── expert review
│   ├── rule/config package creation
│   └── publication/versioning
│
├── 8. Learner / Human Player Model
│   ├── bridge learner profile
│   ├── skill taxonomy reference
│   ├── event-derived progress signals
│   ├── mistake pattern store
│   ├── system familiarity tracking
│   └── progress summaries for future coaching
│
├── 9. Persistence and APIs
│   ├── Postgres schema
│   ├── event log storage
│   ├── configuration storage
│   ├── board/deal storage
│   ├── player profile storage
│   ├── knowledge package storage
│   └── API layer
│
└── 10. Integration Layer
    ├── Nexus Platform integration
    ├── Learning Platform integration
    ├── Coaching Platform integration
    ├── BEN service integration
    └── analytics/export integration
```

---

## 6. Immediate Product Outcome

The immediate product is a bridge app shell that can support real usage, not a disposable playground.

Initial release target:

- Authorized user enters Bridge app from Nexus/app shell.
- User can select or create a player profile.
- User can select or configure AI player profiles.
- User can view generated convention cards.
- User can start a table/session.
- Seats can be assigned to human, deterministic AI, or BEN where available.
- Bids and plays produce action events.
- Logic events capture AI reasoning/decision traces.
- Session can be replayed from event log.
- Learner/human actions are captured as bridge progress signals.
- Structured bridge knowledge ingestion can create and revise bidding/configuration packages.

Initial release should not require:

- Full adaptive coach responses
- Course authoring system
- Lesson creation system
- Marketplace/coaching network
- Payments
- Full production BEN cloud scaling

---

## 7. App Shell and User Experience Structure

### 7.1 Bridge App Shell

The Bridge app shell is the bridge-specific application surface launched from the Nexus-configured app access.

It should support:

- Sign-in already handled by Nexus or shared auth
- App context loaded from Nexus
- Bridge dashboard
- Bridge table/session entry
- Player/configuration library
- Board/deal library
- Knowledge/config admin area for authorized users
- Progress summary for learners
- Admin/reviewer views for bridge experts

### 7.2 Core Navigation

Recommended app navigation:

```text
Bridge App
│
├── Home / Dashboard
├── Play / Practice
│   ├── Start table
│   ├── Resume session
│   ├── Load board/deal
│   └── Select players
│
├── Players & Configurations
│   ├── My bridge profile
│   ├── AI player profiles
│   ├── Convention settings
│   ├── Convention cards
│   └── Imported/shared profiles
│
├── Boards & Deals
│   ├── Random deals
│   ├── Saved boards
│   ├── Imported PBN/LIN
│   ├── Shared boards
│   └── Position snapshots
│
├── Progress
│   ├── recent sessions
│   ├── bidding patterns
│   ├── play patterns
│   ├── system familiarity
│   └── future coach handoff summaries
│
└── Admin / Expert Review
    ├── bridge knowledge sources
    ├── system packages
    ├── rule gaps
    ├── configuration package review
    ├── test boards
    └── publication/versioning
```

### 7.3 Mobile and Web

The bridge table itself is UI-intensive. The recommended approach is:

- Web app first for admin, expert review, configuration, and table development.
- Mobile-capable responsive UI for the learner-facing bridge table.
- Native mobile wrapper later using Expo / React Native if app-store distribution is needed.

The bridge engine should remain shared TypeScript and not be rewritten separately for mobile.

---

## 8. Bridge Session Model

### 8.1 Session Definition

A bridge session represents one or more boards played in a context.

```ts
type BridgeSession = {
  bridgeSessionId: string;
  appId: string;
  nexusContext: NexusBridgeContext;
  sessionType:
    | "single_board"
    | "practice_set"
    | "duplicate_match"
    | "coach_review"
    | "configuration_test"
    | "benchmark";
  status: "created" | "active" | "completed" | "abandoned";
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
};
```

### 8.2 Table and Seat Model

```ts
type BridgeTable = {
  bridgeTableId: string;
  bridgeSessionId: string;
  tableType: "practice" | "duplicate" | "review" | "test";
  scoringType?: "none" | "matchpoints" | "imps" | "rubber";
  vulnerabilityMode?: "board" | "manual";
  seats: Record<BridgeSeat, BridgeSeatAssignment>;
};

type BridgeSeat = "N" | "E" | "S" | "W";

type BridgeSeatAssignment = {
  seat: BridgeSeat;
  playerKind: "human" | "deterministic_ai" | "ben" | "empty";
  bridgeUserProfileId?: string;
  aiPlayerProfileId?: string;
  benProfileId?: string;
  partnershipId?: "NS" | "EW";
};
```

### 8.3 Board / Deal / Position

```ts
type BridgeBoard = {
  bridgeBoardId: string;
  sourceType: "random" | "manual" | "imported_pbn" | "imported_lin" | "library";
  dealer: BridgeSeat;
  vulnerability: "none" | "NS" | "EW" | "both";
  hands: Record<BridgeSeat, string[]>;
  tags?: string[];
  difficultyLevel?: "new" | "beginner" | "intermediate" | "advanced";
  targetConceptIds?: string[];
};
```

```ts
type BridgePositionSnapshot = {
  snapshotId: string;
  bridgeSessionId: string;
  bridgeBoardId: string;
  auction: BridgeCallEvent[];
  play: BridgeCardPlayEvent[];
  currentSeat: BridgeSeat;
  contract?: string;
  declarer?: BridgeSeat;
  dummy?: BridgeSeat;
  trickState?: unknown;
};
```

---

## 9. Event-Driven Architecture

### 9.1 Event Categories

Preserve the prototype’s event architecture but extend it for persistence and progress extraction.

Core event categories:

1. **Bid action event** — state-changing auction event.
2. **Play action event** — state-changing card play event.
3. **Bid logic event** — non-mutating decision trace for a bid.
4. **Play logic event** — non-mutating decision trace for a card play.

Additional production categories:

5. **Session event** — session start/end, seat assignment, board load, undo/redo.
6. **Progress signal event** — derived signal about learner action.
7. **Configuration event** — profile/config selection, configuration change, convention package version.
8. **Knowledge package event** — system package used during decision or validation.

### 9.2 Single Writer

The Game controller remains the single writer of state-changing game events.

```text
Player decision requested
  -> player adapter returns action and optional logic trace
  -> Game controller emits logic event
  -> Game controller validates action
  -> Game controller emits action event
  -> GameState fold applies action event
  -> subscribers receive updated state
```

### 9.3 Event Schema

```ts
type BridgeEventBase = {
  eventId: string;
  bridgeSessionId: string;
  bridgeBoardId?: string;
  seq: number;
  eventType: string;
  eventCategory:
    | "bid_action"
    | "play_action"
    | "bid_logic"
    | "play_logic"
    | "session"
    | "progress_signal"
    | "configuration"
    | "knowledge_package";
  actorKind: "human" | "deterministic_ai" | "ben" | "system" | "coach";
  actorId?: string;
  seat?: BridgeSeat;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

### 9.4 Action Events

```ts
type BridgeBidActionPayload = {
  call: string;
  legalCalls: string[];
  auctionBefore: string[];
};

type BridgePlayActionPayload = {
  card: string;
  legalCards: string[];
  trickBefore: string[];
  playBefore: string[];
};
```

### 9.5 Logic Events

```ts
type BridgeDecisionTrace = {
  decisionId: string;
  playerKind: "deterministic_ai" | "ben" | "human";
  chosenAction: string;
  fallback: boolean;
  facts?: Record<string, unknown>;
  citedSettings?: string[];
  matchedRuleIds?: string[];
  rejectedRuleIds?: string[];
  knowledgePackageIds?: string[];
  reasoningSummary?: string;
  rawEngineTrace?: unknown;
};
```

Human actions should still be recorded honestly:

```text
human chose this bid/card
```

not retrofitted into an AI explanation.

### 9.6 Event Subscribers

Subscribers can include:

- UI state panels
- Event log panel
- Persistence service
- Progress signal extractor
- Future coach observer
- BEN relay
- Analytics service
- Export/share service
- Replay/undo service

The event bus should support both in-memory subscribers and persisted logs.

---

## 10. Player System

### 10.1 Player Types

```ts
type BridgePlayerKind = "human" | "deterministic_ai" | "ben";
```

Each player type implements a shared interface.

```ts
type BridgePlayerAdapter = {
  playerKind: BridgePlayerKind;
  decideBid(input: BidDecisionInput): Promise<BridgePlayerDecision>;
  decidePlay(input: PlayDecisionInput): Promise<BridgePlayerDecision>;
};
```

### 10.2 Human Player

Human player adapter:

- Waits for UI input.
- Receives legal calls/cards from engine.
- Commits chosen action through Game controller.
- May expose current context to future coach UI.
- Produces honest human-chosen event trace.

### 10.3 Deterministic AI Player

Deterministic AI player:

- Uses resolved configuration.
- Runs bidding/play rule chains.
- Emits complete decision trace.
- Applies fallback only when no rule matches.
- Supports controlled rule-selection policy.
- Supports test/benchmark usage.

### 10.4 BEN Player

BEN player:

- Is exposed as an optional player seat.
- Connects through a server-side adapter or bridge service.
- Should be treated as external and potentially non-rewindable.
- Should not be used as the primary constrained learning evaluator.
- Should include clear attribution: BEN chose this.

Recommended BEN integration evolution:

```text
Stage 1: local BEN adapter preserved from prototype
Stage 2: hosted BEN service for controlled testing
Stage 3: managed BEN seat pool with availability/health checks
Stage 4: optional benchmark/evaluation tools, separate from learner evaluation
```

### 10.5 Coach as Observer, Not Player in This Workstream

This workstream does not implement the coach. However, it should expose events so a coach can later observe and optionally intervene.

Possible future pattern:

```text
Game event emitted
  -> Coach Platform subscribes
  -> Coach may produce hint/comment
  -> Bridge UI displays it
```

The Bridge Platform should not block on this.

---

## 11. Configuration and Convention System

### 11.1 Configuration Purpose

Bridge configuration controls AI player behavior and convention card generation.

It should include:

- Bidding system profile
- Convention settings
- Opening lead settings
- Defensive carding settings
- Play technique settings
- Complexity/level settings
- Rule selection settings
- Visibility rules for learner-facing config UI
- Dependency/conflict rules

### 11.2 Core Objects

```ts
type BridgeConfigurationPackage = {
  configurationPackageId: string;
  name: string;
  systemFamily: "SAYC" | "2_over_1" | "natural" | "custom";
  version: string;
  status: "draft" | "review" | "published" | "deprecated";
  sourceKnowledgePackageIds: string[];
  settingRegistryId: string;
  rulePackageId: string;
  conventionCardTemplateId?: string;
};
```

```ts
type BridgePlayerConfiguration = {
  bridgePlayerConfigurationId: string;
  ownerType: "system" | "program_org" | "coach" | "learner" | "expert";
  ownerId?: string;
  basePackageId: string;
  selectedPresetId?: string;
  valueOverrides: Record<string, unknown>;
  resolvedValueHash?: string;
  status: "draft" | "active" | "archived";
};
```

### 11.3 Presets

Initial presets:

- Beginner Natural
- SAYC Beginner
- SAYC Standard
- 2/1 Game Force Beginner
- 2/1 Game Force Standard
- Advanced / Expert sandbox

Presets should not be just labels. They should map to explicit setting values and produce a convention card.

### 11.4 Resolved Configuration

The engine should consume a resolved setting map.

```text
setting registry defaults
  + base package values
  + preset values
  + owner overrides
  = resolved player configuration
```

Resolved configuration should be versioned/hashable so decisions can be replayed later even after settings evolve.

### 11.5 Convention Card Generation

The convention card should be generated from configuration.

```text
BridgePlayerConfiguration
  -> resolved settings
  -> convention card model
  -> convention card UI/PDF/export
```

Convention card data should be stored as derived output, not manually maintained as a separate source of truth.

---

## 12. Structured Bridge Knowledge Ingestion

### 12.1 Why This Matters

The prototype used AI-assisted knowledge ingestion where documents/books/internet references were used to fill gaps in SAYC and 2/1 encodings. That was useful for prototyping, but bridge fellows and reviewers need a structured, reviewable, repeatable process.

The production system should move from:

```text
AI reads sources and fills gaps informally
```

to:

```text
authorized sources + explicit ingestion intent + bridge schema + extracted rules/settings + gap review + expert approval + published package
```

### 12.2 Knowledge Ingestion Scope in This Workstream

This workstream should focus on bridge system/config/player knowledge only.

Included:

- SAYC bidding system rules
- 2/1 bidding system rules
- Natural bidding rules
- Convention setting definitions
- Convention dependencies/conflicts
- Rule gaps and expert decisions
- AI player configuration packages
- Convention card generation knowledge
- Bridge validation rules
- Example hands/deals tied to rules

Excluded:

- Full course authoring
- Lesson creation
- Tutorial prose writing
- Learner-facing explanations
- Adaptive coach hint content

### 12.3 Ingestion Pipeline

```text
Source Document / Expert Input
  -> Source Registration
  -> Ingestion Intent
  -> Bridge Schema Selection
  -> Parse / Chunk / Extract
  -> Candidate Concepts / Rules / Settings
  -> Gap Identification
  -> Expert Review
  -> Test Board Generation or Attachment
  -> Rule/Config Package Draft
  -> Automated Validation
  -> Publish Versioned Package
```

### 12.4 Source Registration

```ts
type BridgeKnowledgeSource = {
  sourceId: string;
  title: string;
  sourceType: "standard_doc" | "book" | "expert_notes" | "website" | "conversation" | "code" | "manual_entry";
  systemFamily?: "SAYC" | "2_over_1" | "natural" | "custom";
  rightsStatus: "owned" | "licensed" | "public_reference" | "fair_use_reference" | "unknown";
  uploadedBy: string;
  uploadedAt: string;
  status: "registered" | "ingested" | "reviewed" | "deprecated";
};
```

### 12.5 Ingestion Intent

```ts
type BridgeIngestionIntent = {
  intentId: string;
  sourceId: string;
  systemFamily: "SAYC" | "2_over_1" | "natural" | "custom";
  targetOutputs: Array<
    | "configuration_package"
    | "bidding_rule_package"
    | "play_rule_package"
    | "convention_card_package"
    | "validator_package"
    | "test_board_package"
  >;
  extractionGoals: Array<
    | "opening_bids"
    | "responses"
    | "rebids"
    | "competitive_bidding"
    | "slam_conventions"
    | "lead_rules"
    | "carding_rules"
    | "convention_dependencies"
    | "conflicts"
    | "examples"
    | "exceptions"
    | "ambiguities"
  >;
  humanReviewRequired: true;
};
```

### 12.6 Gap Registry

A core output of ingestion should be a **gap registry**.

```ts
type BridgeKnowledgeGap = {
  gapId: string;
  systemFamily: string;
  area: "bidding" | "play" | "defense" | "convention_card" | "configuration";
  description: string;
  detectedFrom: string[];
  severity: "minor" | "important" | "blocking";
  resolutionStatus: "open" | "expert_decision_needed" | "resolved" | "deferred";
  expertResolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};
```

Examples:

- Source defines Jacoby 2NT but does not specify learner-level visibility.
- SAYC source defines a convention but not how it maps to the current setting registry.
- 2/1 source describes a sequence but does not specify what the AI should do with borderline hands.
- Expert reviewers disagree on whether a convention should be active in beginner mode.

### 12.7 Review Workflow

Expert review should support:

- Approve extracted rule
- Edit extracted rule
- Reject extracted rule
- Mark as ambiguous
- Link to source passage
- Link to test board
- Add expert note
- Publish into package

### 12.8 Package Publication

Published packages should be immutable.

```text
bridge_system_sayc_v1
bridge_system_2over1_v1
bridge_config_registry_v1
bridge_convention_card_template_v1
```

New revisions create new versions. Existing sessions continue referencing the package version they used.

### 12.9 Human-Readable Bridge Knowledge Source of Truth

The Bridge Platform should not treat generated code, hidden JSON, or rule-engine files as the only source of truth for bridge knowledge. Reviewers and Bridge fellows need to be able to inspect and edit the bridge model in a human-readable form.

The authoritative editable layer should be:

```text
Source documents and expert inputs
  -> extracted candidate knowledge
  -> human-readable reviewed Bridge Knowledge Base
  -> generated implementation artifacts
  -> runtime rule/config/evaluator packages
```

The human-readable Bridge Knowledge Base should be the reviewed source of truth for SAYC, 2/1, Natural, and other bridge systems. Runtime implementation artifacts should be generated from this reviewed layer or explicitly linked to it.

This is essential because bridge knowledge contains gaps, conventions, exceptions, expert judgment, and learner-level choices. A reviewer should be able to return later, read what the platform believes about a bidding system or convention, correct it in human-readable form, and trigger regeneration of the affected implementation artifacts.

### 12.10 Specific Steps to Build the Bridge Knowledge / System Model

The implementation plan should include concrete steps for creating the Bridge model, not only the architecture.

#### Step 1: Define the Bridge System Scope

Start with a limited number of system families:

```text
1. Beginner Natural
2. SAYC
3. 2/1 Game Force
```

For each system family define:

- system name
- intended learner level
- included conventions
- excluded conventions
- allowed ambiguity policy
- required source documents
- reviewer/fellow ownership
- publication status

#### Step 2: Register Authoritative and Reviewed Sources

For each system, create source records such as:

```text
SAYC source document
2/1 source document
Bridge fellow notes
Expert gap-resolution notes
Prototype-derived configuration/rule artifacts
Curated example boards
```

The source record should include:

- title
- source type
- rights/reuse status
- system family
- uploaded or referenced by
- current review status
- source version
- which extracted items came from it

Where there is no single standard body or complete source, the gap should be explicit rather than silently filled.

#### Step 3: Define the Human-Readable Knowledge Schema

Create a reviewer-facing schema that is understandable to bridge fellows and still structured enough to generate implementation artifacts.

Example object types:

```text
Bridge System
Convention
Bidding Sequence Rule
Opening Bid Rule
Response Rule
Rebid Rule
Competitive Bidding Rule
Play Principle
Defense Principle
Lead Rule
Carding Rule
Convention Dependency
Convention Conflict
Learner-Level Visibility Rule
Example Hand / Example Auction
Gap Resolution / Expert Decision
```

Each human-readable knowledge item should include:

```ts
type BridgeReadableKnowledgeItem = {
  itemId: string;
  systemFamily: "SAYC" | "2_over_1" | "natural" | "custom";
  itemType:
    | "system"
    | "convention"
    | "bidding_rule"
    | "play_rule"
    | "defense_rule"
    | "lead_rule"
    | "carding_rule"
    | "dependency_rule"
    | "conflict_rule"
    | "visibility_rule"
    | "example"
    | "expert_decision";
  title: string;
  humanReadableRule: string;
  structuredFields: Record<string, unknown>;
  sourceIds: string[];
  gapIds?: string[];
  reviewerNotes?: string;
  status: "draft" | "needs_review" | "approved" | "deprecated";
  version: string;
};
```

#### Step 4: Extract Candidate Items from Sources

Use deterministic parsing where possible and LLM assistance where useful. The LLM may propose candidate rules/settings, but those candidates are not published directly.

Candidate extraction should identify:

- rule text
- source passage
- affected bidding sequence or play situation
- convention dependencies
- conflicts
- examples
- assumptions
- missing details

#### Step 5: Create and Maintain the Gap Registry

For each system, the platform should show unresolved gaps such as:

```text
2/1 source explains the convention but not borderline hand treatment.
SAYC source defines a convention but does not map directly to our setting registry.
Beginner version needs a visibility decision.
A rule has no test board yet.
Two sources disagree.
```

Gaps should be resolved through Bridge fellow or expert input. The resolution becomes a human-readable expert decision linked to the generated implementation.

#### Step 6: Human Review and Editing

Reviewers should be able to:

- view the source passage
- view extracted candidate knowledge
- edit the human-readable rule
- add expert/fellow decision notes
- approve or reject the item
- link the item to examples or test boards
- mark unresolved gaps
- create a new version

This review interface is not lesson authoring. It is bridge-system model authoring.

#### Step 7: Generate Implementation Artifacts

After approval, the system should generate or update implementation artifacts:

```text
setting registry entries
configuration package entries
bidding rule package entries
play/defense rule package entries
validator rules
dependency/conflict rules
convention card mappings
test board references
AI player profile defaults
```

Generated artifacts must link back to the approved human-readable knowledge items and source documents.

#### Step 8: Diff, Test, and Publish

Before publication, the reviewer should see:

- what changed in human-readable knowledge
- what generated artifacts changed
- which tests are affected
- which packages will receive a new version
- whether any gaps remain blocking

Then the package can be published as a versioned runtime package such as:

```text
bridge_system_sayc_v1
bridge_system_2over1_v1
bridge_config_registry_v1
```

#### Step 9: Runtime Use and Traceability

When the AI player makes a decision, its trace should be able to point back to:

```text
runtime rule
  -> generated artifact
    -> approved human-readable knowledge item
      -> source document / expert decision
```

This preserves attribution honesty and allows experts to debug the model.

#### Step 10: Ongoing Correction Loop

If reviewers later discover an incorrect or incomplete rule, they should edit the human-readable source-of-truth item and trigger regeneration.

```text
Reviewer edits readable rule
  -> system creates new knowledge item version
  -> generation job updates affected artifacts
  -> tests run
  -> reviewer approves diff
  -> new package version published
```

This prevents bridge knowledge from becoming buried in code that only developers can understand.

### 12.11 Generated Artifact Tracking

Every generated artifact should record its source lineage.

```ts
type BridgeGeneratedArtifact = {
  artifactId: string;
  artifactType:
    | "setting_registry_entry"
    | "bidding_rule"
    | "play_rule"
    | "validator_rule"
    | "convention_card_mapping"
    | "test_board_reference"
    | "ai_player_default";
  generatedFromKnowledgeItemIds: string[];
  generatedFromSourceIds: string[];
  packageId: string;
  version: string;
  status: "draft" | "review" | "published" | "deprecated";
};
```

### 12.12 Separation from Learning Material Creation

This Bridge knowledge model is not the learning course, lesson, or tutorial system. It is the structured bridge-system model used by the runtime and configuration engine.

The same approved bridge knowledge may later support:

- lessons
- tutorials
- explanations
- quizzes
- coaching responses
- practice plans

But those uses are owned by the Learning Platform and Coaching Platform workstreams.


---

## 13. Common Learner Contract, Domain Isolation, and Bridge Learner Model

### 13.1 Purpose

The prototype did not model human player progress and skills. The new implementation should add a bridge-specific learner/player model.

This model should be designed as a **Bridge extension of a reusable common learner/player model contract**, not as a one-off Bridge-only invention. However, the actual skill data, progress history, and dashboards must remain domain-scoped.

The common layer may define shared shapes such as:

```text
learner identity
learning domain
skill reference
concept reference
activity/session reference
progress signal
confidence
timestamp
source event
summary view
```

Bridge contributes bridge-specific data into that pattern:

```text
Bridge domain
  -> bidding skills
  -> play skills
  -> defense skills
  -> convention familiarity
  -> bridge session events
  -> bridge progress signals
```

Brain Bee, MindAI Bee, Dance, Singing, or other systems may later use the same contract shape, but their skill/progress data remains separate.

### 13.2 Critical Domain Isolation Rule

A learner's Bridge skills must have **no implication** for the learner's Brain Bee, MindAI Bee, Dance, Singing, or other domain skills.

The shared learner model provides a reusable structure. It does not merge skills across domains.

Required rule:

```text
Common learner identity is shared.
Domain skill records are isolated.
Domain progress views are isolated.
Cross-domain summaries are optional and explicit, not default.
```

Examples:

- When an LAIC admin opens a learner inside **Brain Bee**, the admin should see Brain Bee course/activity/progress data, not Bridge bidding or play skills.
- When a coach opens a learner inside **Bridge**, the coach should see Bridge bidding/play/defense/convention progress, not Brain Bee material consumption.
- A user can be the same person across the platform, but their domain records are partitioned by `domainId`, `programId`, and access scope.

### 13.3 Recommended Common Contract

The common learner/player model can define reusable contracts such as:

```ts
type CommonLearnerDomainProfile = {
  domainProfileId: string;
  nexusUserId: string;
  domainId: "bridge" | "brain_bee" | "mindai_bee" | "dance" | "singing" | string;
  programId: string;
  organizationScopeId?: string;
  selfDeclaredLevel?: string;
  assessedLevel?: string;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
};
```

```ts
type CommonProgressSignal = {
  progressSignalId: string;
  nexusUserId: string;
  domainId: string;
  programId: string;
  domainProfileId: string;
  activityRefId?: string;
  sessionRefId?: string;
  signalType: string;
  relatedSkillIds: string[];
  relatedConceptIds: string[];
  sourceEventIds: string[];
  confidence: number;
  createdAt: string;
};
```

The common contract is useful because Bridge, Brain Bee, and MindAI Bee can all represent progress signals consistently. But every query and dashboard must filter by domain/program context.

### 13.4 Bridge Learner Profile

Bridge-specific learner profile:

```ts
type BridgeLearnerProfile = CommonLearnerDomainProfile & {
  domainId: "bridge";
  bridgeUserProfileId: string;
  bridgeExperienceLevel?: "new" | "beginner" | "intermediate" | "advanced" | "expert";
  knownSystems: Array<"SAYC" | "2_over_1" | "natural" | "custom">;
  activeLearningSystem?: "SAYC" | "2_over_1" | "natural" | "custom";
  preferredSeat?: "N" | "E" | "S" | "W";
  preferredFeedbackMode?: "none" | "after_hand" | "during_pause";
};
```

The Bridge Platform owns and updates the Bridge learner profile. The common platform may only receive a summarized, domain-labeled profile or progress signal.

### 13.5 Bridge Skill Taxonomy Reference

The Bridge Platform should store bridge skill references, but full learning path design belongs elsewhere.

Initial taxonomy categories:

```text
Bidding
  - hand evaluation
  - opening bid selection
  - response selection
  - opener rebid
  - responder rebid
  - notrump ranges
  - major suit raises
  - minor suit handling
  - competitive bidding
  - preempts
  - slam exploration
  - convention recognition

Play
  - counting winners/losers
  - declarer planning
  - following suit/legal play
  - establishing suits
  - finesses
  - ruffing losers
  - entry management

Defense
  - opening leads
  - second hand play
  - third hand play
  - signals
  - count/attitude
  - defensive inferences

System Familiarity
  - SAYC basics
  - 2/1 basics
  - Stayman
  - transfers
  - weak twos
  - doubles
  - cue bids
```

These skills should be stored with explicit domain scope:

```ts
type BridgeSkill = {
  skillId: string;
  domainId: "bridge";
  category: "bidding" | "play" | "defense" | "system_familiarity";
  name: string;
  description?: string;
  levelBand?: "new" | "beginner" | "intermediate" | "advanced";
};
```

### 13.6 Bridge Progress Signals

Progress signals should be derived from bridge events and marked as Bridge-domain signals.

```ts
type BridgeProgressSignal = CommonProgressSignal & {
  domainId: "bridge";
  bridgeSessionId: string;
  bridgeBoardId?: string;
  seat: BridgeSeat;
  signalType:
    | "correct_action"
    | "questionable_action"
    | "rule_mismatch"
    | "fallback_context"
    | "convention_used"
    | "convention_missed"
    | "illegal_attempt"
    | "repeated_pattern"
    | "improvement_indicator";
  bridgeSystemContext?: "SAYC" | "2_over_1" | "natural" | "custom";
  severity?: "low" | "medium" | "high";
};
```

### 13.7 Evaluation Without Overclaiming

In many bridge positions there may be multiple reasonable actions. Therefore progress extraction should avoid overclaiming.

Use categories such as:

- aligned with configured system
- not aligned with configured system
- legal but questionable
- reasonable alternative
- missed convention opportunity
- unsupported by current learner system
- needs expert review

### 13.8 Mistake Pattern Store

Bridge mistake patterns should also be domain-scoped.

```ts
type BridgeMistakePattern = {
  patternId: string;
  nexusUserId: string;
  domainId: "bridge";
  patternType: string;
  relatedSkillIds: string[];
  relatedConceptIds: string[];
  exampleEventIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  observationCount: number;
  status: "active" | "improving" | "resolved" | "uncertain";
};
```

### 13.9 Dashboard and Access Rules

Every progress dashboard must be opened in a program/domain context.

```text
Bridge progress dashboard
  filter: domainId = bridge
  shows: bridge learner profile, bridge sessions, bridge skills, bridge progress signals

Brain Bee progress dashboard
  filter: domainId = brain_bee
  shows: Brain Bee course/activity progress only
```

A cross-domain learner summary can be built later, but it should be explicit, permissioned, and not part of the default Bridge or Brain Bee experience.


---

## 14. Bridge Evaluator and Constrained Learning Context

### 14.1 Need for a Bridge-Specific Evaluator

BEN should not be the primary evaluation mechanism for learning. The Bridge Platform should provide a rule/config-based evaluator that can judge an action relative to:

- The selected bidding system
- Learner level
- Active conventions
- Lesson/practice constraints if provided later
- Board state
- Multiple reasonable alternatives

### 14.2 Evaluator Output

```ts
type BridgeActionEvaluation = {
  evaluationId: string;
  actionEventId: string;
  evaluatedAction: string;
  evaluationMode: "system_alignment" | "expert_rule" | "learner_level" | "coach_constraint";
  judgment:
    | "aligned"
    | "reasonable_alternative"
    | "questionable"
    | "not_system_aligned"
    | "illegal"
    | "insufficient_context"
    | "needs_expert_review";
  matchedRuleIds?: string[];
  missedRuleIds?: string[];
  relatedSkillIds?: string[];
  relatedConceptIds?: string[];
  confidence: number;
};
```

### 14.3 Separation from Coaching

The evaluator should produce structured judgment. It should not produce learner-facing coaching language.

```text
Bridge Evaluator = what happened and how it compares to system/rules
Coaching Platform = how to explain it to the learner
Learning Platform = which lesson/path this belongs to
```

---

## 15. Data Model

### 15.1 Core Tables

Recommended production database: PostgreSQL.

Core table groups:

```text
Bridge Context
  bridge_user_profiles
  bridge_program_organization_profiles
  bridge_coach_affiliations
  bridge_groups_mirror

Bridge Sessions
  bridge_sessions
  bridge_tables
  bridge_seat_assignments
  bridge_boards
  bridge_position_snapshots
  bridge_events

Players and Configurations
  bridge_ai_player_profiles
  bridge_player_configurations
  bridge_configuration_packages
  bridge_setting_registry_versions
  bridge_convention_cards

Knowledge Ingestion
  bridge_knowledge_sources
  bridge_ingestion_jobs
  bridge_ingestion_intents
  bridge_extracted_rules
  bridge_extracted_settings
  bridge_knowledge_gaps
  bridge_review_items
  bridge_readable_knowledge_items
  bridge_generated_artifacts
  bridge_model_generation_runs
  bridge_published_packages

Learner / Progress
  common_learner_domain_profiles or equivalent shared contract table
  common_progress_signals or equivalent shared contract table
  bridge_learner_profiles
  bridge_skill_taxonomy
  bridge_concept_taxonomy
  bridge_action_evaluations
  bridge_progress_signals
  bridge_mistake_patterns

Imports / Exports
  bridge_imported_files
  bridge_share_links
  bridge_exports
```

### 15.2 Event Table

```sql
create table bridge_events (
  id uuid primary key default gen_random_uuid(),
  bridge_session_id uuid not null,
  bridge_board_id uuid,
  seq integer not null,
  event_category text not null,
  event_type text not null,
  actor_kind text not null,
  actor_id text,
  seat text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (bridge_session_id, seq)
);
```

### 15.3 Configuration Package Table

```sql
create table bridge_configuration_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system_family text not null,
  version text not null,
  status text not null,
  source_knowledge_package_ids jsonb not null default '[]'::jsonb,
  setting_registry jsonb not null,
  rule_package jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
```

### 15.4 Progress Signal Table

```sql
create table bridge_progress_signals (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null default 'bridge',
  program_id uuid,
  bridge_session_id uuid not null,
  bridge_board_id uuid,
  nexus_user_id uuid not null,
  bridge_learner_profile_id uuid,
  seat text,
  signal_type text not null,
  related_skill_ids jsonb not null default '[]'::jsonb,
  related_concept_ids jsonb not null default '[]'::jsonb,
  source_event_ids jsonb not null default '[]'::jsonb,
  severity text,
  confidence numeric not null,
  created_at timestamptz not null default now()
);
```

### 15.5 Knowledge Gap Table

```sql
create table bridge_knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  system_family text not null,
  area text not null,
  description text not null,
  detected_from jsonb not null default '[]'::jsonb,
  severity text not null,
  resolution_status text not null,
  expert_resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 15.6 Human-Readable Knowledge Item Table

```sql
create table bridge_readable_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  system_family text not null,
  item_type text not null,
  title text not null,
  human_readable_rule text not null,
  structured_fields jsonb not null default '{}'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  gap_ids jsonb not null default '[]'::jsonb,
  reviewer_notes text,
  status text not null,
  version text not null,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
```

### 15.7 Generated Artifact Table

```sql
create table bridge_generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null,
  generated_from_knowledge_item_ids jsonb not null default '[]'::jsonb,
  generated_from_source_ids jsonb not null default '[]'::jsonb,
  package_id uuid,
  artifact_payload jsonb not null,
  version text not null,
  status text not null,
  created_at timestamptz not null default now()
);
```

### 15.8 Domain Isolation in Learner Tables

Learner/progress tables must include domain/program scope. Bridge-specific progress data should not be visible in Brain Bee, MindAI Bee, or other domain dashboards unless a separate cross-domain summary feature is intentionally created.

Minimum fields for shared progress records:

```text
domain_id
program_id
nexus_user_id
domain_profile_id
source_session_id or activity_id
signal_type
related_skill_ids
related_concept_ids
created_at
```

For Bridge, `domain_id` is always `bridge`.


---

## 16. API Surface

### 16.1 Nexus Context APIs

Bridge consumes context from Nexus:

```text
GET /api/bridge/context
GET /api/bridge/access
GET /api/bridge/program-organizations
GET /api/bridge/groups
```

If implemented in a single monorepo, these can be internal service functions rather than network calls.

### 16.2 Bridge Runtime APIs

```text
POST /api/bridge/sessions
GET  /api/bridge/sessions/:id
POST /api/bridge/sessions/:id/start
POST /api/bridge/sessions/:id/seat-assignments
POST /api/bridge/sessions/:id/actions/bid
POST /api/bridge/sessions/:id/actions/play
GET  /api/bridge/sessions/:id/events
POST /api/bridge/sessions/:id/replay
POST /api/bridge/sessions/:id/undo
```

### 16.3 Player and Configuration APIs

```text
GET  /api/bridge/player-profiles
POST /api/bridge/player-profiles
GET  /api/bridge/configurations
POST /api/bridge/configurations
POST /api/bridge/configurations/:id/resolve
GET  /api/bridge/configurations/:id/convention-card
POST /api/bridge/configurations/:id/clone
```

### 16.4 Knowledge Ingestion APIs

```text
POST /api/bridge/knowledge/sources
POST /api/bridge/knowledge/ingestion-jobs
GET  /api/bridge/knowledge/ingestion-jobs/:id
GET  /api/bridge/knowledge/gaps
POST /api/bridge/knowledge/review-items/:id/approve
POST /api/bridge/knowledge/review-items/:id/reject
GET  /api/bridge/knowledge/readable-items
POST /api/bridge/knowledge/readable-items
PATCH /api/bridge/knowledge/readable-items/:id
POST /api/bridge/knowledge/generation-runs
GET  /api/bridge/knowledge/generation-runs/:id/diff
POST /api/bridge/knowledge/packages/:id/publish
```

### 16.5 Progress APIs

```text
GET  /api/bridge/progress/me
GET  /api/bridge/progress/users/:userId
GET  /api/bridge/progress/signals
POST /api/bridge/progress/recompute-session/:sessionId
```

All progress APIs must enforce `domainId = bridge` and the relevant Bridge Program Organization/group scope. They should not return Brain Bee, MindAI Bee, or other domain progress.

---

## 17. Implementation Stack Recommendation

### 17.1 Recommended Direction

Use a production-capable TypeScript-first stack that preserves the prototype’s pure TypeScript engine while moving persistence/auth/deployment to a robust platform.

Recommended baseline:

| Layer | Recommendation | Rationale |
|---|---|---|
| Language | TypeScript | Existing prototype alignment; shared engine across web/backend/mobile |
| Web app | Next.js App Router | Product app shell, server APIs, admin UI, React ecosystem |
| Engine package | Pure TypeScript package | Reusable in UI, server jobs, tests, future mobile wrapper |
| Database | PostgreSQL | Durable relational data, JSONB for events/configs, mature operations |
| ORM / migrations | Prisma or Drizzle | Type-safe schema/migrations; choose one and standardize |
| Auth | Shared Nexus auth; Supabase Auth or equivalent if building fast | Email/phone/social auth support; integration with Postgres/RLS possible |
| Real-time session events | In-process event bus first; WebSocket/SSE when multi-client table needed | Avoid premature complexity, but keep interface ready |
| Mobile | Responsive web first; Expo wrapper later | Avoid duplicating bridge engine/UI logic early |
| Testing | Vitest + Playwright | Preserve prototype’s headless engine tests and add UI flows |
| Deployment | Vercel acceptable for web; managed Postgres required; cloud VM/container for BEN | Vercel alone is not enough for database and BEN service |
| BEN service | Separate container/VM/service | BEN requires long-running process/protocol bridge, not just serverless functions |

### 17.2 Deployment Options

#### Option A: Fast Product Path

```text
Next.js on Vercel
Postgres on Supabase / Neon / managed cloud Postgres
BEN on small cloud VM/container
Object storage for uploads/imports
```

Good for rapid product progress.

#### Option B: Cloud-Consolidated Path

```text
Next.js container or app hosting on AWS/GCP/Azure
Managed PostgreSQL on same cloud
Object storage on same cloud
BEN container/VM on same cloud
Background workers on same cloud
```

Good for long-term operational consistency.

#### Recommendation

Start with **Option A** if speed matters, but design the system so the database and BEN service are not tightly coupled to Vercel. Use managed Postgres and clean service boundaries so the product can later move to AWS/GCP/Azure if needed.

### 17.3 Monorepo Structure

```text
apps/
  bridge-web/                 # Next.js Bridge app shell
  bridge-admin/               # optional split later; can start inside bridge-web

packages/
  bridge-engine/              # pure bridge domain engine
  bridge-events/              # event schemas and replay helpers
  bridge-config/              # config registry/resolution/convention card model
  bridge-knowledge/           # ingestion schemas and package builders
  bridge-progress/            # progress signal extraction
  bridge-ui/                  # shared bridge UI components
  nexus-client/               # adapter to Nexus context/services

services/
  ben-service/                # BEN adapter/container bridge
  ingestion-worker/           # structured ingestion jobs
  progress-worker/            # recompute progress/evaluation jobs

prisma/ or db/
  schema
  migrations
```

---

## 18. Build Sequence

No weekly schedule is assumed. The following is a practical sequence for implementation.

### Sequence 1: Establish Bridge App Shell

Deliverables:

- Bridge web app shell
- Auth/context loading from Nexus or stubbed Nexus context
- Navigation layout
- Basic bridge dashboard
- Role-aware menu structure
- Development seed data for LAIC Bridge Program and sample Bridge Program Organization

Acceptance:

- Authorized user can enter Bridge app.
- App knows user role and bridge program organization context.
- Bridge app has stable routing structure.

### Sequence 2: Port and Stabilize Prototype Engine

Deliverables:

- Extract pure bridge engine into package
- Preserve GameState fold
- Preserve Game controller single-writer model
- Preserve bid/play action and logic events
- Preserve deterministic AI player interface
- Preserve format import/export helpers where useful
- Add production TypeScript types

Acceptance:

- Existing headless tests pass or are ported.
- Engine runs outside React.
- A board can be played headlessly by AI players.

### Sequence 3: Persistent Sessions and Event Logs

Deliverables:

- Postgres tables for sessions, boards, tables, events
- Session creation API
- Event append API
- Replay/reconstruct from event log
- Session event viewer

Acceptance:

- A played board can be saved.
- Reloading session reconstructs same state.
- Event log is ordered and replayable.

### Sequence 4: Bridge Table UI

Deliverables:

- Basic table UI
- Human seat prompt
- Legal bid/card selection
- AI seat automation
- Event stream integration
- Resume/replay support

Acceptance:

- Human can sit at a table with AI players.
- A complete board can be bid and played.
- Events are persisted.

### Sequence 5: Configuration and Convention Card

Deliverables:

- Configuration package model
- Initial setting registry imported from prototype where appropriate
- Presets for Beginner Natural, SAYC, 2/1
- Configuration resolver
- AI player profile creation
- Convention card generator

Acceptance:

- User/admin can select a player profile.
- AI behavior uses resolved settings.
- Convention card is generated from settings.

### Sequence 6: BEN as Optional Player

Deliverables:

- BEN adapter retained/refactored from prototype
- BEN availability/health status
- Seat assignment to BEN
- Clear attribution for BEN moves
- Limitations documented in UI/admin

Acceptance:

- BEN can sit as a player when service is available.
- UI gracefully disables BEN when unavailable.
- BEN is not used as primary constrained learner evaluator.

### Sequence 7: Structured Knowledge Ingestion and Bridge Model Creation

Deliverables:

- Source registry for SAYC, 2/1, Natural, expert notes, and prototype-derived artifacts
- Ingestion intent form
- Bridge system schema
- Human-readable Bridge Knowledge Base schema
- Extraction job skeleton
- Candidate rule/setting extraction
- Gap registry
- Expert/fellow review queue
- Human-readable rule editing interface
- Generation job that turns approved readable knowledge into implementation artifacts
- Diff view for generated changes
- Package publication model

Acceptance:

- Authorized reviewer can register a SAYC/2/1 source.
- System can create candidate extracted rules/settings.
- Gaps are tracked rather than silently filled.
- Expert/fellow can edit and approve human-readable bridge knowledge.
- Approved knowledge can generate settings, rules, validators, convention-card mappings, and test references.
- Generated artifacts link back to readable knowledge and source documents.
- Approved package can be versioned/published.
- A reviewer can later change the human-readable source-of-truth item and trigger regeneration.

### Sequence 8: Bridge Learner Model and Domain-Scoped Progress Signals

Deliverables:

- Common learner/progress contract alignment
- Bridge learner profile as a Bridge-domain extension
- Bridge skill/concept taxonomy reference tables
- Domain-scoped progress signal extraction from events
- Action evaluation model
- Bridge-only progress dashboard basic view
- Export/sync interface for future coaching/learning systems with explicit `domainId = bridge`

Acceptance:

- Human Bridge actions create Bridge progress signals.
- System identifies at least basic bidding alignment/mismatch signals.
- Learner progress summary can be generated from Bridge session history.
- Bridge dashboard does not show Brain Bee, MindAI Bee, or other domain progress.
- Brain Bee/MindAI dashboards would not show Bridge progress by default.
- Shared learner identity can exist, but domain skill records remain isolated.

### Sequence 9: Integration Readiness

Deliverables:

- Coaching Platform event subscription interface
- Learning Platform artifact/session linking interface
- Nexus app configuration hooks
- Admin permissions hardened
- Audit logs for configuration/package publication

Acceptance:

- Bridge Platform can run independently.
- Other workstreams can consume Bridge events and progress summaries.
- Bridge app can be embedded/launched from Nexus app shell.

---

## 19. Testing Strategy

### 19.1 Preserve Prototype Testing Spirit

The prototype already had a strong headless testing pattern. Continue that.

Test categories:

- Rule chain tests
- Configuration resolver tests
- Convention card tests
- GameState replay tests
- Event ordering tests
- Undo/replay tests
- Format import/export tests
- BEN adapter contract tests
- Progress signal extraction tests
- Knowledge package validation tests
- UI flows for human table play

### 19.2 Golden Board Tests

Create curated boards for:

- 1-level opening decisions
- 1NT opening and responses
- Stayman
- Transfers
- Major suit raises
- Competitive bidding basics
- Opening leads
- Simple declarer planning
- Simple defensive play

These boards serve both testing and future learning/coaching workstreams.

### 19.3 Expert Review Tests

For each published bridge system package:

- Each setting should be referenced by at least one rule or explicitly marked UI-only.
- Each rule should cite source/expert decision.
- Each rule should have at least one test hand or test sequence when feasible.
- Fallback rate should be measured and reviewed.

---

## 20. AI / LLM Usage Boundaries

### 20.1 Do Not Use LLM as Bridge Decision Engine

Bridge AI player decisions should not be opaque LLM outputs.

Use deterministic rule/config engine for AI player behavior.

### 20.2 Useful LLM Roles

LLM can be useful in structured knowledge ingestion:

- Parse messy documents
- Suggest candidate rules/settings
- Identify ambiguities
- Propose mapping to schema
- Draft gap descriptions
- Summarize expert notes

But humans approve before publication.

### 20.3 Runtime LLM Boundary

For this Bridge Platform workstream:

- LLM is not required for bidding/play decisions.
- LLM is not required for learner coaching responses.
- LLM can assist in admin/review workflows.
- Future Coaching Platform may use LLM to explain Bridge evaluator results.

Safe rule:

```text
LLM extracts and drafts.
Bridge engine decides.
Validators enforce.
Experts approve.
Coach platform explains later.
```

---

## 21. Security and Tenant Isolation

Bridge data must be scoped by Nexus/Bridge Program context.

Key rules:

- A Bridge Program Organization sees its own learners, coaches, sessions, and configurations.
- Independent coaches see their own learners/groups.
- A coach affiliated with multiple organizations must switch context explicitly.
- Shared/published system packages can be global, but private configurations are scoped.
- Session events involving learners are not shared across organizations by default.
- Admin/reviewer access must be permissioned.
- Expert publication actions should be audited.

Data access checks should include:

```text
nexusUserId
programId = bridge_program
programOrganizationId / groupId
role
permission
resource owner/scope
```

---

## 22. Open Design Questions

These do not block starting implementation but should be decided during development.

1. Should Bridge Program Organizations be stored only in Nexus tables with bridge profile extensions, or mirrored into bridge tables for faster queries?
2. Should public/shared AI player profiles be globally visible across Bridge Program, or only copied into organization workspaces?
3. How much of the prototype config registry should be ported directly versus cleaned through the structured ingestion pipeline?
4. Should the first production bridge table support only one human plus three AI players, or arbitrary human/AI seat combinations?
5. Should BEN hosting be attempted early or kept local until core deterministic player/table flow is stable?
6. Should progress signals be computed synchronously during play or asynchronously after the event is persisted?
7. Should convention card exports be PDF early, or only web-rendered at first?
8. Should generated test boards become part of the knowledge package publication workflow?

---

## 23. Recommended First Development Cut

For fastest progress, the first development cut should include:

1. Bridge app shell with Nexus context stub.
2. Pure engine package ported from prototype.
3. Persistent bridge session and event log.
4. Basic web table with one human and three deterministic AI players.
5. Configuration resolver with one or two presets.
6. Convention card generation from selected configuration.
7. Progress signal skeleton from human bid/play events, scoped explicitly to the Bridge domain.
8. Knowledge ingestion admin skeleton with source registry, human-readable knowledge items, gap registry, and generation-run placeholder.

This creates the right foundation for the later app, coaching, and learning workstreams without overbuilding the full ecosystem immediately.

---

## 24. Final Architecture Formula

```text
Nexus Bridge Context
+ Bridge Program Organization Scope
+ Bridge App Shell
+ Pure Bridge Engine
+ Config-Driven AI Player
+ Event-Sourced Game State
+ Human-Readable Bridge Knowledge Source of Truth
+ Generated Structured Knowledge Packages
+ Domain-Scoped Human Player / Learner Signals
+ BEN as Optional Player
= Bridge Platform Foundation
```

The most important implementation rule:

> Keep bridge decisions, bridge state, bridge events, and bridge configuration deterministic, inspectable, replayable, and attributable. Let coaching and learning systems consume that foundation rather than mixing their responsibilities into the bridge runtime.

