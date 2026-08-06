// Is the solver right? That is the only question this file exists to answer.
//
// It replaced one that was WRONG — an alpha-beta search caching values after a
// cutoff, where the number is a bound and not a result. That solver passed a test
// suite. The suite asserted STRUCTURE: that a verdict came back, that `tricksLost`
// was a number, that a bad card scored worse than a good one. None of that touches
// whether the count is correct, so all of it passed while the engine reported that
// both sides could win all five tricks of the same ending.
//
// So every position here has an answer worked out by hand and stated before
// anything ran. A test that only agrees with the implementation is how the last
// solver survived.

import { describe, expect, it } from "vitest";

import { DdsOracle, scoreEveryCard } from "./ddsOracle";
import type { LiveCardPlayState } from "@laic/coach/domains/bridge";

/** Everything a solve needs; the pedagogical fields are furniture here. */
function position(over: {
  hands: LiveCardPlayState["hands"];
  playFromSeat: LiveCardPlayState["playFromSeat"];
  legalCards: string[];
  trump?: LiveCardPlayState["trump"];
  trickSoFar?: LiveCardPlayState["trickSoFar"];
}): LiveCardPlayState {
  return {
    contract: "3NT",
    trump: over.trump ?? "NT",
    declarer: "S",
    learnerSeat: "S",
    role: "declarer",
    dummySeat: "N",
    tricksPlayed: 0,
    toLead: !over.trickSoFar?.length,
    trickSoFar: over.trickSoFar ?? [],
    ...over,
  };
}

const tricksFor = (scores: { card: string; tricks: number }[], card: string) =>
  scores.find((s) => s.card === card)?.tricks;
const bestOf = (scores: { card: string; tricks: number }[]) =>
  Math.max(...scores.map((s) => s.tricks));

