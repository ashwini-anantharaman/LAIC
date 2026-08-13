// The coach, over a real table.
//
// Not a mock: this compiles the @bridge/kb fixture into a real CompiledKb, puts
// the learner in a seat, plays their call into the session's event stream, and
// asserts on what `@laic/coach` decided to say. So it exercises the whole seam —
// bridge events → ActivityEvent → the KB decider in ask mode → EvaluationResult
// → the engine's intervention decision → a note the strip can render.
//
// What it is really guarding is the CONTRACT between the two, in both
// directions: that a system-aligned call is confirmed rather than corrected,
// that a divergent one is corrected with the rule cited, and — the one most
// likely to regress — that a position the rulebook has no agreement for
// produces silence rather than an accusation.

import { initialState } from "@bridge/engine";
import type { Card, GameEvent, Seat, Suit } from "@bridge/events";
import type { SeatConfig } from "@bridge/sessions";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
  type CompiledKb,
} from "@bridge/kb";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { beforeAll, describe, expect, it } from "vitest";

import type { CoachNote } from "./stripNote";
import { coachNotesForBoard } from "./index";
import { ALL_AUTHORITIES, assessMove, BUDGET, searchDepthFor } from "./assessors/panel";
import { reconcile } from "@laic/coach/core";
import { livePlayState } from "./cardVerdicts";
import { advisePlay } from "./advise";
import { REVEAL_LEVEL } from "./notes";
import { splitDetail, toStripNote } from "./render";
import type { TeachingStore } from "./kbTeaching";
import { partnershipSystem, type CallVerdict } from "./verdicts";
import { cardCode, tableTurns } from "./tableEvents";

/** The coaching notes proper — the panel also always carries one `system`
 *  note reporting what the coach heard (its proof of life). */
const coaching = (notes: readonly CoachNote[]) => notes.filter((n) => n.source === "coach");
/** The listening note: always present, always first. */
const listening = (notes: readonly CoachNote[]) => notes.find((n) => n.source === "system");

const NOW = "2026-08-02T12:00:00.000Z";
const NOTE_CTX = { learnerId: "user-1", policyVersion: "1.0.0", profileId: "cpp.test" };
/** An item with no authored prose — the note falls back to the rule label. */
const NO_TEACHING = { citations: [] };

/** "SA SK ..." → a full deal with `spec` at `seat` and the rest spread round-robin. */
function dealFor(seat: Seat, spec: string): Record<Seat, Card[]> {
  const rankOf: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    T: 10, J: 11, Q: 12, K: 13, A: 14,
  };
  const mine: Card[] = spec.split(/\s+/).map((token) => ({
    suit: token[0] as Suit,
    rank: rankOf[token[1]!]! as Card["rank"],
  }));
  if (mine.length !== 13) throw new Error(`hand spec has ${mine.length} cards`);
  const used = new Set(mine.map((c) => `${c.suit}${c.rank}`));
  const rest: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!used.has(`${suit}${rank}`)) rest.push({ suit, rank: rank as Card["rank"] });
    }
  }
  const others = (["N", "E", "S", "W"] as Seat[]).filter((s) => s !== seat);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[seat] = mine;
  rest.forEach((card, i) => hands[others[i % 3]!]!.push(card));
  return hands;
}

const bid = (seq: number, seat: Seat, call: string): GameEvent => ({
  category: "bid-event",
  seq,
  ts: 0,
  boardRef: "board-1",
  seat,
  call,
  fallback: false,
});

const context: NexusBridgeContext = {
  nexusUserId: "user-1",
  laicOrgId: "org-1",
  programId: "bridge_program",
  appId: "bridge_ai_coach",
  roles: [],
  permissions: [],
  accessLevel: "learner",
} as NexusBridgeContext;

/** 16 balanced — the fixture KB opens this 1NT. */
const BALANCED_16 = "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2";

let compiled: CompiledKb;

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store, { now: () => NOW });
  const kb = await service.createKb({
    name: "Fixture",
    systemLabel: "SAYC",
    createdBy: "u",
  });
  for (const item of FIXTURE_ITEMS) {
    await store.putItem(item);
    await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
  for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
  await service.recompile(kb.kbId);
  compiled = (await service.liveCompile(kb.kbId))!;
});

