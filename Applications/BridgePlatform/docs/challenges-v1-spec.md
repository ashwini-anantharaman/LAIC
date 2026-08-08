# Challenges v1 — specification

Owner-interviewed spec, 2026-08-06. Every decision below was made explicitly by
the owner; deviations need a new decision, not a judgment call.

## 1. Concept

A BBO-style group challenge, componentized for this platform: a creator
assembles 1–16 boards, picks scoring, invites players; every participant plays
the **same boards** against BEN opponents from the **same seat per board**; a
silent full-BEN reference playthrough is recorded; finished players get a
leaderboard and a side-by-side comparison of their play vs BEN and vs other
players — including "compare from THIS point", where BEN adopts the user's
history and plays their seat forward.

## 2. Decisions (interview log)

| Topic | Decision |
|---|---|
| Creator competes? | Yes — anyone can create and play their own challenge. **Honesty rule**: a creator who opened the pack editor is **ranked with a visible "editor" badge** ("set the boards") wherever their row appears. |
| Engines | **BEN everywhere.** BEN plays the 3 robot seats live at every participant's table AND the silent baseline. The KB house player is **completely shelved — do not use it anywhere in challenges** (no fallback). |
| Scoring basis | Per board, **vs the field** of completed human participants: IMPs vs datum (field average), Matchpoints %, or Total points (creator picks one at create). **BEN is reference-only** — excluded from field math, shown as an unranked benchmark line. |
| Seats & dealing | All participants play the **same human seat per board**; the **creator may set that seat per board** (default South). Dealer + vulnerability follow the **standard board cycle** by default; creator can override the dealer per board. |
| BEN baseline | **Two baselines.** (a) Full-BEN board (own auction + play), computed silently after create. (b) "BEN in your contract": on demand when a user finishes, BEN adopts the user's auction verbatim and plays the cards from their seat. Comparison UI offers both. |
| Compare from this point | **BEN plays only the user's seat forward** from the chosen ply; the user's history up to that point is frozen; robot opponents replay deterministically against the new line. On-demand + cached. |
| Comparison UI | **Hybrid**: desktop = one shared trick-by-trick timeline driving two synced mini-boards (user left, BEN/opponent right), divergence points flagged on the timeline. Mobile = one board with **ghost cards** for the comparison line + swipe to flip which line is primary. Same comparison model, two renderers. |
| Spoilers / unlock | **Whole-challenge unlock**: a participant sees nothing (scores, playthroughs, comparisons, scorecard) until they have finished **all** boards. |
| Board editor | Defaults are plain random deals (creator can **re-roll** any board). Each board opens the existing **DealEditor** to edit the pack card-by-card, set dealer, set human seat. *(findSafeSeed is KB-self-play-based and the KB is shelved — do not use it; passouts are simply flat boards for the field.)* |
| Table controls | Creator gets a checklist of table controls (Hands, Undo, Claim, Seats, Pause/Step, ☰, Coach) that can be **force-shown or force-hidden** for the challenge — overriding the access catalogue **in both directions**. **Undo and Show-all-hands default OFF** in challenges; creator may enable for teaching. |
| Invites | **Anyone on the platform** (cross-org), found by name/username search. Creator auto-invited. **Explicit accept/decline**: invited → pending until the invitee accepts; leaderboard and "waiting on" views distinguish invited vs joined. |
| Locking | Boards, seats and control overrides are freely editable until the **first participant starts a board** — then they lock. Invites can be added at any time. No deadline in v1; challenges stay open. Creator can archive. |
| IA & access | New **/bridge/challenges** page (+ fully responsive mobile). New catalogue keys: `page.challenges` (ALL roles) and `challenge.create` (ALL roles). Club-page surfacing arrives later with the club feature. |
| Leaderboard | **Final ranks only**: completed players ranked by total; everyone else appears only as a "still playing: N" count. Ties share a rank. Expandable duplicate-style **scorecard grid** (boards × players) — visible only post-completion per the unlock rule. BEN = separate benchmark line. |
| Attempts | **One attempt, resume-only.** Starting a board is the attempt; leave-and-resume is fine (sessions already resume); never restart. First completion is the scored result forever. After finishing the challenge, "replay for practice" opens an **unscored copy** at a normal table. |
| BEN latency | **Warm-up + thinking indicator**: opening a challenge board pings BEN before the first move needs it; a scheduled keep-warm runs while any challenge has active players; robot pauses render a "BEN is thinking…" state; timeouts surface a retry, never a silent stall. |
| Baseline compute | **Background at create + lazy repair**: create returns immediately; a background task computes baselines board-by-board (one function invocation per board). Any missing baseline is computed on demand when first needed. Your-contract and from-here lines are always on-demand + cached. |
| Mobile | **Everything mobile-first, including the create wizard** (pack editor at 390px is real design work — covered by the design pass). |
| Design process | Author `.dc.html` prototypes in the existing Claude Design project (`8bcef4b8-3778-46ef-a273-c89ef3c1f984`, where the table components live) for owner iteration BEFORE implementation. Three surfaces: (1) Create-Challenge wizard, (2) Challenge page (boards grid + progress + leaderboard/scorecard), (3) Comparison view (synced dual boards / ghost mobile). |

