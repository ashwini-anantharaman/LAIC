# Coach Integration Plan v2

**Status:** Phases 0–5 built (2026-08-02) — see §12 for what actually landed and
what the estimates got wrong. Phases 6–8 outstanding. **Supersedes
`Coach_Integration_Plan_v1.md`**, which stays for its verified inventory of what
exists (§1 there is still accurate).

**Why there is a v2.** v1 was written with bridge as the first *and only*
consumer. It protected the component boundary — host adapters host-side, no
bridge imports in `platform/*` — but nothing in it was *driven* by requirement 5.
It didn't block reuse; it just never designed for it. The differences are listed
in §11. If you only read one new section, read **§1** and **§3**.

Owner's five requirements, restated:

1. The coach reads the learner's **level and current content** from the learning platform.
2. The coach **listens to table events** and makes suitable suggestions.
3. The coach has **access to the knowledge base** of the thing it coaches.
4. The coach is **configurable** — beginner / intermediate / advanced / socratic, etc.
5. The coach is a **packaged component**, usable across platforms, with its own **access catalogue**.

---

## 0. What I think of the five requirements

| # | Verdict | The real work |
|---|---|---|
| R1 | **Blocked, not hard.** The shape exists (`LearnerDomainProfile`); nothing fills it, and "what they're looking at right now" isn't modelled anywhere. | Define one pull port. The *adapter* waits on somebody owning BKT/mastery with an HTTP surface — today nobody does. Not in the first slice. |
| R2 | **The one genuinely new piece of logic.** Listening is solved (`EventSource`). | Producing a **verdict for the learner's own action**. Robot actions already carry `reason` / `rejected[]` / `citedSettings` / `matchedRuleId`; a human call records `reason: "human action"` and nothing else. The evaluator is the KB decider run in *ask* mode, compared against what the learner did. |
| R3 | **Port exists, adapter doesn't.** Nothing in `domains/bridge` imports `@bridge/kb`. | An adapter, plus a design call: the KB (*what the system does*) and teaching chunks (*how to explain it*) are different kinds of knowledge. Compose them, keep provenance, don't merge them. |
| R4 | **Already done.** `CoachingPolicy` has 7 intervention modes, `feedbackStyle` including `socratic`, hint ladder, layered resolution with locked fields. | Four named presets and a switch. **Do not add a `mode: "beginner" \| "advanced"` enum** — that's a second vocabulary that will disagree with the first. |
| R5 | **The catalogue is the easy half.** `CoachCapabilityScope` is already an access catalogue in all but name — 15 booleans, structurally enforced. | The package itself isn't multi-consumer-shaped yet (§3), and nothing carries tenancy. Those block "usable across platforms"; the JSON document doesn't. |

**Two constraints that override convenience:**

- **The coach never blocks a commit.** A coaching turn must never sit in the path
  of committing a bid. Deterministic, time-budgeted, failures logged and swallowed.
- **One writer of mastery.** Two systems computing mastery will diverge and then
  nobody can say what the learner knows. The coach owns it until Owlwise exists,
  then becomes a reader — by config, not surgery.

---

## 1. The reuse constraint (what v1 missed)

R5 is not "put it in a package". It's already a package. R5 is: *the contracts
must be designed against more than one consumer, or they'll fit exactly one.*
So name the consumers up front and design against all three.

| # | Consumer | Runtime | Has | Lacks | Needs from the coach |
|---|---|---|---|---|---|
| **C1** | `apps/bridge-web` | Next server (Node) | session record, compiled KB, Nexus identity, Postgres | — | in-process library, live table coaching |
| **C2** | `bridge-coach-app` | Expo / RN, no server | a screen | any server, any DB, any Node module | **HTTP** — it cannot import a package that reads Postgres |
| **C3** | `laic-learning-platform` | Vite SPA | course content, quizzes | a game, a KB, bridge anything | a **non-bridge domain** (`domains/course_learning/` already exists) |

Three facts fall out of that table, and they are the whole reason for v2:

1. **C2 is already served, by accident.** The mobile app renders the table by
   launching bridge-web in a WebView (`BRIDGE_LAUNCH_URL_OVERRIDE` in
   `Applications/bridge-coach-app/lib/config.ts`). So C2 gets coaching for free
   the moment C1 has it. *This is what makes "in-process first" defensible* —
   not the argument v1 gave. The forcing function for a service is C2 going
   native, or C3.
