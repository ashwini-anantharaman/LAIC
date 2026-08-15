// "Help me think" — the reasoning scaffold, with no authority in it.
//
// The facts card (looking.ts) says what IS. This says what can be WORKED OUT
// from it, and what the realistic choices are. It does not say which to take.
//
// EVERYTHING HERE IS DETERMINISTIC and derived only from cards this learner can
// legitimately see: their own hand, dummy once it is face up, and every card
// already played. It calls no model, consults no knowledge base, and never reads
// a concealed hand — so nothing here can be wrong, only missing. That is the
// property worth protecting, because it means this ships and stays useful against
// a knowledge base that is not finished and with no API key configured.
//
// LAYER 1 OF TWO. The model's job, later, is to add what each candidate DOES,
// what a bid PROMISES, and the framing question — and to be structurally blind to
// the solver while doing it. What it must never do is reorder or annotate these
// candidates in a way that betrays the answer, because a learner reads that tell
// faster than they read the position.
//
// The candidate list being derivable without judgment was the surprise. Following
// suit leaves two to five cards, and "your lowest, your highest, and any honour
// between" is a mechanical rule that covers the real decision. In the auction,
// the cheapest call in each strain plus pass is six or seven options and contains
// the sensible ones almost always. Neither needs an opinion.

import { hcp, legalCalls, legalPlays } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { Call, Card, Seat, Suit } from "@bridge/events";

import {
  cardLabel, callLabel, dealtHand, GLYPH, isHonour, partnerOf,
  Relative, relative, SUITS, SUIT_WORD, visibleSeats,
} from "./position";

export interface ThinkCandidate {
  /** What the learner would do — "the 3♦", "2♣", "Pass". */
  label: string;
  /**
   * A FACTUAL qualifier only: "your lowest diamond", "cheapest in clubs".
   * Never a reason to prefer it. The model fills `does` later.
   */
  note?: string;
  /** What choosing it accomplishes. Model-supplied; absent in layer 1. */
  does?: string;
}

/**
 * Which of the Game State's three views a fact belongs to (owner direction
 * 2026-08-14): the learner's own hand, what partner's bids have shown, or
 * what the two hands add up to. Absent means "me".
 */
export type StateGroup = "me" | "partner" | "partnership";

/**
 * One worked-out fact as a two-sided card: a glanceable front (a short title
 * and a value the size of a chip) and the full sentence on the back. The
 * sentence is the source of truth — `ThinkAid.known` is derived from these,
 * so every existing consumer of the plain lines keeps reading exactly what it
 * always read.
 */
export interface KnownCard {
  /** Two-or-three-word headline — "Points out there", "Partner's points". */
  title: string;
  /** The front's centrepiece — "33", "12–21", "no ♦s". Short. */
  value: string;
  /** The back: the whole fact as one sentence. */
  detail: string;
  /** Which Game State view it files under. Absent = the learner's own state. */
  group?: StateGroup;
}

export interface ThinkAid {
  /** What can be worked out from what the learner can see. */
  known: string[];
  /** The same facts as flip cards — front/back pairs for the Game State UI. */
  knownCards: KnownCard[];
  /** The realistic choices, unranked and unmarked. */
  candidates: ThinkCandidate[];
  /** Set instead of candidates when there is genuinely nothing to weigh. */
  noChoice?: string;
  /** The framing question. Model-supplied; absent in layer 1. */
  question?: string;
  /** True while the framing layer has not run — the panel says so. */
  degraded: boolean;
}

type ThinkState = Pick<
  GameState,
  "phase" | "auction" | "hands" | "tricks" | "contract" | "turn" | "dealer" | "vul"
>;

/**
 * The scaffold, or `null` when there is nothing to scaffold.
 *
 * `null` for a watcher (no hand to reason from) and for dummy (no decision to
 * make — declarer plays those cards).
 */