describe("the double-dummy engine", () => {
  it("counts a run of winners: three top spades take exactly three tricks", async () => {
    // N leads A-K-Q of spades opposite three small. The defenders hold no spade at
    // all, and at notrump they cannot ruff, so they cannot win a trick. Three, and
    // there is no fourth to be had — the hands are three cards long.
    const scores = await scoreEveryCard(
      position({
        hands: { N: "S:AKQ", E: "H:AKQ", S: "S:432", W: "H:432" },
        playFromSeat: "N",
        legalCards: ["SA", "SK", "SQ"],
      }),
    );
    expect(scores).toBeDefined();
    // Every spade is a winner and they are interchangeable — whichever N leads, the
    // other two follow. All three must read 3, not just the ace.
    expect(scores!.map((s) => s.tricks).sort()).toEqual([3, 3, 3]);
  });

  it("counts a certain loser: the defence's ace must make", async () => {
    // NS hold K-Q-J of spades; West holds the ace and two small. Whatever N leads,
    // West takes one with the ace and NS take the other two. Two, never three, from
    // any card — the case a broken search gets wrong by reporting its optimistic
    // bound instead of a result.
    const scores = await scoreEveryCard(
      position({
        hands: { N: "S:KQJ", E: "H:AKQ", S: "S:432", W: "S:A65" },
        playFromSeat: "N",
        legalCards: ["SK", "SQ", "SJ"],
      }),
    );
    expect(scores!.map((s) => s.tricks)).toEqual([2, 2, 2]);
  });

  it("prices the card that throws two tricks", async () => {
    // A lone queen led into A-J-T, and it costs everything.
    //
    // North holds A-K of spades and the bare Q♥; East holds A-J-10 of hearts. Cash
    // the spades and North makes two, then loses the last trick to the heart ace.
    // Lead the Q♥ at trick one and East takes it with the ace, then leads hearts
    // twice more — North, with no hearts left, has to throw the A♠ and the K♠ under
    // them. Two tricks to nothing, and the exact figure matters below.
    //
    // The FIRST version of this test was a position I had reasoned about wrongly:
    // "North leads a low club into East's king" ignored that the club runs to
    // South's ace, because South is North's partner. DDS said all three cards were
    // equal, which was correct, and the test called it a failure. Worth recording,
    // because it is the failure mode this whole file guards against — the engine
    // being right and the expectation being wrong is indistinguishable from the
    // reverse until you check the bridge by hand.
    const scores = await scoreEveryCard(
      position({
        hands: { N: "S:AK H:Q", E: "H:AJT", S: "S:432", W: "H:432" },
        playFromSeat: "N",
        legalCards: ["SA", "SK", "HQ"],
      }),
    );
    expect(tricksFor(scores!, "SA")).toBe(2);
    expect(tricksFor(scores!, "SK")).toBe(2);
    expect(tricksFor(scores!, "HQ")).toBe(0);
  });

  it("knows a trump from a plain suit", async () => {
    // The SAME cards twice, changing only the strain. At notrump N runs A-K-Q of
    // spades for three. At clubs, East and West hold nothing but clubs, so the
    // first spade is ruffed and NS take none.
    //
    // The assertion is a DIFFERENCE rather than a number, because that is what has
    // no innocent explanation: an engine ignoring `trump` passes the notrump half
    // and cannot pass both.
    const hands = { N: "S:AKQ", E: "C:432", S: "S:JT9", W: "C:AKQ" } as const;
    const atNotrump = await scoreEveryCard(
      position({ hands, playFromSeat: "N", legalCards: ["SA", "SK", "SQ"] }),
    );
    const atClubs = await scoreEveryCard(
      position({ hands, playFromSeat: "N", legalCards: ["SA", "SK", "SQ"], trump: "C" }),
    );
    expect(bestOf(atNotrump!)).toBe(3);
    expect(bestOf(atClubs!)).toBe(0);
  });

  it("reads a trick already in progress", async () => {
    // THE SAME TWENTY-FOUR CARDS, once at a fresh lead and once with West having
    // already led — and the answer has to move from three tricks to none.
    //
    // On lead, North runs A-K-Q of spades: nobody else holds a spade and at notrump
    // nothing can beat them. Three.
    //
    // Now let West have led the 4♥. North is void in hearts and must discard a
    // spade winner. East wins with a heart honour and simply leads hearts again;
    // East-West hold every one of them, so they take all three tricks and North's
    // spades die one by one under them. Nought.
    //
    // Note what makes West's hand two cards and everyone else's three: the 4♥ is on
    // the table, so it is gone from `hands`. That unevenness is the position the
    // length guard used to reject outright.
    const hands = { N: "S:AKQ", E: "H:AKQ", S: "S:432", W: "H:432" } as const;
    const onLead = await scoreEveryCard(
      position({ hands, playFromSeat: "N", legalCards: ["SA", "SK", "SQ"] }),
    );
    const midTrick = await scoreEveryCard(
      position({
        hands: { ...hands, W: "H:32" },
        playFromSeat: "N",
        legalCards: ["SA", "SK", "SQ"],
        trickSoFar: [{ seat: "W", card: "H4" }],
      }),
    );
    expect(bestOf(onLead!)).toBe(3);
    expect(midTrick).toBeDefined();
    expect(bestOf(midTrick!)).toBe(0);
  });

  it("scores only the cards it was told are legal", async () => {
    // Legality belongs to the caller; the engine is asked about the position. If a
    // card outside `legalCards` came back, the coach would recommend a revoke.
    const scores = await scoreEveryCard(
      position({
        hands: { N: "S:A2 H:A", E: "S:Q3 H:K", S: "S:54 H:Q", W: "H:J2" },
        playFromSeat: "N",
        legalCards: ["SA"],
        trickSoFar: [{ seat: "W", card: "S6" }],
      }),
    );
    expect(scores!.map((s) => s.card)).toEqual(["SA"]);
  });

  it("reads a VOID, written as a dash, and does not count it as a card", async () => {
    // THE BUG THAT MADE ALL OF THIS INVISIBLE IN THE APP. `renderHand` writes a void
    // suit as "D:-", and the parser walked the characters, so the dash became a
    // phantom card and the hand measured one too long for every void it held. The
    // four-equal-lengths check then rejected the deal, `scoreEveryCard` returned
    // undefined, the assessor abstained, and the panel printed "the hand is too deep
    // to work out exactly" — a depth limit that had already been deleted.
    //
    // Voids are ordinary. By trick two most deals have one, which is why the coach
    // looked switched off while the engine was perfectly healthy: nothing was
    // reaching it. Every benchmark passed because they built card lists directly.
    //
    // Same three cards a side as the run-of-winners case, now spelled with explicit
    // dashes in every suit nobody holds. The answer must not move.
    const scores = await scoreEveryCard(
      position({
        hands: {
          N: "S:AKQ H:- D:- C:-",
          E: "S:- H:AKQ D:- C:-",
          S: "S:432 H:- D:- C:-",
          W: "S:- H:432 D:- C:-",
        },
        playFromSeat: "N",
        legalCards: ["SA", "SK", "SQ"],
      }),
    );
    expect(scores).toBeDefined();
    expect(scores!.map((s) => s.tricks).sort()).toEqual([3, 3, 3]);
  });

  it("answers at trick two with the declarer playing from dummy", async () => {
    // The exact shape the app was silent on: a real deal, a trick already complete,
    // three cards down in the current trick, dummy to play, and South void in
    // diamonds. Uneven hands AND a void AND a mid-trick position at once.
    const scores = await scoreEveryCard(
      position({
        hands: {
          N: "S:KJT8 H:A76 D:87 C:987",
          E: "S:2 H:543 D:654 C:5432",
          S: "S:Q97 H:KQJT98 D:- C:AK",
          W: "S:65 H:2 D:KQJT2 C:QJT",
        },
        playFromSeat: "N",
        legalCards: ["SK", "SJ", "ST", "S8"],
        trump: "H",
        trickSoFar: [
          { seat: "E", card: "S3" },
          { seat: "S", card: "SA" },
          { seat: "W", card: "S4" },
        ],
      }),
    );
    expect(scores).toHaveLength(4);
    // North holds K-J-10-8 over East's bare deuce with the trick already won by the
    // A♠ — every card is equivalent here, and all four must be offered rather than
    // one picked arbitrarily.
    expect(new Set(scores!.map((s) => s.tricks)).size).toBe(1);
  });

  it("abstains rather than guesses when the hands cannot be reconciled", async () => {
    // East is a card short and has not played to this trick, so the state is wrong
    // rather than mid-trick. An oracle that answers anyway is the dangerous kind.
    expect(
      await scoreEveryCard(
        position({
          hands: { N: "S:AKQ", E: "H:AK", S: "S:432", W: "H:432" },
          playFromSeat: "N",
          legalCards: ["SA"],
        }),
      ),
    ).toBeUndefined();
  });

  it("solves a full thirteen-card deal — the depth the old solver could not reach", async () => {
    // The previous engine was budget-gated to about seven cards a hand, because
    // eight measured twenty-three seconds; trick one was simply unanswerable. This
    // is trick one, and the answer is hand-checkable because the deal is rigged:
    // each seat holds one entire suit. North leads spades, nobody else holds one,
    // and at notrump no card of another suit can win a spade trick. Thirteen
    // straight, and the same for any spade North chooses to start with.
    const scores = await scoreEveryCard(
      position({
        hands: {
          N: "S:AKQJT98765432",
          E: "D:AKQJT98765432",
          S: "H:AKQJT98765432",
          W: "C:AKQJT98765432",
        },
        playFromSeat: "N",
        legalCards: ["SA", "S7", "S2"],
      }),
    );
    expect(scores!.map((s) => s.tricks)).toEqual([13, 13, 13]);
  });

  it("solves a realistic full deal", async () => {
    // A genuine 52-card deal, so a genuine search rather than the rigged one above.
    // No hand-known answer here — the assertion is that it completes and stays in
    // range, which is what the old solver could not do at this depth at any price.
    const scores = await scoreEveryCard(
      position({
        hands: {
          N: "S:AKQ4 H:K32 D:A65 C:974",
          E: "S:JT9 H:QJT D:KQ2 C:8632",
          S: "S:8765 H:A54 D:JT9 C:AKQ",
          W: "S:32 H:9876 D:8743 C:JT5",
        },
        playFromSeat: "S",
        legalCards: ["S8", "CA", "HA"],
      }),
    );
    expect(scores).toHaveLength(3);
    for (const s of scores!) {
      expect(s.tricks).toBeGreaterThanOrEqual(0);
      expect(s.tricks).toBeLessThanOrEqual(13);
    }
  });
});