2. **C3 is what makes the contract generic.** Any seam that only makes sense with
   an auction in it is a bridge feature wearing a component's clothes. The test
   for every new type below: *does this still make sense for a quiz?*
3. **Learner state is per-host under in-process.** C1's copy of bridge mastery is
   invisible to C3's copy. Acceptable while C1 is the only writer; it is the
   thing that will eventually force the service — and it should force it, rather
   than us building the service pre-emptively.

### The generic host contract

v1 wrote the seams as BR1–BR9, in bridge vocabulary. The host-shaped version is
**six seams**, and a host is anything that supplies them:

| Seam | Direction | Status |
|---|---|---|
| **Identity + context** — who, in which org/program/domain | host → coach | `PlatformContext` exists in `@laic/learner-contracts`; **nothing threads it** |
| **Events** — what just happened | host → coach | `EventSource` / `ActivityEvent` — exists |
| **Verdicts** — was that action right, and by what authority | host → coach | **new port.** The host evaluates; the coach never re-implements domain rules |
| **Knowledge** — what may be said, and cited | host → coach | `KnowledgeSource` + 4 adapters — exists |
| **Learner context** — level, current focus | host → coach | **new port** (R1) |
| **Notes** — what the coach said, persisted and rendered | coach → host | **new contract** (see §2) |

Only two are new, plus one contract. Everything else is wiring.

---

## 2. Contracts to write before any wiring

These live in the **component**, in `contracts/` with JSON schemas alongside the
existing nine, generated into `contracts/generated/`. That is the difference
between a shared contract and a host convention.

### 2.1 `CoachNote` — moves into the component

v1 put `CoachNoteRecord` in bridge-web. That was the concrete mistake: three
hosts would invent three shapes and there'd be no shared answer to "what was
this learner told". The component emits it; hosts persist and render it however
they like.

```ts
type CoachNote = {
  schemaVersion: string;
  noteId: string;
  context: PlatformContext;          // org/program/domain scoping, free in-process
  learnerId: string;
  /** the host action this is about — opaque to the coach (bridge: event seq) */
  anchorId: string;
  kind: "hint" | "nudge" | "question" | "explanation";
  headline: string;
  detail?: string;
  citations?: { label: string; sourceId?: string; href?: string }[];
  policyVersion: string;             // which policy produced it
  profileId?: string;
  createdAt: string;
};
```

`anchorId` is the generalisation that matters: bridge uses the event `seq`, a
quiz uses a question id. The component must not know which.

The existing `CoachStrip` note shape (`source`, `headline`, `detail`,
`citations`) is already a near-superset of this minus `source`, which is a host
rendering concern. Mapping is trivial and stays host-side.

### 2.2 `VerdictSource` — the host is the evaluator

```ts
interface VerdictSource {
  evaluate(event: ActivityEvent<unknown>, state: unknown): Promise<EvaluationResult | null>;
}
```

`EvaluationResult` already exists and is already domain-free (`Correctness`,
`Severity`). This port just names the rule that v1 stated in prose: **the coach
never re-implements the domain's rules.** Bridge supplies verdicts from the KB
decider; a quiz supplies them from its answer key. `null` = no verdict available,
coach stays silent.

### 2.3 `LearnerContextSource` — R1

```ts
interface LearnerContextSource {
  profile(learnerId: string, domainId: string): Promise<LearnerDomainProfile | null>;
  currentFocus(learnerId: string): Promise<{
    objectId: string; title: string; conceptIds: string[]; skillIds: string[]; startedAt: string;
  } | null>;
}
```

Symmetrical with `KnowledgeSource`. Two adapters: a null/static one (so hosts
work without a learning platform) and an HTTP one (deferred — see §10).

**Read-only, with a cache and an explicit staleness window. Never a sync.**

### 2.4 `PlatformContext` on everything

Thread it through `ActivityEvent`, `CoachNote`, and observations **now**. It is
types-only and costs nothing in-process. Threading it later means touching every
call site *and* every stored record. This is how in-process-first avoids
becoming a corner: the tenancy *shape* lands early, the tenancy *enforcement*
lands with the service.

---

## 3. Package hygiene — required by R5, verified today

Three concrete defects. All three are things consumers pay for.

