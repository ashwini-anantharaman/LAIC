# LAIC Cross-Platform Access Control Manual

## 1. Purpose

This document defines a simple access-control framework that can be used consistently across Nexus, organizations, programs, platform instances, applications, teams, and program participants.

The framework separates **what a platform can control** from **who receives access in a particular program**:

- Platform and application developers publish capability catalogues.
- Nexus provisions organizations and program-level service instances.
- Organization and program administrators define teams, roles, assignments, direct grants, and delegated administration.
- Applications and backend services enforce the resulting capabilities.

The framework is grant-only in v1. There are no explicit deny rules.

## 2. Core hierarchy and isolation

Nexus is the top-level system. It provisions organizations such as Life in AI Center.

Each top-level organization is a full data and administration silo. A user operating inside one organization receives no access to another organization unless cross-organization sharing is explicitly introduced later.

Within an organization:

```text
Organization
  └── Program
        ├── Platform instance(s)
        ├── Application instance(s)
        ├── Program team(s)
        ├── Program participants
        └── Optional program-specific units in future
```

Example:

```text
Life in AI Center
  └── Bridge Program
        ├── Bridge Platform
        ├── Bridge Learning Platform
        ├── Bridge Coaching and Playing App
        ├── Bridge Program Team
        └── App participants
```

Teams may exist at Nexus, organization, program, platform-instance, or team scope. In v1, a team is a simple group of users; teams are not nested.

## 3. Main concepts

### Capability

A capability is an atomic action that code can check, such as:

- `learning.object.create`
- `bridge.cp.test`
- `bridge.table.play`

Capabilities are the authoritative enforcement keys. They are not limited to screens or navigation.

### Capability catalogue

A platform or application publishes a versioned catalogue containing:

- atomic capabilities;
- protected resource types;
- optional UI surfaces mapped to capabilities;
- groups used to organize the role-management UI;
- optional sample role templates.

A platform developer owns the catalogue for that platform. Program administrators cannot invent new capability ids; they can only grant capabilities published by provisioned catalogues.

### UI surface

A UI surface is an optional mapping from capabilities to a navigation item, screen, component, or action. It is useful for rendering the correct UI, but it is not the security boundary.

Examples include:

- a sidebar item;
- a full screen;
- an embedded Bridge table component;
- a button inside a component;
- a “Why this move?” action.

A capability may have no UI surface at all. For example, access to a protected deal collection can be checked only by an API.

### Platform instance

A platform instance is a provisioned use of a platform within a scope.

Examples:

- Bridge Platform under Bridge Program;
- Bridge Learning Platform under Bridge Program;
- Brain Bee Learning Platform under Brain Bee Program.

Each instance receives an enabled subset of the platform catalogue. Program roles can combine capabilities from multiple platform instances.

### Role

A role is a named set of grants defined at a scope. A Bridge Program role may combine Bridge Platform and Bridge Learning Platform capabilities.

Roles are the normal way to manage access.

A role-management screen may offer convenient labels such as **view**, **contribute**, or **manage**, but saved policy should resolve those choices to atomic capability ids. The atomic capabilities remain the stable contract used by UI and backend code.

### Direct grant

A direct grant assigns capabilities to one user or team without creating a new role. Direct grants should be used for exceptions, temporary responsibilities, or specialized access.

### Team

A team is a scoped group of users. A role may be assigned to a team, causing all current team members to receive that role in the role’s scope.

The same user may belong to different teams at Nexus, organization, and program levels. Those memberships remain separate.

### Gate

A gate is a controlled path by which a person becomes a member or participant in a scope.

Examples:

- mobile or web app signup;
- invitation;
- administrator-created account;
- future bulk import.

A gate defines the target scope, membership type, approval mode, and optional default role. It does not create capabilities outside the program policy.

The Bridge app signup gate creates program participants under Bridge Program. Those participants are distinct from the Bridge Program team that develops the platform, content, CPs, and learning experiences.

## 4. Ownership by layer

### Nexus

Nexus owns:

- organization provisioning;
- organization isolation;
- scope identifiers and hierarchy;
- users and memberships;
- generic teams;
- role and grant storage;
- delegation records;
- gate registration;
- access-context delivery;
- generic policy validation.

Nexus does not define Bridge or Learning capabilities.


### Reserved access-framework capabilities

Nexus uses a small reserved `access.*` namespace for administration of the access system itself. Initial keys used by the example policy are:

- `access.team.manage`
- `access.role.manage`
- `access.role.assign`
- `access.direct_grant.manage`
- `access.member.assign_role`
- `access.gate.manage`
- `access.delegate`

These keys govern policy administration; they do not replace capabilities published by Learning, Bridge, or application catalogues.

### Platform and application developers

Each platform or application owns:

- its capability catalogue;
- its protected resource types;
- optional UI-surface mappings;
- capability checks in frontend components;
- capability checks in backend APIs and services;
- catalogue versioning and migration.

