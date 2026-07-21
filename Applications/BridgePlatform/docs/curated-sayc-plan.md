# Curated SAYC: a complete, authored, toggleable knowledge base

## Context

Extraction produces a breadth-first skeleton (the prod SAYC KB's 120 items ≈ 120 executable
rules, avg 1.7/item): conventions are named and toggled, but opener rebids, responder
continuations, and all slam responses are teaching prose — a player carrying it bids the
first round well and then falls to fallbacks. The owner wants the knowledge itself authored:
**populate a SAYC knowledge base comprehensively by hand (Claude-authored, `src_claude`-cited),
everything toggleable, and the player should genuinely play well** — including card play.

**Owner decisions (Q&A):** fresh curated KB (existing extracted KB untouched); play-engine
expansion IS in scope (finesse/hold-up/duck/establish, not just the 9 basic behaviors);
extending the rule language where SAYC needs it IS in scope (ace counting, cue bids…).

**Decisive exploration findings:**
- `bridgebot` (~/Documents/CodeProjects/bridgebot/src/player/) already contains a complete,
  config-driven SAYC engine: `bidRules.ts` (1502 ln, ~60 rules: openings, 1NT/major/minor
  responses, Stayman/transfer continuations, opener+responder rebids, NMF/FSF, full
  competitive seat, Blackwood/Gerber/RKCB responses, DOPI), `playEngine.ts` (858 ln: draw
  trumps, finesses, suit combinations, hold-up, duck, establish, ruff, defensive signals),
  `leadEngine.ts`, and hand→expected-call vitest suites (`player.test.ts`,
  `rulesExtended.test.ts`, `playCompetence.test.ts`). **This is the porting source.**
- `bridgeconventionconfigprotoype/src/data/registry.ts` + `valuePresets.ts` hold the
  toggle taxonomy and a ready **`sayc` value preset** — the checklist for "everything
  toggleable" and its defaults.
- Platform gaps that block a faithful port (from language/decider exploration):
  no ace/keycard/specific-card predicates; actions can't bid a contextual suit (cue bid,
  rebid own suit); auction memory lacks first-bids and LHO; CallPattern silently ignores a
  bare `level:` field (22 latent bugs in extracted prod rules).
- Batch-install precedent: `runExtraction` (packages/bridge-kb/src/extraction.ts:256-263)
  does direct `store.putItem`/`addMembership`/`putEdge` then **one** `service.recompile` —
  never loop `service.createItem` (O(N²) compiles). Scenario-test harness to copy:
  `packages/bridge-engine/src/decide/decide.test.ts` (`dealFor` + auction prefix +
  `expect(d.action)`/`matchedRuleId`).

Everything stays inside the platform's philosophy: decisions trace to knowledge items that
fellows can open, edit, version, and toggle. No imperative "SAYC brain" — the content is
data, the engine interprets it.

Paths below relative to `Applications/BridgePlatform/`.

---

## Stage 1 — Rule-language extensions (bridge-kb + bridge-engine)

Files: `packages/bridge-kb/src/language.ts` (+compile passthrough), engine evaluators
`packages/bridge-engine/src/decide/{handConditions,auctionContext,actions}.ts`, tests in
`decide.test.ts` + `compile.test.ts`.

**HandPredicate additions** (evaluate in handConditions.ts):
- `{ aces: {min?,max?} }`, `{ kings: {min?,max?} }` — Blackwood/Gerber/5NT responses.
- `{ keycards: { suit: SuitRef; min?; max? } }` — aces + K of the ref suit (RKCB).
- `{ holds: { suit: SuitRef; rank: Rank } }` — specific card (trump Q for RKCB queen-ask).