**3.1 The root export force-registers bridge.** `index.ts:15` does
`import "./domains/bridge/coaching/register.js"` for side effect, and
`register.ts` constructs a `LocalDoubleDummyOracle` — a double-dummy solver. So
C3 (a course-learning host that has never heard of bridge) drags the bridge
domain and the DDS solver into its graph by importing `@laic/coach`.

*Fix:* split entrypoints.

| Entry | Contents |
|---|---|
| `@laic/coach` | core only — runtime, ports, policy, learner model, contracts. No domain. |
| `@laic/coach/domains/bridge` | side-effect registration + bridge exports |
| `@laic/coach/domains/course-learning` | ditto |
| `@laic/coach/service` | the express service (see 3.2) |

with matching `./source` variants, because consumption is via `transpilePackages`
on TypeScript source (§5).

**3.2 `better-sqlite3` (native) and `express` are hard `dependencies`.** Verified
that only `platform/storage/sqlite.ts`, `api/coachService.ts`,
`domains/bridge/api/*` import them, and none is in the embed graph. Every
consumer still installs them; a native module in a Vercel build for code that
never runs is a real cost. *Fix:* `optionalDependencies`, or move the service to
its own package. `tsx` in `dependencies` is the same problem — it's a dev tool.

**3.3 `exports` has only `.` and `./source`.** Needs the per-entrypoint map from
3.1 or the split is unenforceable.

Doing this in Phase 0 rather than "later" matters because C1's import spike will
hit 3.2 anyway.

---

## 4. Where each piece is allowed to live

Unchanged from v1 §3b — the boundary holds today (`platform/*` names bridge only
in doc comments; `domains/bridge/*` imports no `@bridge/*`, no Next, no
Postgres) and this integration must not be what breaks it.

| Zone | Knows about | Must never know |
|---|---|---|
| `platform/*` | coaching, learners, knowledge, policy — no domain | any game, any app |
| `domains/bridge/*` | bridge **as a game**: auctions, contracts, cards | session records, Nexus identity, Postgres, Next, `@bridge/*` |
| `apps/bridge-web/lib/coach/*` | **this application**: `bridge_kb_sessions`, the compiled KB store, Nexus context, persistence | — (it may import the component) |

**The test when unsure:** *would this code still make sense if bridge were played
in a different app?* Yes → `domains/bridge`. If it names `bridge_kb_sessions`,
`nexusUserId`, or imports `@bridge/kb` → host.

One structural fact this settles: `@laic/kb-core` and `@laic/library-core` live
in `Applications/BridgePlatform/packages/`, a different package tree from
`Components/`. So the KB-backed `KnowledgeSource` adapter **must** be host-side.
That's not a preference, it's the dependency graph.

---

## 5. Deployment: one composition root, two ways to run it

v1 said "in-process first, HTTP when a second host needs it" — which is a promise,
not a design. The version that makes it true:

> **One `buildCoachRuntime(deps)` function is the composition root. C1 calls it
> in-process. `api/coachService.ts` calls the same function behind HTTP.**

Then in-process vs service is a deployment choice, not a rewrite, and the only
thing the service adds is auth + tenancy enforcement — half of which §2.4
already lands.

**Consumption pattern for C1:** the one already proven by `@laic/learner-contracts`
— a `link:` dependency plus `transpilePackages`, importing `@laic/coach/source`
so Next transpiles the TypeScript directly and there is no build step.

Two risks that the Phase 0 spike exists to settle, not discover later:

- The coach's relative imports carry `.js` extensions (NodeNext). Webpack may
  need `resolve.extensionAlias`. `@laic/learner-contracts` does **not** prove
  this works — it is types-only, so nothing is ever resolved at runtime.
- `link:` does not install the target's dependencies, and
  `Components/generalizable-coach/node_modules` will not exist on Vercel. §3.2
  is the fix; the spike is the proof.

*Fallbacks if the spike fails:* build `dist` in the deploy step, publish the
package, or fall back to the HTTP service earlier than planned.

---

## 6. Build order

Each phase has an acceptance test, because "done" on a contract phase is
otherwise unfalsifiable.

### Phase 0 — package hygiene + import spike
Do §3 (entrypoint split, dep reclassification) and prove the import in the same
pass. One server-side import of the core in bridge-web rendering a hardcoded
note into the strip.