## 3. Fairness mechanics (derived, load-bearing)

**BEN decision cache.** All participants must face identical opposition on
identical lines. Since BEN is a remote service whose determinism we do not
control, every BEN decision made inside a challenge is cached per
`(challengeId, boardNo, position-history-hash)`. Any participant reaching the
same position gets the cached decision — identical lines ⇒ identical opponents,
by construction, and repeat positions cost zero BEN calls. (Divergent lines
naturally get divergent responses; that is normal duplicate bridge.)

**Editor badge.** The badge is set the moment the creator opens the pack editor
for any board (they have seen hands), not merely on modification.

## 4. Data model (new; `bridge_` namespace — the Nexus backend's "challenge"
offering type is an unrelated cluster)

- `bridge_challenges` — id, title, description, scoring (`imps|mp|total`),
  createdBy, status (`open|archived`), lockAt (first-play timestamp), editorBadge
  (bool, per §3), createdAt. Jsonb-primary like existing stores.
- `bridge_challenge_boards` — challengeId, boardNo (1–16), pack (4 hands),
  dealer, vul (standard cycle unless overridden), humanSeat, controlOverrides
  (`{key: "show"|"hide"}` per table control).
- `bridge_challenge_invites` — challengeId, userId, status
  (`pending|accepted|declined`), invitedBy, timestamps. Creator auto-row,
  accepted.
- `bridge_challenge_plays` — challengeId, boardNo, userId, sessionId, status
  (`in_progress|completed`), frozen `SubmissionBoard`-style snapshot on
  completion (reuse the assignments/submissions freeze pattern verbatim),
  rawScore (from `scoreBoard`), completedAt.
- `bridge_challenge_baselines` — challengeId, boardNo, kind
  (`full_ben|your_contract|from_point`), keyed by (userId, ply) for the latter
  two, frozen snapshot, status (`pending|ready|failed`).
- `bridge_ben_decisions` — the challenge-scoped decision cache (§3).

Store pattern: types + InMemory + JsonFile in a package, Pg in
`@bridge/pg-stores`, migrations via `pnpm db:apply` (0027+).

## 5. Scoring engine (net-new — nothing exists today)

`packages/bridge-scoring` (or a module in an existing package):
- `impFromDiff(points)` — the standard IMP table (transcribe from
  `bridge-girkar-template/src/chapters/prose.ts`, `cpt-imp-scoring`; it exists
  only as prose today).
- `fieldScores(board, plays[]) → per-player {imps vs datum | mp % | total}` —
  field = completed human participants only (editor-badged included, BEN
  excluded).
- Challenge totals + shared-rank tie handling.
- Unit-tested against hand-computed fixtures.

## 6. Surfaces

### /bridge/challenges (list)
Sections: Invited (pending accept/decline) · Mine (playing / created) ·
Completed. Card: title, creator, boards count, scoring, participants (joined /
still-playing count), your progress ring, editor badge where relevant.

### Create-Challenge wizard (component `CreateChallenge`)
Steps (single scrolling form on mobile): (1) Title, description, scoring,
board count. (2) Boards grid — per-board card: mini hand diagram, dealer/vul/seat
chips, re-roll, "edit pack" → DealEditor (opening it sets the editor badge).
(3) Table controls checklist (defaults per decision — Undo/Show-all OFF).
(4) Invites — platform-wide people search, invited list. (5) Review + Create.
Props contract (component takes data + callbacks, no page coupling):
`{ people: PersonSearch, defaults, onCreate(draft) }`.