**SuitRef additions** (resolution in handConditions.ts `resolveSuit` + facts):
`own_first_bid_suit`, `partner_first_bid_suit`, `own_last_bid_suit`. (Facts must start
remembering each seat's FIRST contract bid — see next.)

**AuctionContext additions** (auctionContext.ts `analyzeSeat`/`matchContext`):
- `lhoLast?: CallPattern` (completes the ring; needed for balancing/responsive doubles).
- `ownFirst?/partnerFirst?: CallPattern` (multi-round rebid sequences: "I opened 1♠…").

**AuctionAction addition** (actions.ts):
- `{ type: "bid_suit"; suit: SuitRef; level?: number }` — bid a contextual suit at the
  given level (or cheapest legal). Enables cue bids (`rho_bid_suit`), rebidding own suit
  (`own_first_bid_suit`), raising partner's FIRST suit. Returns null when unresolvable or
  illegal (existing convention: null = rule doesn't act).

**Bug fix**: `matchCallPattern` normalizes a bare `level: n` to `levelMin=levelMax=n`
instead of ignoring it (heals the 22 latent extracted-rule bugs).

**Surface updates** in the same stage: extractor prompt `LANGUAGE_REFERENCE`
(apps/bridge-web/lib/extraction.ts), ItemEditor rule-editor dropdowns + English sentence
renderer (components/kb/ItemEditor.tsx), in-app guide #rules section.

## Stage 2 — Play-engine expansion (legitimate-information play)

Files: `packages/bridge-kb/src/language.ts` (PlayBehavior enum),
`packages/bridge-engine/src/decide/actions.ts` (realization), new
`packages/bridge-engine/src/decide/playView.ts`, capability mapping in
`packages/bridge-kb/src/validatePlayer.ts` (playCategories), tests.

- **PlayView (new, the honesty boundary):** GameState carries all four hands; new behaviors
  must decide from `{ ownHand, dummy (visible after the opening lead), cardsPlayed,
  currentTrick, contract, trumps, auction }` — never opponents' hidden hands. Existing 9
  behaviors already conform de facto; route them through the view too.
- **New PlayBehavior values** (ported/adapted from bridgebot `playEngine.ts` + `plan.ts`,
  each self-gating — returns null when inapplicable, like `second_hand_low` today):
  - declarer: `draw_trumps`, `finesse_toward_tenace` (incl. eight-ever-nine-never guard),
    `hold_up_stopper`, `duck_to_preserve_entry`, `establish_long_suit`, `ruff_loser`,
    `discard_loser_on_winner`, `cash_out_when_enough` (sure winners ≥ tricks needed).
  - defense: `return_partner_suit`, `hold_up_ace`, `overruff_or_discard`,
    `second_hand_rise_vs_honor`.
- Map new behaviors into the 17-category completeness validator (validatePlayer.ts
  `playCategories`) so curated play items satisfy declarer/defense categories.
- Unit tests per behavior in the `playCompetence.test.ts` style (construct trick states,
  assert the chosen card), cribbing bridgebot's cases.

## Stage 3 — The curated content package `@bridge/sayc-template`

New workspace package `packages/bridge-sayc-template` (keeps bridge-kb content-free per its
stated norm; depends on `@bridge/kb` types, dev-depends on `@bridge/engine` for tests).
Exports `SAYC_TEMPLATE = { kb: {name, systemLabel, description}, items: TemplateItem[],
packs, edges }` — plain `KnowledgeItem` inputs with stable local keys.

**Chapters** (one file each under `src/chapters/`, coverage ported from bridgebot
`bidRules.ts`, defaults from the config prototype's `sayc` preset; every convention gets an
`enable` SettingSpec, every range a `range_hcp`/`number` parameter):
- `openings.ts` — 1NT/2NT/3NT ranges, 5-card majors, better-minor, strong 2♣, weak twos,
  preempts at 3/4-level, opening pass. (~10 items)
- `nt-responses.ts` — Stayman (ask + ALL opener rebids + responder continuations), Jacoby
  transfers (+ completions, super-accepts, continuations), Texas, 2♠→minors, quantitative
  raises, game bids. (~12 items)
- `major-responses.ts` / `minor-responses.ts` — raises (single/limit/game), 1NT response,
  new suits up the line (`first_legal_of`), Jacoby 2NT (+ opener rebids via `bid_suit
  own_first_bid_suit`), inverted minors OFF by default per SAYC preset. (~12)
- `opener-rebids.ts` / `responder-rebids.ts` — min/invite/max ladders by shape (balanced NT
  rebids, rebid own 6-carder, raise responder, reverses as explicit sequences), NMF,
  fourth-suit-forcing. (~14)
- `strong2c.ts` — 2♦ waiting, opener continuations, second negative. (~4)
- `weak2-preempts.ts` — RONF, 2NT feature ask + responses, preempt discipline. (~5)
- `competitive.ts` — overcalls (1-/2-level quality gates), takeout double + advances,
  negative doubles, 1NT overcall + systems-on, Michaels/Unusual 2NT (toggleable), weak jump
  overcalls, balancing, cue-bid raise (`bid_suit rho_bid_suit`), Truscott/Jordan 2NT. (~14)
- `slam.ts` — Blackwood 4NT + ace responses (`aces` predicate), 5NT king ask + responses,
  Gerber over NT + responses, DOPI, quantitative-4NT distinction, RKCB variant behind a
  `single_select` (classic default per the booklet; 1430/0314 selectable). (~7)
- `leads-signals.ts` — leads vs suit/NT (existing LeadStyle vocabulary), standard
  attitude/count signals, first-discard policy. (~4)
- `play.ts` — declarer plan items + defense technique items using Stage-2 behaviors, as
  `declarer_technique`/`defensive_technique` with priorities; fundamentals retained. (~10)
- `floor.ts` — the three phase fallbacks. (3)

**Discipline (from exploration):** always `levelMin`/`levelMax`; specific-over-general via
knowledgeType bands (exception 0 < convention 1 < natural 2 < fallback 9) + documented
per-chapter priority ranges; setting keys are KB-global (one owner item per key, others use
`$setting` refs); teaching prose allowed but never load-bearing.

**Tests (the heart of "plays well"):**
- `sayc.bidding.test.ts` — compile the template in-memory (KbService + InMemoryKbStore,
  decide.test.ts pattern) and assert ~60-80 hand+auction→call scenarios ported from
  bridgebot's suites (openings, Stayman on/off, transfers, rebids, competitive, Blackwood
  counts, DOPI…), incl. toggle-off and `$setting`-shift cases.
- `sayc.play.test.ts` — trick-state scenarios for the play items.
- `sayc.simulation.test.ts` — `simulateSelfPlay` over ≥100 seeded deals: all complete,
  `engineFloorEvents === 0`, fallbackUsage sane.
- Completeness: probe player on the Full set → 17/17 categories.

## Stage 4 — Install flow, UI, ship

- `installSaycTemplateAction` (apps/bridge-web/app/bridge/kb/actions.ts, mirroring
  createKbAction): `createKb` → batch `store.putItem`+`addMembership`+`putPack`+`putEdge`
  → **one** `service.recompile` → `publishKbVersion({label:"Base — curated SAYC"})` → audit
  → redirect to the new KB. Items cite `src_claude` (the sanctioned in-code source),
  status `approved` (curated, tested), citation `anchor` naming the chapter.
- Sets: **Floor** (3 fallbacks) ← included by **Core natural** ← included by **Full SAYC**
  (everything, `intendedComplete: true`); a **Conventions** set for browsing.
- KB list page (app/bridge/kb/page.tsx): "Start from the curated SAYC template" card next
  to "New knowledge base".
- e2e (kb.spec.ts): install template → sets/completeness visible → quick-play a board →
  a decision's trace cites a curated item.
- Docs: in-app guide + AGENTS.md notes.
- Deploy (no SQL — all jsonb-additive), then install on prod via the button.

## Explicitly out of scope (noted for later)
Jump/reverse as first-class semantics; splinters/Bergen (off in the SAYC preset);
constraint-inference / combined-range judgment layer (bridgebot `constraints.ts`) — the
band+priority ladder approximates it; squeeze/endplay-level play.

## Risks
- **Content volume** is the real work (~95 items, ~450+ rules). Mitigated by porting
  bridgebot's already-debugged logic and testing every sequence.
- **first_match ordering bugs** — mitigated by the scenario suite + per-chapter priority
  ranges + band discipline.
- **New behaviors misfiring** — each self-gates (null when inapplicable) and sits above
  fundamentals in priority; simulation must stay 0-floor and complete.
- **ItemEditor coverage** for new predicates/actions — fellows must be able to edit curated
  items; sentence renderer + dropdowns updated in Stages 1-2.

## Verification
Per stage: `pnpm typecheck` + package vitest green. Stage 3 gates: scenario suite, 100-deal
0-floor simulation, 17/17 completeness. Stage 4: full Playwright, prod build, deploy,
install curated KB on prod, play boards on bridge-platform-theta checking traces cite
curated items and toggles change behavior (e.g. Stayman off → 2♣ ask stops firing).