*Accept when:* bridge-web builds **on Vercel** (not just locally) with the coach
imported; `better-sqlite3` is not in bridge-web's resolved runtime graph; the
`.js`-extension question is answered yes or no in writing.

### Phase 1 — contracts, component-side, nothing wired
`CoachNote` schema + generated type; `VerdictSource`; `LearnerContextSource`;
`PlatformContext` threaded through `ActivityEvent` / `CoachNote` / observations.

*Accept when:* `contracts:gen` is clean, `typecheck` and `vitest` pass, and a
grep proves no `platform/*` file imports a domain.

### Phase 2 — the judgment mapping and the verdict producer
The hard phase. Two pieces:

- **The mapping table, written once:** bridge's `aligned` /
  `reasonable_alternative` / `questionable` / `not_system_aligned` → the coach's
  `correct` / `acceptable` / `suboptimal` / `incorrect`. Game-level vocabulary,
  pure function → `domains/bridge`.
- **The verdict producer:** run the KB decider in *ask* mode (decide without
  committing) and compare with what the learner did. Reads the compiled KB and
  the session → **host**. This is the single most important piece of new logic
  in the whole integration.

**Deterministic only. No LLM in the commit path.** `HeuristicLLM` /
`withOfflineFallback` exist for exactly this; LLM phrasing becomes an opt-in
"explain more", never a blocker on committing a bid.

*Accept when:* a fixture board's human call produces the right verdict without a
network call, and a robot call's recorded verdict maps identically.

### Phase 3 — host adapters, all in `apps/bridge-web/lib/coach/`
| File | Job |
|---|---|
| `activityEvents.ts` | bridge event → `ActivityEvent` + `PlatformContext` |
| `verdicts.ts` | the Phase 2 producer, as a `VerdictSource` |
| `knowledge.ts` | `KnowledgeSource` over the compiled KB via `@laic/kb-core`'s scope envelope, composed with teaching chunks (`MultiScopeKnowledgeSource` already exists for this) |
| `policy.ts` | resolve the layer stack → `CoachingPolicy` |
| `notes.ts` | persist `CoachNote` on the session record; the undo rule |
| `session.ts` | build the coach session, cached per compileId like the KB cache |

**Provenance survives to the note.** A coach note must be able to cite the actual
rule the robots played by — that citation is the product's whole claim.

### Phase 4 — the run point
In the same server path that commits an action, **after** persistence:
deterministic, time-budgeted, failures logged and swallowed. Notes stored on the
session record (already jsonb, already read by the page, inherits org/program
scoping free), keyed to the action's `seq`, as a **sibling array — not as engine
events**: the action/logic stream has a single writer and undo pairs by `seq`.
Undo rule: drop notes whose `seq >= droppedSeq`.

*Accept when:* a coach that throws costs the learner nothing, proven by a test
that makes it throw.

### Phase 5 — render
Map stored `CoachNote` → the strip's `CoachNote`. Mostly done; the strip is
phone-only by owner decision and stays that way.

### Phase 6 — the four presets + the ☰ switch
Beginner / intermediate / advanced / socratic as named `CoachingPolicyProfile`
presets setting existing fields. **Shipped from the component**, next to
`bridgeBeginnerPreset()` in `platform/studio/presets.ts` — if they live in
bridge-web, C3 doesn't get them and R4 is a bridge feature.

Layer stack, built so a subscription tier inserts later without touching call
sites: platform default → program profile → *(future: subscription tier)* →
learner preference → session override. `resolvePolicy` already supports this.

### Phase 7 — `coach.json` access catalogue
Map **1:1 onto `CoachCapabilityScope`** — 15 capabilities, ids like
`coach.hint.generate`, `coach.answer.direct`, `coach.postmortem.generate`. Do not
invent a second vocabulary.

**Authored in the component, registered by the platform**, following the library
precedent (the owner's correction there was that the catalogue belongs to the
component, not the consuming platform). So it ships from
`Components/generalizable-coach/` and Nexus registers it the way it surfaces
`library.json`.

### Phase 8 — the reuse proof
**Not optional if R5 is real.** Wire `domains/course_learning/` (it already
exists) into a second host — the learning platform's quiz view, or failing that a
standalone script — through the same six seams, and confirm zero bridge code in
the path.