Applications may publish their own capabilities when they provide functionality that does not belong to a reusable platform.

### Organization and program administrators

Administrators own live policy for their scope:

- teams;
- role definitions;
- role assignments;
- direct grants;
- gate policies;
- explicit delegation to lower scopes;
- enabled capabilities for provisioned instances, within what was delegated to them.

A platform instance does not require a separate team. For example, the Bridge Program team can manage both Bridge Platform and Bridge Learning Platform. A platform-specific team can be added later when useful.

## 5. Scope and explicit delegation

Role assignments and direct grants can be defined at:

- Nexus;
- organization;
- program;
- platform instance;
- team.

A future `program_unit` scope is reserved for a delegated or white-labeled branch inside a program.

Access does not automatically inherit downward. Administrative authority must be explicitly delegated.

Examples:

- Nexus provisions Life in AI Center and appoints its administrator.
- The organization administrator creates Bridge Program and appoints a Bridge Program administrator.
- The Bridge Program administrator delegates participant onboarding to the Bridge App Operations team.

Delegation is grant-only and limited to the named scope, system capabilities, and optional platform instances.

## 6. Roles across multiple platform instances

A role may contain several grant blocks. Each block targets one provisioned instance.

Example:

```json
{
  "id": "bridge-expert",
  "grants": [
    {
      "platformInstanceId": "bridge-core",
      "capabilityIds": ["bridge.knowledge.review", "bridge.cp.test"]
    },
    {
      "platformInstanceId": "bridge-learning",
      "capabilityIds": ["learning.object.read", "learning.review.comment"]
    }
  ]
}
```

This allows the Bridge Program to define one coherent team and role structure without requiring an isolated team for each platform instance.

## 7. Resource-specific access

A capability can optionally be restricted to selected resources or simple positive filters.

Examples:

- only selected learning-object types;
- only a named course or collection;
- only permitted deal collections;
- only approved CPs;
- only selected Sandboxes.

The framework supports `includeIds` and simple `filters`. It intentionally avoids a complex policy language in v1.

## 8. Program participants and app gates

Program team members and app participants are different membership categories:

- **Team members** build, administer, review, teach, or operate the program.
- **Program participants** enter through an app or another program-facing gate and use the experiences made available to them.

The Bridge app signup flow should:

1. authenticate or create the user;
2. create a Bridge Program participant membership;
3. assign the gate’s default participant role, when configured;
4. load the user’s effective access;
5. show only permitted app functionality, learning content, CPs, Sandboxes, sessions, and resources.

Future commerce or entitlement systems can add or remove grants through the same access-policy interfaces. Purchase modeling is intentionally outside this v1 specification.

## 9. Runtime resolution

Effective access is computed as the union of positive grants available to the subject in the active scope:

```text
Role grants assigned directly to the user
+ Role grants assigned to the user’s teams
+ Direct user grants
+ Direct team grants
= Candidate capability set
```

The candidate set is then limited by:

- the active organization silo;
- the active scope;
- the enabled capabilities of the provisioned platform instance;
- any resource constraints attached to the grant;
- explicit delegation boundaries for administrative actions.

There are no deny rules in v1.

## 10. UI and backend enforcement

The frontend uses capabilities to:

- build navigation;
- show or hide screens;
- enable or disable components and actions;
- select the correct role-specific experience.

The backend must independently resolve and enforce the same capability before performing an action or returning protected data.

Hiding a button or sidebar item is not security.

Every protected API should check:

```text
user + active organization + active scope + platform instance + capability + resource constraint
```

## 11. Catalogue and policy versioning

Capability ids are stable contracts between catalogues, role policies, UI code, and backend services.

When a platform changes a catalogue:

- add new capability ids without reusing old ids;
- deprecate rather than silently repurpose an existing id;
- increment the catalogue version;
- validate provisioned instances and roles against the new version;
- provide a migration when a capability is replaced or split.

Program policies reference a specific catalogue version for each platform instance.

## 12. Files in this package

- `laic-access-control.schema.json` — common schema for capability catalogue and access-policy documents.
- `learning-platform-access-catalogue.v1.json` — proposed Learning Platform catalogue.
- `bridge-platform-access-catalogue.v1.json` — proposed Bridge Platform catalogue.
- `bridge-program-access-policy.example.json` — example Bridge Program teams, roles, direct grants, delegation, and gates across Bridge Platform and Bridge Learning Platform.

## 13. Recommended v1 implementation order

1. Validate and publish platform capability catalogues.
2. Store scoped teams, roles, role assignments, and direct grants in Nexus.
3. Provision platform instances with enabled capability subsets.
4. Implement a server-side effective-access resolver.
5. Enforce capabilities in backend APIs.
6. Use the same resolved context for role-aware UI rendering.
7. Implement gates for invitations and Bridge app participant signup.
8. Add audit logging for role, grant, delegation, and gate changes.