describe("the oracle's verdict", () => {
  const forcedLoser = () =>
    position({
      hands: { N: "S:KQJ", E: "H:AKQ", S: "S:432", W: "S:A65" },
      playFromSeat: "N",
      legalCards: ["SK", "SQ", "SJ"],
    });

  it("charges nothing for a card that ties for best", async () => {
    const verdict = await new DdsOracle().evaluate(forcedLoser(), "SK");
    expect(verdict).toMatchObject({ playedTricks: 2, bestTricks: 2, tricksLost: 0 });
    // All three honours are equal here and the verdict has to say all three. A
    // single `bestAction` is what had the coach naming one of them arbitrarily.
    expect(verdict!.bestCards.sort()).toEqual(["SJ", "SK", "SQ"]);
  });

  it("charges the exact number of tricks, not a severity band", async () => {
    // The cost used to be reverse-engineered from the severity — critical→3,
    // major→2, otherwise 1 — a guess made in front of an engine holding the figure.
    // Leading the bare Q♥ into A-J-10 costs TWO, and two is what has to come out.
    const verdict = await new DdsOracle().evaluate(
      position({
        hands: { N: "S:AK H:Q", E: "H:AJT", S: "S:432", W: "H:432" },
        playFromSeat: "N",
        legalCards: ["SA", "SK", "HQ"],
      }),
      "HQ",
    );
    expect(verdict).toMatchObject({ playedTricks: 0, bestTricks: 2, tricksLost: 2 });
  });

  it("never reports a negative trick count", async () => {
    // DDS signals through the score field: -1 for "target not reached", -2 for "not
    // searched". They are numbers, so they subtract and sort like real counts — the
    // mode-0 bug surfaced as a tidy-looking `bestTricks: -1, playedTricks: -2,
    // tricksLost: 1`, charging a learner a trick on a position nobody had solved.
    // Across a spread of shapes, every count here is a real one or there is none.
    const shapes: Parameters<typeof position>[0][] = [
      // A single equivalence class, which is what triggered it: A-K-Q with nothing
      // in between is one choice, and every clean run of winners looks like this.
      { hands: { N: "S:AKQ", E: "H:AKQ", S: "S:432", W: "H:432" }, playFromSeat: "N", legalCards: ["SA", "SK", "SQ"] },
      { hands: { N: "S:KQJ", E: "H:AKQ", S: "S:432", W: "S:A65" }, playFromSeat: "N", legalCards: ["SK"] },
      { hands: { N: "S:AK H:Q", E: "H:AJT", S: "S:432", W: "H:432" }, playFromSeat: "N", legalCards: ["SA", "HQ"] },
    ];
    for (const shape of shapes) {
      const scores = await scoreEveryCard(position(shape));
      expect(scores).toBeDefined();
      for (const s of scores!) expect(s.tricks).toBeGreaterThanOrEqual(0);
    }
  });

  it("declines to judge a card that is not legal here", async () => {
    expect(await new DdsOracle().evaluate(forcedLoser(), "HA")).toBeUndefined();
  });

  it("carries the table, and the table names no hidden card", async () => {
    const verdict = await new DdsOracle().evaluate(forcedLoser(), "SK");
    expect(verdict!.scores).toHaveLength(3);
    // A trick count per legal card, and nothing else. This is what may cross into a
    // prompt: every entry is a consequence, and consequences are not holdings.
    for (const s of verdict!.scores!) {
      expect(typeof s.tricks).toBe("number");
      expect(forcedLoser().legalCards).toContain(s.card);
    }
  });
});