*Accept when:* the second host runs a coaching turn and `npm ls` /
bundle inspection shows no `domains/bridge` in its graph.

Until Phase 8 passes, R5 is an assertion. This is the phase v1 didn't have, and
its absence is exactly what "designed for one consumer" looked like.

### Deferred, deliberately
`LearnerContextSource` HTTP adapter (blocked — §10), Postgres `LearnerRepo`,
LLM phrasing, postmortems, the HTTP service and its auth.

### The thinnest useful slice
Phases 0–5. After you bid, the strip tells you whether the system agreed and
why — your call evaluated against the KB decider, cited to the rule. No LLM, no
learner model, no new service, no learning-platform dependency.

---

## 7. Mastery — what it is, and what blocks it

**The model.** Per skill, per domain: a five-rung ladder
(`not_started → introduced → practicing → proficient → mastered`) computed by
`computeMastery` in `platform/learner-model/LearnerStore.ts` from three counters
— `exposureCount`, `correctCount`, `mistakeCount`. Thresholds: 3+ exposures →
practicing; 10+ at >70% → proficient; 20+ at >90% → mastered. **Monotonic — it
never regresses.**

**It is not BKT.** Bayesian Knowledge Tracing carries a probability of knowing
with learn/slip/guess parameters. This is a counter ladder. When Owlwise arrives
these are different *kinds* of quantity, not two estimates of one — the
projection onto the contract's 0–1 field is lossy. Know that before anyone
compares numbers.

**The handover switch already exists.** `LearnerStore.setExternalMasteryDomains([...])`
makes `updateSkillState` a no-op for a domain, precisely so the coach cannot
advance a second divergent record once a host owns it. Nothing needs building for
the eventual handover except the read port (§2.3).

**Two things block bridge mastery today, neither the coach's fault:**

1. **Nothing can key it.** Mastery is per `skillId`. `@bridge/taxonomy` defines
   them (`sk_opening_bid_selection`, `sk_response_selection`,
   `sk_declarer_planning`, … with level bands) but **nothing imports it**, and
   compiled KB rules carry no `skillId`. An evaluated action cannot say which
   skill it exercised.
   *Cheapest fix:* map the engine's own `AuctionContext` (opening / response /
   rebid / overcall — `matchContext` already computes it) onto the taxonomy's
   bidding skills. They line up almost one-to-one and it needs no re-authoring.
   Attaching skill ids to rules is the better long-run answer but touches every
   item.
2. **Nothing persists it.** `LearnerStore` defaults to `InMemoryLearnerRepo`.
   In-process on serverless, that means mastery lives for one request.

**Consequence:** mastery is not in the first slice, and that's a finding rather
than a preference — the ids to key it by don't exist yet. Within-board coaching
needs none of it.

**One product question to settle before it ships:** monotonic mastery means a
learner who masters a skill then stops for six months is still "mastered", and
the coach keeps pitching there. Fine for v1 — but decide it deliberately.

---

## 8. Risks

| Risk | Phase | Mitigation |
|---|---|---|
| `link:` + NodeNext `.js` imports don't resolve under webpack | 0 | spike first; fallbacks in §5 |
| Native dep breaks the Vercel build | 0 | §3.2 before anything else |
| Verdict producer is slow (KB decide in the commit path) | 2/4 | run after persistence, time-budgeted, swallow on timeout |
| Coach notes desync from the event stream on undo | 4 | drop by `seq`; test undo explicitly |
| Presets drift into a second mode vocabulary | 6 | presets *are* policy profiles; no new enum, reviewed as such |
| R5 stays an assertion | 8 | Phase 8 is the acceptance test, not a nice-to-have |

## 9. Open questions

1. **Who owns BKT/mastery, and does it have an HTTP surface?** If nobody, R1's
   adapter is blocked and the coach keeps owning bridge mastery (decided
   2026-08-02) — which is fine, but it should stay a conscious decision.
2. **Does C3 (learning platform) actually want coaching, and on what?** Phase 8
   needs a real target. A script proves the graph is clean; only a real host
   proves the contract is right.
3. **Locked fields:** should a coach be able to lock "no direct answers" for a
   class? `resolvePolicy` supports it; nobody has decided who may.

## 10. Decisions carried forward (owner, 2026-08-02)