### Challenge page
Header (title, desc, creator, scoring, editor badge) · Boards as grid/list
toggle — sequential play is the default CTA ("Play next: board 4"), but any
unplayed board is tappable (free order) · progress per participant (joined
names; "still playing: N") · post-completion: leaderboard (final ranks only,
BEN benchmark line, shared-rank ties) with expandable boards × players
scorecard · per-board "compare" entry points.

### Playing a board
Existing table (`/bridge/table2/[sessionId]`) with a challenge context:
- Session created from the stored pack/dealer/vul/humanSeat; 3 BEN seats.
- Control overrides applied over the access catalogue (both directions) for
  the bottom toolbar + ☰ entries listed in `controlOverrides`.
- BEN warm-up ping on board open; "BEN is thinking…" state; retry affordance
  on timeout. No KB fallback ever.
- One attempt: resume allowed, restart not offered. Completion freezes the
  snapshot, records rawScore, advances the sequential pointer.

### Comparison (component `PlayComparison`)
- Input: two frozen lines (mine + {full-BEN | BEN-in-my-contract | another
  finished player}) + optional from-point request hook.
- Desktop: shared timeline scrubber (tricks/plies), two synced mini-boards
  (multi-instance PlayTable leaves / the review-page renderer), divergence
  flags on the timeline.
- Mobile: single board + ghost card for the other line at each step; swipe to
  flip primary line.
- "Compare from THIS point": button at any ply of MY line → server computes
  BEN-my-seat-forward continuation (cached), right pane switches to it.
- Auction and play both compared; contract mismatch banner links to the
  your-contract baseline.

## 7. Access & catalogue

New keys `page.challenges` + `challenge.create`, both defaultRoles ALL, added
to registry + capability sets (invariants; count strings). The
`controlOverrides` mechanism is an explicit, per-challenge exception layer that
the table page applies AFTER catalogue checks — both grant and revoke.

## 8. Componentization & real-time seams

All challenge UI is props-driven components (design-project first): 
`CreateChallenge`, `ChallengeCard`, `ChallengeBoardsGrid`, `Leaderboard`,
`Scorecard`, `PlayComparison`, `InviteList`. The play orchestration takes a
`participants: {seat, kind: "user"|"ben", userId?}[]` model per board — v1
always `[user@humanSeat, ben, ben, ben]`, but the shape (and the
session/seat plumbing) must not assume it, so live human-vs-human tables can
slot in later. **No websockets/presence in v1.**

## 9. Reuse map (verified in-repo)

- **Assignments** (`bridge-sessions/src/assignments.ts`, `lib/assignments.ts`,
  `m/assign|assignments|assigned`) — the structural blueprint: per-recipient
  records, lazy status reconcile, copy-on-assign, freeze-on-completion
  (`autoSubmitToCoach` → `SubmissionBoard`).
- **Submissions render** (`m/review/[submissionId]`) + `HandDiagram` — the
  frozen-board renderer for playthroughs; mount two for side-by-side.
- **`@bridge/table-ui`** — multi-instance PlayTable + leaves (ResultCard,
  AuctionBox, TrickArea, SeatDiagram) for mini-boards and result tiles.
- **`scoreBoard` / `resultLabel`** (`bridge-engine/scoring.ts`) — per-board raw
  scores; field math is net-new (§5).
- **BEN seat support** — BEN already sits any seat; `ben-service` env wiring
  documented in `.env.example`; cold-start behavior known.
- **laic UI kit** (`Components/laic-learning-platform/src/app/components/ui`) —
  shadcn table/badge/progress/tabs for leaderboard scaffolding if useful.
- **Not reusable**: backend-ts "challenges" tables (enrollment offering type,
  different concept); DrillView (pattern reference only); no leaderboard or
  IMP/MP field math exists anywhere.

## 10. Risks / open items

- **BEN cost & volume**: every table move + baselines are BEN calls; the
  decision cache (§3) is the main mitigation. Monitor per-challenge call counts.
- **BEN determinism** is assumed only WITHIN the cache; nothing else depends on it.
- **Background compute on Vercel**: per-board baseline invocations must fit
  function limits (300s default); board-by-board chunking is the design.
- **Passouts**: with plain randoms and BEN bidding, a board may pass out — it
  scores flat for the whole field; the creator can re-roll at build time.