export function thinkAid(state: ThinkState, seat: Seat | null): ThinkAid | null {
  if (!seat) return null;

  // The cards carry the facts; the plain lines every older consumer reads are
  // their backs, verbatim. One source, two shapes.
  const withKnown = (cards: KnownCard[]) => ({
    known: cards.map((c) => c.detail),
    knownCards: cards,
  });

  if (state.phase === "auction") {
    return {
      ...withKnown(knownInAuction(state, seat)),
      candidates: auctionCandidates(state, seat),
      degraded: true,
    };
  }

  if (state.phase === "play" && state.contract) {
    const declarer = state.contract.declarer;
    const dummy = partnerOf(declarer);

    if (seat === dummy) {
      return {
        ...withKnown([
          {
            title: "Your role",
            value: "dummy",
            detail: "You're dummy — partner plays your cards.",
          },
        ]),
        candidates: [],
        noChoice: "Nothing to choose while you're dummy.",
        degraded: true,
      };
    }

    // WHOSE CARD IS ON OFFER IS NOT ALWAYS YOUR OWN HAND. Declarer plays both
    // hands, so at dummy's turn the decision is which of DUMMY's cards to play.
    // Reading candidates out of the learner's own hand there was a real bug: on a
    // 3♥ with West leading, the panel offered the declarer's ♦Q and ♦7 when the
    // card to play was one of dummy's ♦J ♦10 ♦6. The facts were right — the point
    // count and the suit count already included dummy — but the choices were from
    // the wrong hand, and the note called them "your" diamonds.
    const controlled: Seat[] = seat === declarer ? [seat, dummy] : [seat];
    const actor = controlled.includes(state.turn) ? state.turn : undefined;

    if (!actor) {
      return {
        ...withKnown(knownInPlay(state, seat)),
        candidates: [],
        noChoice: `${Relative(state.turn, seat)} to play — nothing for you to choose yet.`,
        degraded: true,
      };
    }

    const legal = legalPlays(state as GameState, actor);
    const fromDummy = actor === dummy;
    return {
      ...withKnown(knownInPlay(state, seat)),
      candidates: legal.length <= 1 ? [] : playCandidates(legal, state, fromDummy),
      ...(legal.length === 1
        ? {
            noChoice: `Only one legal card${fromDummy ? " in dummy" : ""}: the ${cardLabel(legal[0]!)}.`,
          }
        : {}),
      degraded: true,
    };
  }

  return null;
}

/* ───────────────────────── the auction ───────────────────────── */

function knownInAuction(state: ThinkState, seat: Seat): KnownCard[] {
  const out: KnownCard[] = [];
  const mine = dealtHand(state, seat);

  // 40 points in a deck. Yours are yours; the rest are somewhere.
  out.push({
    title: "Points out there",
    value: String(40 - hcp(mine)),
    detail: `${40 - hcp(mine)} of the 40 points sit in the other three hands.`,
  });

  // "IF YOU PASS" and "THE AUCTION" retired (owner direction 2026-08-14):
  // the Game State classifies into My state / My partner / Partnership now,
  // and neither of those cards described a hand — they narrated the auction,
  // which the History tab already does.

  return out;
}

/**
 * The cheapest call in each strain, plus pass and any legal double.
 *
 * Mechanical on purpose. There are up to thirty-five legal calls and the bidding
 * box already lists them; what it cannot do is say which handful are the actual
 * decision. Cheapest-per-strain is not a judgment — it is the observation that
 * you would never bid 3♣ while 2♣ is available unless you meant something extra,
 * and "something extra" is a meaning, which belongs to layer 2.
 */
function auctionCandidates(state: ThinkState, seat: Seat): ThinkCandidate[] {
  const legal = legalCalls(state.auction, seat);
  const out: ThinkCandidate[] = [];

  if (legal.has("P" as Call)) out.push({ label: "Pass", note: "say nothing" });
  if (legal.has("X" as Call)) out.push({ label: "Double", note: "of their contract" });
  if (legal.has("XX" as Call)) out.push({ label: "Redouble", note: "of their double" });

  for (const strain of ["C", "D", "H", "S", "N"] as const) {
    for (let level = 1; level <= 7; level++) {
      const call = `${level}${strain}` as Call;
      if (!legal.has(call)) continue;
      out.push({
        label: callLabel(call),
        note: strain === "N" ? "cheapest notrump" : `cheapest in ${SUIT_WORD[strain as Suit]}s`,
      });
      break; // cheapest only
    }
  }
  return out;
}

/* ───────────────────────── the play ───────────────────────── */