1. **No mastery/BKT service exists yet** → the coach owns the bridge-domain
   learner model for now; the read port still gets defined so the switch is
   config, not surgery. R1 is not in the first slice.
2. **In-process**, via `link:` + `transpilePackages` + `@laic/coach/source`.
   v2 adds: behind one composition root, so the service is a deployment choice.
3. **Coaching notes persist**, on the session record, keyed to the action's
   `seq`, as a sibling array. v2 adds: the *shape* is a component contract.
4. **Mode ownership:** learner-chosen after subscribing, but far ahead. For now a
   program default plus a table-level override in the ☰, with the layer stack
   built so a subscription tier inserts later.

## 11. What changed from v1

| v1 said | v2 says | Why |
|---|---|---|
| bridge is the consumer; ports make a second one cheap later | three named consumers (C1/C2/C3), contracts designed against all three | "cheap later" was a promise with no test behind it |
| `CoachNoteRecord` is a bridge-web storage shape | `CoachNote` is a component contract with a schema | three hosts would invent three shapes |
| BR1–BR9, in bridge vocabulary | six generic seams; BR1–BR9 becomes bridge's *instance* of them | a seam that needs an auction in it isn't a component seam |
| tenancy deferred until the service | `PlatformContext` threaded now, enforced with the service | threading it later touches every call site *and* every stored record |
| in-process vs HTTP is a fork | one composition root, two run modes | otherwise B is a rewrite, not a choice |
| package shape not examined | §3: root export drags bridge + a DDS solver into every consumer; native deps are hard deps | verified 2026-08-02; these are the actual R5 blockers |
| presets unplaced | presets ship from the component | in bridge-web, R4 is a bridge feature |
| (no equivalent) | **Phase 8, the reuse proof** | without it R5 is unfalsifiable |

---

## 12. Implementation log — 2026-08-02

**Goal for the day:** the coach appears on the bridge app and reads the table's
events. Done, deterministically and with no LLM, over the auction.

### What the plan got wrong

Phase 0 was estimated at "half a day, two known risks". Both risks were real,
and there was a third the plan hadn't seen:

1. **The ajv trap (unforeseen).** Seven `platform/*` modules imported one
   constant, `CONTRACTS_SCHEMA_VERSION`, through `contracts/index.ts` — which
   re-exports the runtime validator, which loads ajv and does a `readdirSync` of
   `contracts/schemas/` **at module load**. A bundler does not copy that
   directory, so the coach could not be imported at all. Fixed by giving the
   constant its own dependency-free module (`contracts/version.ts`), re-exported
   from both old homes so nothing else changed.
2. **The `.js` extension risk (foreseen, and worse than expected).** The plan
   guessed webpack's `resolve.extensionAlias` would fix it. Next 16 builds with
   Turbopack, which ignores `experimental.extensionAlias` — verified by trying
   it. The durable fix was on the component side: its 499 relative specifiers
   carried `.js` suffixes that were **vestigial** (its own tsconfig has been
   `moduleResolution: "Bundler"` all along). Dropping them makes the package
   consumable by any bundler with **zero host configuration**, which is the R5
   answer rather than a bridge-specific workaround.
3. **Strictness is a consumer's problem (unforeseen).** Consumed as source, the
   component is compiled by the CONSUMER's tsconfig — so `noUncheckedIndexedAccess`,
   which bridge-web sets and the coach did not, produced 19 errors in the
   coach's own files. Fixed the 19, and added `tsconfig.core.json` +
   `npm run typecheck:core` so the *consumable surface* is held to the strictest
   consumer's flags. Deliberately not applied repo-wide: the service, the bridge
   domain and the tests are never compiled by a consumer.

The `link:` dependency risk turned out to be a non-issue **because** of the
entrypoint split: nothing reachable from `core.ts` imports anything at all.

### What landed

| Where | What |
|---|---|
| `core.ts` | The domain-free entrypoint (§3.1). No domain, no dependencies. |
| `scripts/check-core-graph.mjs` | Walks the graph from `core.ts` and fails on any `domains/` path or any bare/`node:` specifier. **28 modules, clean.** This is what keeps the promise honest. |
| `contracts/version.ts` | The constant, out of the ajv graph. |
| `tsconfig.core.json` | The consumable surface at the strictest consumer's flags. |
| `package.json` | `./core` export; `better-sqlite3` + `express` → `optionalDependencies`, `tsx` → dev. |
| 151 files | `.js` suffixes dropped from relative specifiers. |
| `bridge-web/lib/coach/*` | `context` (identity + tenancy), `tableEvents` (the `EventSource` half), `verdicts` (KB decider in ask mode), `notes` (deterministic phrasing), `index` (composition root). |
| `bridge-web/lib/coach/coach.test.ts` | Six tests over a real compiled KB, end to end. |