/** N/E/W are House robots on `packs`; S is the human learner. */
function seatsWith(packs: string[]): Record<Seat, SeatConfig> {
  const robot = {
    kind: "kb_player" as const,
    playerId: "p_house",
    label: "House",
    enabledPackIds: packs,
    settingOverrides: {},
    decisionPolicyId: "first_match" as const,
  };
  return {
    N: robot,
    E: robot,
    W: robot,
    S: { kind: "human", nexusUserId: "user-1" },
  };
}

function board(
  events: GameEvent[],
  dealtHands: Record<Seat, Card[]>,
  packs: string[] = ["pk_conventions"],
) {
  return {
    context,
    record: {
      sessionId: "sess-1",
      board: { name: "board-1", dealer: "S" as Seat },
      events,
      seats: seatsWith(packs),
    },
    vul: "none" as const,
    dealtHands,
    compiled,
  };
}

describe("the coach reads the table", () => {
  it("turns each action event into one activity event, in order", () => {
    const turns = tableTurns({
      record: {
        sessionId: "sess-1",
        board: { name: "board-1", dealer: "S" },
        events: [bid(0, "S", "1N"), bid(1, "W", "P"), bid(2, "N", "2N")],
      },
      vul: "none",
      dealtHands: dealFor("S", BALANCED_16),
      platform: { appId: "a", programId: "p", domainId: "bridge" },
    });

    expect(turns.map((t) => t.event.eventType)).toEqual(["bid_made", "bid_made", "bid_made"]);
    expect(turns.map((t) => t.event.action.call)).toEqual(["1N", "P", "2N"]);
    // Each turn carries the position as it was BEFORE that call — a verdict
    // computed against the position after it would be judging the wrong thing.
    expect(turns.map((t) => t.event.action.auctionSoFar)).toEqual([[], ["1N"], ["1N", "P"]]);
    // The actor's own hand, and tenancy, ride along.
    expect(turns[0]!.event.action.hand).toContain("S:AK");
    expect(turns[0]!.event.context.domainId).toBe("bridge");
  });

  it("confirms a call the system agrees with, and cites the rule", async () => {
    const hands = dealFor("S", BALANCED_16);
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1N")], hands),
      learnerSeat: "S",
    });

    const said = coaching(notes);
    expect(said).toHaveLength(1);
    expect(said[0]!.headline).toContain("1NT");
    expect(said[0]!.citations?.length).toBeGreaterThan(0);
  });

  it("speaks up when the call diverges from the system, naming what it would call", async () => {
    const hands = dealFor("S", BALANCED_16);
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1S")], hands),
      learnerSeat: "S",
    });

    const said = coaching(notes);
    expect(said).toHaveLength(1);
    const text = `${said[0]!.headline} ${said[0]!.detail ?? ""}`;
    expect(text).toContain("1NT");
    expect(said[0]!.citations?.length).toBeGreaterThan(0);
  });

  it("says nothing about the other seats' calls", async () => {
    const hands = dealFor("S", BALANCED_16);
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1N"), bid(1, "W", "2S"), bid(2, "N", "3N")], hands),
      learnerSeat: "S",
    });

    // Only South's own call is coached — the robots' reasoning belongs to the
    // card beside the bidding grid, not to the coach's strip. The surviving
    // note is anchored to seq 0, which is South's 1NT.
    const said = coaching(notes);
    expect(said).toHaveLength(1);
    expect(said[0]!.id).toBe("sess-1:0");
  });

  it("reports what it heard even when it has nothing to say", async () => {
    // The coach is silent far more often than it speaks. An empty panel is
    // indistinguishable from a coach that was never wired up, so it always
    // reports its own listening — and that note must never displace real
    // coaching from the strip's one visible line, hence "first".
    const notes = await coachNotesForBoard({
      ...board([bid(0, "N", "1N"), bid(1, "E", "P")], dealFor("S", BALANCED_16)),
      learnerSeat: "S",
    });

    expect(coaching(notes)).toEqual([]);
    expect(notes[0]!.source).toBe("system");
    expect(notes[0]!.headline).toContain("none of them yours");
    expect(notes[0]!.detail).toContain("N 1NT");
  });

  it("keeps the listening note behind real coaching, and traces on request", async () => {
    const args = {
      ...board([bid(0, "S", "1S")], dealFor("S", BALANCED_16)),
      learnerSeat: "S" as Seat,
    };
    const plain = await coachNotesForBoard(args);
    // Newest last: the coaching note must be the one a collapsed strip shows.
    expect(plain[0]!.source).toBe("system");
    expect(plain[plain.length - 1]!.source).toBe("coach");
    expect(listening(plain)!.detail).not.toContain("incorrect");

    const traced = await coachNotesForBoard({ ...args, trace: true });
    // Trace names every authority that spoke and what it concluded, plus what
    // the panel would have played — the three things needed to check whether the
    // evaluation layer is behaving.
    expect(listening(traced)!.detail).toContain("incorrect");
    expect(listening(traced)!.detail).toContain("system=incorrect");
    expect(listening(traced)!.detail).toMatch(/would 1N/);
  });

  it("says nothing at all to someone who is only watching", async () => {
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1N")], dealFor("S", BALANCED_16)),
      learnerSeat: null,
    });
    expect(notes).toEqual([]);
  });

  it("stays silent where the rulebook has no agreement", async () => {
    // A system with no auction rules at all: every position falls through to
    // the engine's safe default, so the decider reports `fallback`. A rulebook
    // that is SILENT has not been contradicted, and the coach must not call the
    // learner wrong on its behalf — that is the difference between coaching a
    // system and inventing one.
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1N")], dealFor("S", BALANCED_16)),
      compiled: { ...compiled, auctionRules: [], forcingRules: [] },
      learnerSeat: "S",
    });
    expect(coaching(notes)).toEqual([]);
  });

  it("judges against the PARTNERSHIP's system, not every pack in the KB", async () => {
    // Same board, same call — only the deck the table plays changes.
    // `pk_floor` carries fallbacks and no opening agreements, so the rulebook
    // is silent there and the coach must be too. Judging against the whole KB
    // would cite `pk_openings` rules the partner does not play.
    const hands = dealFor("S", BALANCED_16);
    const onFloor = await coachNotesForBoard({
      ...board([bid(0, "S", "1S")], hands, ["pk_floor"]),
      learnerSeat: "S",
    });
    expect(coaching(onFloor)).toEqual([]);

    const onOpenings = await coachNotesForBoard({
      ...board([bid(0, "S", "1S")], hands, ["pk_openings"]),
      learnerSeat: "S",
    });
    expect(coaching(onOpenings)).toHaveLength(1);
  });

  it("falls back sensibly when no seat declares a system", () => {
    const human = { kind: "human", nexusUserId: "u" } as SeatConfig;
    const robot = seatsWith(["pk_openings"]).N;

    // Partner's deck wins.
    expect(partnershipSystem(seatsWith(["pk_openings"]), "S").enabledPackIds).toEqual([
      "pk_openings",
    ]);
    // No partner config, but someone at the table has one.
    expect(
      partnershipSystem({ N: human, S: human, E: robot, W: human }, "S").enabledPackIds,
    ).toEqual(["pk_openings"]);
    // All-human table: nobody has declared a system, so use the whole KB.
    expect(
      partnershipSystem({ N: human, S: human, E: human, W: human }, "S").enabledPackIds,
    ).toEqual([]);
  });

  
  
  
  it("has no card verdict before a contract exists", () => {
    // Mid-auction there is no declarer, no dummy and no trump, so the
    // full-information position the evaluator needs cannot be built. Returning
    // null keeps the coach quiet instead of inventing a contract.
    const state = initialState("b", "S", "none", dealFor("S", BALANCED_16));
    expect(livePlayState(state, "S", "S")).toBeNull();
  });

  it("quotes the knowledge item's own explanation and cites its sources", async () => {
    // The point of the whole exercise: the note should carry what a FELLOW
    // wrote about the agreement, and point at the document it came from —
    // not a sentence the coach assembled from the rule's title.
    const item = FIXTURE_ITEMS.find((i) => i.itemId === "ki_open_1nt")!;
    const store: TeachingStore = {
      async getItem(id) {
        return id === item.itemId
          ? {
              ...item,
              humanReadableText: "Open 1NT on a balanced hand in range — it describes the whole hand in one call.",
              sourceReferences: [{ sourceId: "src_sayc", anchor: "notrump openings" }],
            }
          : null;
      },
      async listSources() {
        return [{ sourceId: "src_sayc", title: "Standard American Yellow Card" }];
      },
    };

    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1S")], dealFor("S", BALANCED_16)),
      learnerSeat: "S",
      kb: store,
    });
    const said = coaching(notes)[0]!;

    expect(said.detail).toContain("describes the whole hand in one call");
    // The citation names the SOURCE and the anchor into it, not just the rule.
    expect(said.citations?.map((c) => c.label)).toContain(
      "Standard American Yellow Card — notrump openings",
    );
  });

  it("degrades to the rule label when the knowledge base is unreachable", async () => {
    // A KB that throws must cost a richer note and nothing else — the coach
    // still speaks, still cites the agreement by name.
    const store: TeachingStore = {
      async getItem() { throw new Error("kb down"); },
      async listSources() { throw new Error("kb down"); },
    };
    const notes = await coachNotesForBoard({
      ...board([bid(0, "S", "1S")], dealFor("S", BALANCED_16)),
      learnerSeat: "S",
      kb: store,
    });
    const said = coaching(notes)[0]!;
    expect(said.headline).toContain("1NT");
    expect(said.citations?.length).toBeGreaterThan(0);
  });

  it("hands cards to the engine as letter ranks, not numbers", () => {
    // The engine's card parsers index into "23456789TJQKA". `cardId()` from
    // @bridge/events emits a NUMERIC rank ("D13"), which resolves to -1 there —
    // so every card-play verdict is computed on a card the evaluator could not
    // read, and nothing errors. The only visible symptom was a note reading
    // "13♦". This test is the tripwire.
    expect(cardCode({ suit: "D", rank: 13 })).toBe("DK");
    expect(cardCode({ suit: "H", rank: 14 })).toBe("HA");
    expect(cardCode({ suit: "C", rank: 10 })).toBe("CT");
    expect(cardCode({ suit: "S", rank: 7 })).toBe("S7");
    // Every code must be parseable by the engine's own rank order.
    const RANK_ORDER = "23456789TJQKA";
    for (const rank of [2, 5, 9, 10, 11, 12, 13, 14] as const) {
      const code = cardCode({ suit: "S", rank });
      expect(RANK_ORDER.indexOf(code.slice(1)), `rank ${rank}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("resolves a reveal request without breaking the policy ceiling", async () => {
    // Unprompted, severity alone sets the level and it never rises — so a
    // withheld hint was a dead end. `revealFor` goes through the engine's own
    // hintRequested path, which climbs one rung and still obeys the policy's
    // ceiling.
    const args = {
      ...board([bid(0, "S", "1S")], dealFor("S", BALANCED_16)),
      learnerSeat: "S" as Seat,
      revealHref: (anchorId: string) => `/t?reveal=${anchorId}`,
    };

    // This call diverges badly enough that severity alone already reveals, so
    // there is nothing left to ask about and no offer is made.
    const plain = coaching(await coachNotesForBoard(args))[0]!;
    expect(plain.headline).toContain("1NT");
    expect(plain.action).toBeUndefined();

    // Asking about it explicitly still resolves — escalation past the ceiling
    // is a no-op rather than an error, which is what makes a stale `?reveal=`
    // in the URL harmless.
    const revealed = coaching(
      await coachNotesForBoard({ ...args, revealFor: "sess-1:0" }),
    )[0]!;
    expect(revealed.headline).toContain("1NT");
    expect(revealed.citations?.length).toBeGreaterThan(0);
  });

  it("offers \"Show me\" only where something is still withheld", () => {
    // The RULE, expressed against the rung rather than a literal level, so it
    // keeps meaning when the rung moves.
    const withheld = toStripNote(
      {
        schemaVersion: "1.0.0", noteId: "n1", learnerId: "L", anchorId: "a1",
        kind: "nudge", hintLevel: REVEAL_LEVEL - 1, headline: "Worth a second look.",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
      { revealHref: (id) => `/t?reveal=${id}` },
    );
    expect(withheld.action).toEqual({ label: "Show me", href: "/t?reveal=a1" });

    // Already answered — a button here would change nothing.
    const answered = toStripNote(
      {
        schemaVersion: "1.0.0", noteId: "n2", learnerId: "L", anchorId: "a2",
        kind: "hint", hintLevel: REVEAL_LEVEL, headline: "Your system would call 1NT.",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
      { revealHref: (id) => `/t?reveal=${id}` },
    );
    expect(answered.action).toBeUndefined();

    // An affirmation is not withholding anything either.
    const affirmed = toStripNote(
      {
        schemaVersion: "1.0.0", noteId: "n3", learnerId: "L", anchorId: "a3",
        kind: "affirmation", headline: "1NT — that's your system's call.",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
      { revealHref: (id) => `/t?reveal=${id}` },
    );
    expect(affirmed.action).toBeUndefined();
    // And no note carries a bare seat chip any more.
    expect(withheld.about).toBeUndefined();
  });

  it("withholds nothing under the current policy, so no board offers \"Show me\"", () => {
    // The rung is deliberately at 1: withhold-then-reveal is real pedagogy, but
    // the thresholds driving it were guesses, and a guessed ladder is worse than
    // none. This pins the CURRENT policy — if the socratic mode raises the rung,
    // this test is the one that should fail and be updated on purpose.
    expect(REVEAL_LEVEL).toBe(1);

    const levels = [1, 2, 3];
    for (const hintLevel of levels) {
      for (const kind of ["hint", "nudge", "question"] as const) {
        const note = toStripNote(
          {
            schemaVersion: "1.0.0", noteId: `n-${kind}-${hintLevel}`, learnerId: "L",
            anchorId: "a", kind, hintLevel, headline: "x",
            createdAt: "2026-08-03T00:00:00.000Z",
          },
          { revealHref: (id) => `/t?reveal=${id}` },
        );
        expect(note.action, `${kind} at level ${hintLevel}`).toBeUndefined();
      }
    }
  });

  
  
  
  
  
  // -------------------------------------------------------------------------
  // The five invariants of the evaluation layer. These are the definition of
  // "behaving correctly" — each one guards a way the panel could quietly lie.
  // -------------------------------------------------------------------------

  it("INVARIANT 1 — every finding names its authority, and system findings cite", async () => {
    const move = {
      action: { kind: "call" as const, seat: "S" as Seat, call: "1S", auctionSoFar: [], hand: "", fallback: false },
      before: initialState("b", "S", "none", dealFor("S", BALANCED_16)),
      actor: "S" as Seat,
      learnerSeat: "S" as Seat,
    };
    const a = await assessMove(move, { system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") }, authorities: ALL_AUTHORITIES }, BUDGET.review);

    expect(a.findings.length).toBeGreaterThan(0);
    for (const f of a.findings) {
      expect(["system", "solution", "convention"]).toContain(f.authority);
      // A rulebook finding without provenance is an assertion dressed as a
      // citation — the product's whole claim is an open, cited rulebook.
      if (f.authority === "system") expect(f.cites?.length, f.assessor).toBeGreaterThan(0);
    }
  });

  it("INVARIANT 2 — hidden-card reasoning never becomes the explanation", () => {
    // The reconciler, not the phrasing, enforces this. A solved position may set
    // the verdict; it may never be what the learner reads.
    const a = reconcile([
      {
        assessor: "dds", authority: "solution", correctness: "incorrect", severity: "major",
        confidence: 0.9, usedHiddenCards: true, because: "east holds the king",
      },
      {
        assessor: "kb", authority: "system", correctness: "suboptimal", severity: "moderate",
        confidence: 0.7, usedHiddenCards: false, because: "your system plays low",
      },
    ]);
    expect(a.teachable?.usedHiddenCards).toBe(false);
    expect(a.teachable?.because).toBe("your system plays low");
    // And nothing quotable may come from the hidden finding.
    expect(a.findings.filter((f) => f.usedHiddenCards).every((f) => f !== a.teachable)).toBe(true);
  });

  it("INVARIANT 3 — judging and asking consult the same authorities", async () => {
    // Two paths with different orders was the bug: a card judged by a general
    // guideline while the hint quoted the learner's own rulebook.
    const c = (suit: Suit, rank: number): Card => ({ suit, rank: rank as Card["rank"] });
    const before = {
      boardRef: "b", dealer: "W" as Seat, vul: "none" as const,
      hands: dealFor("S", "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2"),
      auction: [],
      contract: { level: 3, strain: "N" as const, doubled: 0 as const, declarer: "W" as Seat },
      phase: "play" as const, turn: "S" as Seat,
      tricks: [{ leader: "W" as Seat, plays: [{ seat: "W" as Seat, card: c("S", 5) }] }],
      trickCount: { NS: 0, EW: 0 },
    };
    const ctx = { system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") }, authorities: ALL_AUTHORITIES };
    const card = { kind: "card" as const, seat: "S" as Seat, card: "S4", auctionSoFar: [], hand: "", fallback: false };

    const judged = await assessMove({ action: card, before, actor: "S", learnerSeat: "S" }, ctx, BUDGET.review);
    const asked = await assessMove({ action: card, before, actor: "S", learnerSeat: "S", asking: true }, ctx, BUDGET.asked);

    const authorities = (x: typeof judged) => [...new Set(x.findings.map((f) => f.authority))].sort();
    expect(authorities(judged)).toEqual(authorities(asked));
    // Specifically: the rulebook is consulted in BOTH directions now.
    expect(authorities(judged)).toContain("system");
  });

  it("INVARIANT 4 — silence is always attributable", async () => {
    // Mid-auction there is no contract, so no card assessor applies. The panel
    // must say why rather than return an unexplained empty result.
    const a = await assessMove(
      {
        action: { kind: "card" as const, seat: "S" as Seat, card: "S4", auctionSoFar: [], hand: "", fallback: false },
        before: initialState("b", "S", "none", dealFor("S", BALANCED_16)),
        actor: "S" as Seat,
        learnerSeat: "S" as Seat,
      },
      { system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") }, authorities: ALL_AUTHORITIES },
      BUDGET.review,
    );
    expect(a.findings).toEqual([]);
    expect(a.silentBecause).toBeTruthy();
    expect(a.silentBecause).toMatch(/no contract/i);
  });

  it("INVARIANT 5 — coverage is reported, never implied", async () => {
    const notes = await coachNotesForBoard({
      ...board([bid(0, "N", "1N"), bid(1, "E", "P")], dealFor("S", BALANCED_16)),
      learnerSeat: "S",
    });
    const status = listening(notes)!;
    // "2 calls played" alone would invite the assumption both were looked at.
    expect(status.detail).toMatch(/none of them were yours/i);
  });

  it("the budget, not a constant, sets how deep the search goes", () => {
    // Two hardcoded caps (5 when judging, 7 when asking) with the reason living
    // in a comment became one function of the caller's stated budget.
    expect(searchDepthFor(BUDGET.review.ms)).toBe(5);
    expect(searchDepthFor(BUDGET.asked.ms)).toBe(7);
    expect(searchDepthFor(0)).toBe(4);
    // Nothing above 7 is offered — 8 cards a hand measured 23 seconds.
    expect(searchDepthFor(10 ** 9)).toBe(7);
  });

  it("INVARIANT 6 — only judges moves that were YOURS to make", async () => {
    // A regression this suite failed to catch once already: collapsing the bid
    // and card paths into one panel dropped the ownership filter, and the coach
    // spent a board grading all four seats' cards — 49 notes, including the
    // opponents'. Worse, the learner was DUMMY, so not one of those cards was a
    // decision they made.
    const c = (suit: Suit, rank: number): Card => ({ suit, rank: rank as Card["rank"] });
    const hands = dealFor("S", BALANCED_16);

    // Contract 1♣ by North makes South (the learner) dummy.
    const asDummy = await coachNotesForBoard({
      ...board(
        [
          bid(0, "S", "P"),
          { category: "play-event", seq: 1, ts: 0, boardRef: "board-1", seat: "W", card: c("S", 5), fallback: false },
          { category: "play-event", seq: 2, ts: 0, boardRef: "board-1", seat: "N", card: c("S", 6), fallback: false },
        ],
        hands,
      ),
      learnerSeat: "S",
      contract: { level: 1, strain: "C", doubled: 0, declarer: "N" },
      trace: true,
    });

    // The trace is the proof: it lists every move the panel assessed, and no
    // card of West's or North's may appear in it.
    const trace = listening(asDummy)!.detail ?? "";
    expect(trace, "dummy's board must assess no cards").not.toMatch(/\bS5\b|\bS6\b/);
    // Their own call is still assessed — being dummy does not retract the auction.
    expect(trace.startsWith("Heard: S P.")).toBe(true);
    // And the status line reports zero judged rather than implying coverage.
    expect(trace).toMatch(/0 of them judged/);
  });

  // -------------------------------------------------------------------------
  // Advising ("what should I play?") — the same panel, asked instead of judging.
  // -------------------------------------------------------------------------

  const midHand = () => {
    const c = (suit: Suit, rank: number): Card => ({ suit, rank: rank as Card["rank"] });
    return {
      boardRef: "b", dealer: "W" as Seat, vul: "none" as const,
      hands: dealFor("S", "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2"),
      auction: [],
      contract: { level: 3, strain: "N" as const, doubled: 0 as const, declarer: "W" as Seat },
      phase: "play" as const, turn: "S" as Seat,
      // West led a small spade; South is second to play.
      tricks: [{ leader: "W" as Seat, plays: [{ seat: "W" as Seat, card: c("S", 5) }] }],
      trickCount: { NS: 0, EW: 0 },
    };
  };

  it("advises from YOUR RULEBOOK first, not the solver", async () => {
    // The solver sees all four hands, so on about half of all finesse positions
    // it will talk a learner out of the correct percentage play — no card leaked,
    // wrong habit taught. Your rulebook only knows what you know, so its advice
    // is reproducible at the table. That is why it leads.
    const advice = await advisePlay({
      state: midHand(),
      learnerSeat: "S",
      actor: "S",
      system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") },
    });
    expect(advice.best.length).toBeGreaterThan(0);
    expect(advice.source).not.toBe("solution");
    expect(["system", "convention"]).toContain(advice.source);
  });

  it("labels a calculated answer as calculated", async () => {
    // With no rulebook and no guideline in play, the solver may still answer —
    // but the learner is told where the answer came from rather than being left
    // to assume it was their own system.
    const c = (suit: Suit, rank: number): Card => ({ suit, rank: rank as Card["rank"] });
    const ending = {
      boardRef: "b", dealer: "S" as Seat, vul: "none" as const,
      hands: {
        S: [c("S", 14), c("S", 13)], W: [c("S", 4), c("S", 5)],
        N: [c("H", 14), c("H", 13)], E: [c("S", 6), c("S", 7)],
      } as Record<Seat, Card[]>,
      auction: [],
      contract: { level: 1, strain: "N" as const, doubled: 0 as const, declarer: "S" as Seat },
      phase: "play" as const, turn: "S" as Seat,
      tricks: [{ leader: "S" as Seat, plays: [] }],
      trickCount: { NS: 0, EW: 0 },
    };
    const advice = await advisePlay({
      state: ending,
      learnerSeat: "S",
      actor: "S",
      // A truly empty rulebook: no card rules AND no authored fallback, so only
      // the calculation can speak. Clearing `playRules` alone is not enough —
      // the KB's fallback item is a documented default and will answer, which is
      // the whole point of it.
      system: {
        compiled: { ...compiled, playRules: [], leadRules: [], fallbacks: [] },
        player: partnershipSystem(seatsWith([]), "S"),
      },
    });
    if (advice.best.length) expect(advice.source).toBe("solution");
    else expect(advice.silentBecause).toBeTruthy();
  });

  it("says why it cannot advise rather than inventing a card", async () => {
    const advice = await advisePlay({
      state: initialState("b", "S", "none", dealFor("S", BALANCED_16)),
      learnerSeat: "S",
      actor: "S",
      system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") },
    });
    expect(advice.best).toEqual([]);
    expect(advice.silentBecause).toBeTruthy();
    expect(advice.silentBecause).toMatch(/no contract/i);
  });

  it("INVARIANT 3 (production path) — advising uses the same panel as judging", async () => {
    // The earlier version of this invariant tested the panel directly while the
    // real route called its own fallback chain, so it passed while production
    // violated it. This one goes through `advisePlay`, which is what the route
    // calls, so the two cannot drift again.
    const state = midHand();
    const ctx = { system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") }, authorities: ALL_AUTHORITIES };

    const advice = await advisePlay({ state, learnerSeat: "S", actor: "S", ...ctx });
    const judged = await assessMove(
      {
        action: { kind: "card", seat: "S", card: "S4", auctionSoFar: [], hand: "", fallback: false },
        before: state, actor: "S", learnerSeat: "S",
      },
      ctx,
      BUDGET.review,
    );

    // The authority that advises must be one the judging panel also consults.
    expect(judged.findings.map((f) => f.authority)).toContain(advice.source);
  });

  it("answers from your system's DEFAULT when no technique applies, but never judges by it", async () => {
    // The refusal that started this: a learner pressed "what should I play?" on a
    // position the rulebook had a documented default for, and got "no rule or
    // guideline covers this trick". `decidePlay` marks both an authored fallback
    // item and the bare engine floor as `fallback: true`; only the first has a
    // rule id, and only the first is part of the learner's system.
    const c = (suit: Suit, rank: number): Card => ({ suit, rank: rank as Card["rank"] });
    // Declarer on lead mid-hand, where the three declarer lead rules don't fit.
    const state = {
      boardRef: "b", dealer: "W" as Seat, vul: "none" as const,
      hands: dealFor("S", "SA S8 S5 S4 S2 HJ H7 H5 H2 DA DJ DT D3"),
      auction: [],
      contract: { level: 2, strain: "S" as const, doubled: 0 as const, declarer: "S" as Seat },
      phase: "play" as const, turn: "S" as Seat,
      tricks: [{ leader: "S" as Seat, plays: [] }],
      trickCount: { NS: 0, EW: 0 },
    };
    const ctx = { system: { compiled, player: partnershipSystem(seatsWith(["pk_conventions"]), "S") }, authorities: ALL_AUTHORITIES };

    // ASKED: a default is a real answer, offered with lower confidence.
    const advice = await advisePlay({ state, learnerSeat: "S", actor: "S", ...ctx });
    if (advice.best.length) {
      expect(advice.source).toBe("system");
      expect(advice.because).toBeTruthy();
    } else {
      // If it still cannot answer, it must at least say so in learner language —
      // rulebook first, not "too deep for the search".
      expect(advice.silentBecause).toMatch(/your system/i);
    }

    // JUDGED: the same default must NOT produce a verdict. Marking a learner
    // wrong for departing from a catch-all is unfair, and the asymmetry is the
    // point rather than an accident.
    const judged = await assessMove(
      {
        action: { kind: "card", seat: "S", card: "S2", auctionSoFar: [], hand: "", fallback: false },
        before: state, actor: "S", learnerSeat: "S",
      },
      ctx,
      BUDGET.review,
    );
    const bySystem = judged.findings.filter((f) => f.authority === "system");
    for (const f of bySystem) {
      expect(f.because, "a judging finding must come from a real agreement").not.toMatch(
        /no special technique|fallback/i,
      );
    }
  });

  it("shows the lead sentence and keeps the rest behind a toggle", () => {
    // Knowledge items are reference material — a median of 100 characters in the
    // first sentence and several hundred after it. A learner mid-auction has room
    // for the first; the rest belongs one tap away, not gone.
    const item =
      "Open 1NT with a balanced 15-17 and no five-card major. The deck splits the " +
      "range further on slide 22, and the rebid narrows it again.";
    const { lead, rest } = splitDetail(item);
    expect(lead).toBe("Open 1NT with a balanced 15-17 and no five-card major.");
    expect(rest).toContain("slide 22");

    // A colon is not a sentence boundary — these items open with an all-caps
    // heading and the clause after it is the substance.
    const capsFirst = splitDetail(
      "SECOND HAND USUALLY PLAYS LOW: partner sits behind them and will cover. More text after.",
    );
    expect(capsFirst.lead).toMatch(/^SECOND HAND USUALLY PLAYS LOW: partner/);
    expect(capsFirst.rest).toBe("More text after.");

    // One long sentence still has to fit a line, and says it was cut.
    const long = splitDetail(`${"word ".repeat(60)}end.`);
    expect(long.lead.length).toBeLessThanOrEqual(191);
    expect(long.lead.endsWith("…")).toBe(true);
    expect(long.rest).toBeTruthy();

    // Nothing to hide means no toggle.
    expect(splitDetail("Open 2NT with a balanced 20-21.").rest).toBeUndefined();
  });
});