function knownInPlay(state: ThinkState, seat: Seat): KnownCard[] {
  const out: KnownCard[] = [];
  const contract = state.contract!;
  const declarer = contract.declarer;
  const seen = visibleSeats(state, seat);

  // POINTS UNACCOUNTED FOR. Pure subtraction over hands the learner may see, and
  // the single most useful inference available to a defender.
  const accounted = seen.reduce((n, s) => n + hcp(dealtHand(state, s)), 0);
  const missing = 40 - accounted;
  const between =
    seat === declarer
      ? "between the two defenders"
      : `between partner and ${relative(declarer, seat)}`;
  out.push({
    title: "Points hidden",
    value: String(missing),
    detail: `${missing} points sit ${between}.`,
  });

  // SHOWING OUT IS PROOF. If a seat failed to follow a led suit, they hold none
  // of it — a fact, not a read, and free from the trick record.
  for (const s of ["N", "E", "S", "W"] as Seat[]) {
    if (seen.includes(s)) continue;
    const voids = new Set<Suit>();
    for (const trick of state.tricks) {
      const led = trick.plays[0];
      if (!led) continue;
      const theirs = trick.plays.find((p) => p.seat === s);
      if (theirs && theirs.card.suit !== led.card.suit) voids.add(led.card.suit);
    }
    for (const v of voids) {
      out.push({
        title: Relative(s, seat),
        value: `no ${GLYPH[v]}s`,
        detail: `${Relative(s, seat)} has no ${SUIT_WORD[v]}s — they couldn't follow suit.`,
        // A proof about PARTNER's hand files under the partner view.
        ...(s === partnerOf(seat) ? { group: "partner" as const } : {}),
      });
    }
  }

  // WHAT IS STILL OUT in the suit that matters right now.
  const current = state.tricks[state.tricks.length - 1];
  const inProgress = current && !current.winner ? current : undefined;
  const focus: Suit | undefined = inProgress?.plays[0]?.card.suit ?? longestOwn(state, seat);
  if (focus) {
    const outstanding = 13 - accountedIn(state, seat, focus);
    out.push(
      outstanding <= 0
        ? {
            title: "Still out",
            value: `no ${GLYPH[focus]}s`,
            detail: `No ${SUIT_WORD[focus]}s are left in the hidden hands.`,
          }
        : {
            title: "Still out",
            value: `${outstanding} ${GLYPH[focus]}`,
            detail: `${outstanding} ${GLYPH[focus]} ${outstanding === 1 ? "is" : "are"} still in the hidden hands.`,
          },
    );
  }

  // WHO HOLDS THE TRICK. Visible to anyone, easy to lose track of.
  if (inProgress?.plays.length) {
    const led = inProgress.plays[0]!.card.suit;
    const best = inProgress.plays
      .filter((p) => p.card.suit === led)
      .reduce((a, b) => (b.card.rank > a.card.rank ? b : a));
    out.push({
      title: "Winning so far",
      value: best.seat === seat ? "you" : Relative(best.seat, seat),
      detail: `${Relative(best.seat, seat)} ${best.seat === seat ? "are" : "is"} winning it with the ${cardLabel(best.card)}.`,
    });
  }

  return out;
}

/** How many of `suit` the learner can already account for, without double counting. */
function accountedIn(state: ThinkState, seat: Seat, suit: Suit): number {
  const seen = visibleSeats(state, seat);
  // Every card of this suit in a hand we may see — dealt, so played ones count once.
  const inSeenHands = seen.reduce(
    (n, s) => n + dealtHand(state, s).filter((c) => c.suit === suit).length,
    0,
  );
  // Plus any played from a hand we may NOT see.
  const fromHidden = state.tricks
    .flatMap((t) => t.plays)
    .filter((p) => !seen.includes(p.seat) && p.card.suit === suit).length;
  return inSeenHands + fromHidden;
}

/** The learner's own longest remaining suit — the fallback focus between tricks. */
function longestOwn(state: ThinkState, seat: Seat): Suit | undefined {
  let best: Suit | undefined;
  let n = 0;
  for (const s of SUITS) {
    const len = state.hands[seat].filter((c) => c.suit === s).length;
    if (len > n) { n = len; best = s; }
  }
  return best;
}

/**
 * Your lowest, your highest, and any honour between.
 *
 * The mechanical rule that turns two-to-five legal cards into the actual
 * decision, without ranking them. A holding of K-10-6 becomes three choices; 8-5
 * becomes two; A-K-Q-J becomes four, which is correct — with a solid sequence the
 * choice really is that wide and really does not matter much.
 *
 * When the learner cannot follow suit it is one card per suit instead, because
 * the decision is which suit to let go of, not which card within it.
 */
function playCandidates(legal: Card[], state: ThinkState, fromDummy: boolean): ThinkCandidate[] {
  // "your lowest diamond" is false when the card belongs to dummy, and a coach
  // that misattributes a card is worse than one that says nothing about it.
  const whose = fromDummy ? "dummy's" : "your";
  const led = (() => {
    const current = state.tricks[state.tricks.length - 1];
    const inProgress = current && !current.winner ? current : undefined;
    return inProgress?.plays[0]?.card.suit;
  })();
  const following = Boolean(led) && legal.every((c) => c.suit === led);

  if (!following) {
    // A discard, or a lead: one per suit, lowest, since the suit is the decision.
    const out: ThinkCandidate[] = [];
    for (const s of SUITS) {
      const inSuit = legal.filter((c) => c.suit === s);
      if (!inSuit.length) continue;
      const low = inSuit.reduce((a, b) => (b.rank < a.rank ? b : a));
      out.push({
        label: cardLabel(low),
        note:
          inSuit.length === 1
            ? `${whose} only ${SUIT_WORD[s]}`
            : `lowest of ${whose} ${inSuit.length} ${SUIT_WORD[s]}s`,
      });
    }
    return out;
  }

  const asc = [...legal].sort((a, b) => a.rank - b.rank);
  const low = asc[0]!;
  const high = asc[asc.length - 1]!;
  const picked: Card[] = [low];
  for (const c of asc.slice(1, -1)) if (isHonour(c)) picked.push(c);
  if (high !== low) picked.push(high);

  return picked.map((c, i) => ({
    label: cardLabel(c),
    note:
      i === 0
        ? `${whose} lowest ${SUIT_WORD[c.suit]}`
        : c === high
          ? `${whose} highest ${SUIT_WORD[c.suit]}`
          : "in between",
  }));
}
