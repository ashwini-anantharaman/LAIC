# Embedding `@laic/coach` in any UI

The coach is a UI-agnostic package. A host UI plugs in through three seams and
never touches the coach's internals.

## 1. Build the package

```bash
npm install
npm run build      # → dist/index.js (self-contained ESM) + dist/index.d.ts
```

Consumers import `@laic/coach`. A bundler host (Vite/webpack) can alias the name
to `dist/index.js` (see BridgeBot's `vite.config.ts`) or install it as a normal
dependency.

## 2. The one-call API

```ts
import { createCoachSession } from "@laic/coach";

const coach = createCoachSession({
  learnerId: "S",          // the seat / learner being coached
  feedbackStyle: "gentle", // gentle | direct | socratic | minimal
  explanationDepth: "short",
  // llm: myModelClient,   // optional — omit for the offline HeuristicLLM
  // oracle: myDdsOracle,  // optional — see §4
});

coach.on((s) => render(s));          // suggestions come out here
await coach.observe(event, state);   // feed one translated activity event
await coach.requestHint();           // learner asked for help (escalates)
```

With no `llm` injected the coach runs fully offline (no network, no API key):
the intervention decision and hint *level* are the real pipeline output; only
the phrasing comes from the deterministic `HeuristicLLM`. Inject an `LLMLike`
(e.g. a server proxy) for model-authored text.

## 3. The host adapter (the only host-specific code)

The host maps its native events into the generic `ActivityEvent` envelope. For
bridge:

- a **bid**: `action = { bid, position, hand, auctionSoFar }`, `eventType: "bid_made"`
- a **live card play**: `action = { card, position, live: true }`,
  `eventType: "card_played"`, and pass the full-information `LiveCardPlayState`
  as the `gameState` argument.

BridgeBot's adapter lives in `bridgebot/src/coach/` (`serialize.ts` +
`useCoach.ts`) — ~150 lines that translate its `mitt` event bus into these
calls, filtered to the coached seat. A different UI writes its own small
adapter and reuses the identical core.

## 4. Card-play correctness: the double-dummy oracle (hybrid design)

Live card play is judged by a **hybrid** evaluator:

- a `DoubleDummyOracle` is the authority on correctness/severity, and
- the deterministic **principle engine** (`domains/bridge/cardplay/principles.ts`)
  names the tactic (third-hand-high, second-hand-low, win cheaply, don't
  overtake partner) and is the safe fallback when the oracle can't judge.

**Default:** `createCoachSession` wires `LocalDoubleDummyOracle` — an in-process
alpha-beta double-dummy solver (`domains/bridge/cardplay/dds/`). To stay
responsive on the main thread it only solves **end-game** positions (≤5 cards
per hand by default; a handful of tricks left, where card choice matters most
and search is fast); earlier plays defer to the principle engine. Raise the cap
via `new LocalDoubleDummyOracle(n)` or move it to a Web Worker to solve deeper.
Pass `oracle: null` to `createCoachSession` to disable it (principles only), or
inject your own (e.g. a WASM build of Bo Haglund's DDS) behind the same port:

```ts
import { createCoachSession, type DoubleDummyOracle } from "@laic/coach";

const dds: DoubleDummyOracle = {
  async evaluate(state, playedCard) {
    // Call a WASM build of Bo Haglund's DDS (e.g. compiled per grahamhazel.com,
    // or an npm solver such as dds.js / bridgitte) with the full deal, then:
    return { playedTricks, bestTricks, bestCards, tricksLost };
    // return undefined to defer to the principle engine.
  },
};

const coach = createCoachSession({ learnerId: "S", oracle: dds });
```

Until an oracle is provided the coach coaches card play from principles alone
(and stays silent when no high-confidence principle applies — better no advice
than wrong advice).