### Decisions taken while building

- **The coach runs at page render, over the persisted event stream** — not in
  the commit path. Deterministic, so replay gives the same answer; touches no
  write path, so a coach that throws cannot cost a learner their bid. This is
  also why there is no persistence yet: the moment note text stops being
  deterministic (LLM phrasing), notes must be written at commit time keyed to
  `seq`, and that is a schema change.
- **Silence when the rulebook is silent.** If no rule matched the position
  (`decision.fallback`), there is no verdict and no note. A rulebook with no
  agreement has not been contradicted. This has its own test.
- **A correct call gets a quiet confirmation.** `decideIntervention` returns
  silent on a correct action, which is right for interruption and wrong for a
  panel — a coach that only ever appears when you err teaches you to dread it,
  and gives no evidence it was watching. So correct/acceptable produce an
  affirmation note in the coach's quietest register.
- **Skills are derived from the auction ROLE**, per §7's cheapest fix, not from
  rule metadata (which does not exist). `sk_opening_bid_selection` etc.,
  hardcoded host-side in `verdicts.ts` until `@bridge/taxonomy` is wired.
- **`TableActivityEvent = ActivityEvent & { context }`** — a host-side extension,
  because §2.4 (context on the contract) has not landed in the component. It is
  typed rather than cast so the eventual move is a deletion.

### Not built, and why

- **Card play is not coached.** Judging a card needs a double-dummy oracle, not
  the bidding rulebook. The coach stays silent rather than guessing.
- **Robots' calls are not coached** — owner decision 2026-08-01: the strip is
  the coach's surface and only the coach's.
- **No persistence, no learner model across sessions, no LLM, no modes UI,
  no `coach.json`, no second consumer.** Phases 6–8 stand as written.

### Verification

- `npm run typecheck` / `typecheck:core` / `check:core` — clean.
- Component tests: 225 pass, 1 fail (`tests/contracts/type-drift.test.ts`) —
  **pre-existing**, confirmed failing on a clean checkout; unrelated to this work.
- Bridge platform: **637 pass, 3 skipped**, including the 6 new coach tests.
- `next build` (Turbopack, production): **passes**, with no build step for the
  component and no bundler configuration.

## 13. Second pass — 2026-08-02 (later)

Four items from §12's open list, in the order §11's reasoning implied: fix what
is WRONG, land the CONTRACTS, then build on them.

### 13.1 Correctness

**The pack surface was wrong.** Verdicts were computed against `enabledPackIds:
[]` — every pack in the KB at its defaults — while the table's House seats play
one specific deck. The coach could cite a rule the learner's own partner does
not use. Bidding agreements are a property of a PARTNERSHIP, so the surface now
comes from the partner's seat config, falling back to any KB player at the
table, then to the whole KB for an all-human table (`partnershipSystem` in
`lib/coach/verdicts.ts`). The bid-meaning card beside the grid still uses the
whole KB, correctly: it answers "what could this call mean", not "what should
YOU have called".

**The hint ladder leaked its own answer.** A level-2 hint said "work out what it
asks for before looking at the answer" and printed a citation chip reading
*"1♥ with four-plus hearts (up the line)"* directly underneath. The rule's TITLE
is the answer. Below the reveal rung the citation, the alternatives and the call
are all withheld, and the note names the AREA instead — from the engine's own
auction role ("responding to partner's opening"), which is a lead rather than a
tease.

Fixing that surfaced a second problem: **the reveal rung was unreachable.**
`decideIntervention` sets the level from severity alone (1 for a near miss, 2
for a real divergence) and only escalates past that on an explicit hint request
— which has no UI. A reveal rung of 3 meant the coach would never answer its own
question. It is 2 for now, and moves to 3 when a "show me" control exists.
*This is the interesting kind of bug: the ladder was fine, the way it is climbed
was not.*

