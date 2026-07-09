# @laic/learner-contracts

Shared, **types-only** TypeScript contracts for the LAIC / MindBrainAI Nexus platforms:

| Type | Source document |
|---|---|
| `PlatformContext` | `Shared_Data_Model_and_API_Contract_v1.md` §2.4 |
| `PlatformEventEnvelope<TPayload>` | `Shared_Data_Model_and_API_Contract_v1.md` §11 |
| `CommonLearnerDomainProfile` | `learner-model-architecture-context.md` §3.1 |
| `CommonProgressSignal` | `learner-model-architecture-context.md` §3.1 |
| `NexusBridgeContext` | `Bridge_Platform_Implementation_Plan_v2.md` §3.3 |

## Why this exists

Every domain platform (Bridge, Brain Bee, MindAI Bee, ...) extends the common
learner shapes with domain-specific fields while keeping skill/progress data
**isolated per domain** (shared identity, isolated domain records). The shapes
here are transcribed from the shared architecture docs so all workstreams
represent progress, events, and context consistently.

## Ownership and change policy

These contracts are conceptually owned by the **Coaching/Common platform**
workstream. They were created here by the **Bridge Platform** workstream out of
necessity (bridge types extend them and no shared package existed yet).

- The Coaching/Common workstream is invited to adopt or take over this package.
- **Changes require cross-workstream agreement** — these shapes are consumed by
  Bridge and intended for Learning/Coaching. Do not edit field shapes without
  checking the source documents and notifying consuming teams.
- The source documents in `laicdocs/` are authoritative on any conflict.

## Usage

Types-only (zero runtime code, zero dependencies). Consume the TypeScript
source directly:

```ts
import type {
  CommonLearnerDomainProfile,
  CommonProgressSignal,
  NexusBridgeContext,
  PlatformContext,
  PlatformEventEnvelope,
} from "@laic/learner-contracts";
```

From a pnpm workspace elsewhere in this repo, add a `link:` dependency, e.g.
(from `Applications/BridgePlatform/packages/<pkg>`):

```json
{ "dependencies": { "@laic/learner-contracts": "link:../../../../Components/laic-learner-contracts" } }
```

## Verify

```sh
pnpm install && pnpm typecheck
```