- **Cross-org invites**: platform-wide search implies people-visibility
  decisions when real (non-stub) Nexus identity is live.

## 11. Build order

1. Design pass: 3 `.dc.html` surfaces in project `8bcef4b8…`; owner iterates.
2. Scoring engine + stores + migrations (0027+, `pnpm db:apply`).
3. Create flow + challenge page + invites (accept/decline).
4. Table integration (challenge sessions, control overrides, BEN warm-up +
   thinking state, decision cache).
5. Baseline background compute + comparison views (+ from-point).
6. Leaderboard/scorecard + editor badge + practice replay.
7. e2e: create→invite→play→finish→compare happy path; unlock rules; attempt
   integrity; control-override matrix.

---

# ADDENDUM A — decisions from the design round (2026-08-06/07)

These supersede §2/§6 where they conflict. The canvases in
`docs/design/challenges/` are the visual reference and were validated at a real
390x844 viewport; mobile is the primary target.

## A1. Entry behaviour — there is no challenge "landing page"
- Tapping a challenge **starts or resumes play immediately** on the next
  unplayed board. No cover card, no board browser first.
- Once the viewer has **finished all boards**, tapping the challenge opens the
  **results** view instead.
- **Accept / decline** for a pending invite lives on the **challenges list
  card**, not on a challenge page. Nothing opens until accepted.
- Consequence: the old `pre-start` phase and its Start/Accept/Decline screen are
  deleted from the design and must not be built.

## A2. Moderators
- `moderator` is a **per-invite boolean**, set with a checkbox on each invite row
  at create time (and editable later by the creator). The **creator is always a
  moderator** (checkbox rendered checked + disabled).
- Moderators see **standings, board-by-board and comparisons at any time**,
  regardless of §A3.
- A moderator **may also compete**. If they do, their leaderboard row carries a
  small **MOD** mark (distinct from the teal editor diamond `<>`), so early
  sight is never invisible to the field.

## A3. Standings visibility is a challenge setting
- New setting `standingsVisibility`: `after-finish` (default — today's
  spoiler-safe rule) | `always`.
- **One access rule, applied in one place:**
  `resultsUnlocked = viewerHasFinished || viewerIsModerator || standingsVisibility === "always"`.
- The **field is completed humans only**. A viewer with early sight who has not
  finished is legitimately absent from the standings; the summary line reads
  e.g. "5 finished - 2 still playing (including you) - 2 invited", and they have
  no rank until they finish.

## A4. In-challenge table chrome
- Playing a challenge board uses the **existing table** with a thin **challenge
  strip above the top toolbar**: challenge title, `Board k of N`, and a
  right-aligned **Results** button. The strip's bottom border doubles as a
  progress rule.
- The Results button is **hidden entirely** (not greyed) when
  `resultsUnlocked` is false.
- Results open as an **overlay over the felt — never a navigation**, because a
  board in progress is a one-attempt session that must survive. Closing returns
  to the exact board state.
- Architecture: the strip is challenge chrome layered **above an unforked
  PlayTable**; the overlay is a portal. Do not fork the table.
- Control overrides (spec §2) apply here: controls the creator hid are
  **absent**, not disabled.

## A5. Results view
- Tabs `Boards | Results`; Results is default and primary. The Results tab label
  carries the viewer's rank chip once they have finished (e.g. `Results - #2`).
- **Leaderboard**: rank - name - total only. No avatars. Editor `<>` and `MOD`
  marks as small suffixes. Ties share a rank. **BEN is a hairline benchmark
  footer row, unranked**.
- **Board-by-board grid** (boards x players, BEN as a column) sits behind one
  `Board-by-board` disclosure. In each board row the **leader = the best score
  on that board** is highlighted (ties all highlight); the highlight is computed
  on the displayed figure so what is tinted matches what is read.
- **Compare by picking two cells**: a left-aligned **Compare** button above the
  grid enters selection mode; the first click picks a (board, player) cell, the
  second must be **in the same board row** (other rows dim and go inert, with a
  one-line hint); the pair opens the comparison. Because BEN is a column,
  comparing against BEN needs no separate control. Cancel and de-select must
  both be obvious.

## A6. Scope note
Everything above is v1. Live human-vs-human tables remain out of scope, but the
per-board participant model (`{seat, kind: "user"|"ben", userId?}`) must not
assume three BEN opponents.