### 13.2 The Phase 1 contracts (skipped in the first pass, now landed)

| Contract | Where |
|---|---|
| `CoachNote` | `contracts/schemas/CoachNote.schema.json` — with `anchorId` (opaque host action id), `kind`, citations, alternatives, `hintLevel`, `policyVersion` |
| `PlatformContext` | its own schema, `$ref`'d by CoachNote and ActivityEvent |
| `ActivityEvent.context` | tenancy now rides on the envelope; the host-side extension type is gone |
| `VerdictSource` | `platform/embed/ports.ts` — the host is the evaluator, `null` means silence |
| `LearnerContextSource` | same file — read-only, both methods nullable (R1's port, no adapter yet) |

The generator needed `cwd` to resolve sibling `$ref`s; without it json-schema-to-typescript
silently inlines `unknown`. `PlatformContext` is exempt from the
"every contract requires schemaVersion" test — it is a value object embedded in
records, not a record, and stamping a version on every occurrence would be noise.

Host adoption: `bridgeVerdicts` now exposes `source` (the port) plus `detailFor`
(the citation, which is richer than the port's `EvaluationResult` and is the
host's own note material). Notes are built as component `CoachNote`s and mapped
to the strip's render shape in `lib/coach/render.ts` — the contract is what the
coach said, the strip shape is how this app draws it.

`createdAt` is derived from the EVENT, not the clock, so two renders of the same
board are byte-identical. That is what keeps recompute-at-render defensible.

### 13.3 Card play

`@laic/coach/domains/bridge` now exists — and is deliberately narrower than
first drafted. It exports the card-play evaluator, the double-dummy oracle and
the solver, and **not**:

- the bidding evaluator — bridge-web owns a knowledge base, and two evaluators
  for one game is two answers to "was that right", diverging silently;
- domain registration, which dragged the LLM-backed bridge coach into the graph
  of a host that only wanted a solver. It is its own subpath now
  (`@laic/coach/domains/bridge/register`).

Card verdicts run through the same `VerdictSource` port
(`lib/coach/cardVerdicts.ts`). This is the one place the host defers to the
component rather than the reverse: what makes a card right is what it costs,
which needs a search the bridge platform does not have.

Bounded three ways, because 52 cards a board is a lot of coaching:
- the oracle solves only end-game positions (≤5 cards/hand) and returns nothing
  earlier, so the expensive path runs for the last few tricks and nowhere else;
- a low-confidence "acceptable" from the evaluator is turned into an explicit
  no-verdict, so the coach stays silent rather than affirming a card nobody
  checked;
- at most 3 card notes survive to the strip, and cards get no affirmations —
  confirming one good call is useful, confirming thirteen good cards is noise.

Measured on real boards: **11ms** for a 26-event board mid-play, **4ms** for a
completed 112-event one.

Dummy is excluded: the learner played nothing. Declarer's coaching covers both
their own hand and dummy's, since declarer chooses both.

### 13.4 Strictness, again

Importing the bridge domain put `cardplay/*` and `evaluator/hand.ts` into
bridge-web's compile, and 24 more `noUncheckedIndexedAccess` errors with them.
Fixed. The pattern is now established and worth stating as a rule: **every time
a host imports more of this component, it compiles more of it under its own
flags.** `tsconfig.core.json` covers the core surface; the bridge entrypoint's
graph is currently only guarded by bridge-web's own build.

### 13.5 Verification

- Component: **228 tests pass**, typecheck + `typecheck:core` + `check:core`
  clean (28 modules, no domain, no dependencies). The `type-drift` failure noted
  in §12 as pre-existing was stale generated files; regenerating cleared it.
- Bridge platform: **645 pass, 3 skipped** (14 coach tests, up from 6).
- `next build` (Turbopack, production): passes.

### 13.6 Still open

- **A "show me" control**, which is what makes hint levels above 2 reachable.
- **Note persistence** — required before any LLM phrasing, since recompute-at-render
  only works while output is deterministic.
- **Presets + the mode switch** (R4), **`coach.json`** (R5), **the reuse proof** (Phase 8).
- **R1** — `LearnerContextSource` exists as a port with no adapter, still blocked
  on who owns BKT.
- **R3's other half** — the teaching corpus in `domains/bridge/knowledge/` is
  still unwired, so notes cite rules but never worked examples.
