// Curated deals — the coach's annotated board (owner design 2026-08-15).
//
// A curated deal is a LibraryEntry whose `auction`/`play` layers hold the
// coach's RECORDED LINE (the golden path, robots' actions included) and whose
// `curatedJson` holds the OVERLAY: per-decision annotations — a "your coach
// says" note, the reason behind the charted move, and optionally a custom
// hint ladder replacing Owlee's for that decision.
//
// This file owns the payload's shape and its tolerant validator (the
// challengeDraftJson discipline: the entry stores a string; the app
// re-validates on every read, so entries saved before a field existed still
// open), plus the line arithmetic every consumer shares: is this session
// still ON the coach's line, and which decision is the learner at.

import type { GameState } from "@bridge/engine";
import { partnerOf } from "@bridge/events";
import type { Call, Card, Seat } from "@bridge/events";
import type { LibraryEntry } from "@bridge/sessions";

import { parseKItemIds, parseKTags } from "./coach/kItems";
import type { KItemId, KTag } from "./coach/kItems";

/** Where an annotation lives — the panel's own addressing (auctionIndex /
 *  trickIndex+playIndex), the same keys the what-if and verdicts use. */
export type CuratedAt =
  | { kind: "call"; auctionIndex: number }
  | { kind: "play"; trickIndex: number; playIndex: number };

export interface CuratedAnnotation {
  at: CuratedAt;
  /** "Your coach says…" — the note shown automatically at this decision. */
  note?: string;
  /** Why the charted move is right (the move itself is the line's next
   *  action at this position — data, not authored text). */
  why?: string;
  /** A custom hint ladder for this decision, replacing Owlee's (2–5 rungs). */
  hints?: string[];
}

/** How tightly the learner is held to the line (v2, owner design 2026-08-18).
 *  `guided` is the v1 behavior and the default a payload without the field
 *  gets, so every published deal keeps meaning what it meant. */
export type CuratedConstraint = "locked" | "guided" | "free";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
const CONSTRAINTS: readonly CuratedConstraint[] = ["locked", "guided", "free"];

export interface CuratedPayload {
  /** Absent = v1 (an annotate-your-sitting deal). Stamped 2 on publish. */
  v?: 2;
  annotations: CuratedAnnotation[];
  /** The seat the coach built this board FOR. Absent = "S" (v1 always sat
   *  the learner South). */
  learnerSeat?: Seat;
  /** Absent = "guided" — the v1 nudge-and-take-back experience. */
  constraint?: CuratedConstraint;
  /** The coach's framing, shown before the first decision. */
  intro?: string;
  /** The coach's closing words, shown when the board completes. */
  debrief?: string;
  /** The coach's pinned read — one per deal, rides the Know pane. */
  pin?: string;
  /**
   * WHAT THIS DEAL TEACHES, part one (owner direction 2026-08-18) — the K item
   * TAGS: the deal's topic, and what the coach filtered the catalogue by while
   * choosing its cards. They also name the lesson on screen. Absent = no topic
   * named.
   */
  kTags?: KTag[];
  /**
   * WHAT THIS DEAL TEACHES, part two (owner direction 2026-08-19) — the K
   * ITEMS themselves, hand-picked. These ARE the collection the learner's Know
   * panel leads with, so the flip cards are the coach's curriculum choice card
   * by card rather than whatever a topic happens to sweep up. Absent = the
   * coach picked no cards, and the panel falls back to the tags' collections
   * (or, with no tags either, to its own defaults).
   */
  kItems?: KItemId[];
}

const MAX_NOTE = 500;
const MAX_HINT = 220;
/** No deal teaches more than this; a board claiming twelve topics teaches none. */
const MAX_TAGS = 6;
/** And no board leads with more cards than this — the Know panel's fronts are
 *  glanceable a few at a time (kSelection.MAX_DEAL_ITEMS, kept local so the
 *  validator stays dependency-free). */
const MAX_ITEMS = 8;

/** The centralized v1 defaults — every consumer reads these, never the raw
 *  optionals, so "absent" can only ever mean one thing. */
export const learnerSeatOf = (p: Pick<CuratedPayload, "learnerSeat">): Seat =>
  p.learnerSeat ?? "S";
export const constraintOf = (p: Pick<CuratedPayload, "constraint">): CuratedConstraint =>
  p.constraint ?? "guided";

/**
 * The tolerant read. Anything unreadable is dropped ALONE; a payload from a
 * future or past shape yields whatever annotations still parse rather than
 * an error — parking work must always reopen.
 */
export function parseCurated(json: string | undefined): CuratedPayload {
  if (!json) return { annotations: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { annotations: [] };
  }
  // The v2 board settings, each readable alone — a payload whose constraint
  // is junk still keeps its learnerSeat, and vice versa.
  const head = (raw ?? {}) as {
    annotations?: unknown;
    learnerSeat?: unknown;
    constraint?: unknown;
    intro?: unknown;
    debrief?: unknown;
    pin?: unknown;
    kTags?: unknown;
    kItems?: unknown;
  };
  const text = (v: unknown, max: number): string | undefined => {
    const t = typeof v === "string" ? v.trim().slice(0, max) : "";
    return t || undefined;
  };
  const settings: Omit<CuratedPayload, "annotations"> = {
    ...(SEATS.includes(head.learnerSeat as Seat) ? { learnerSeat: head.learnerSeat as Seat } : {}),
    ...(CONSTRAINTS.includes(head.constraint as CuratedConstraint)
      ? { constraint: head.constraint as CuratedConstraint }
      : {}),
    ...(text(head.intro, MAX_NOTE) ? { intro: text(head.intro, MAX_NOTE) } : {}),
    ...(text(head.debrief, MAX_NOTE) ? { debrief: text(head.debrief, MAX_NOTE) } : {}),
    ...(text(head.pin, MAX_HINT) ? { pin: text(head.pin, MAX_HINT) } : {}),
    // The lesson, under the same rule as everything else here: unknown tags
    // drop ALONE, so a deal authored against a newer vocabulary keeps the
    // tags this build still recognizes instead of losing its lesson whole.
    ...((): { kTags?: KTag[] } => {
      const tags = parseKTags(head.kTags).slice(0, MAX_TAGS);
      return tags.length ? { kTags: tags } : {};
    })(),
    // The cards, under that same rule: an id from a newer catalogue drops
    // alone, so a lesson keeps the cards this build still has instead of
    // losing the whole collection to one unknown.
    ...((): { kItems?: KItemId[] } => {
      const items = parseKItemIds(head.kItems).slice(0, MAX_ITEMS);
      return items.length ? { kItems: items } : {};
    })(),
  };
  const withSettings = (annotations: CuratedAnnotation[]): CuratedPayload =>
    Object.keys(settings).length ? { v: 2, annotations, ...settings } : { annotations };

  const list = head.annotations;
  if (!Array.isArray(list)) return withSettings([]);

  const out: CuratedAnnotation[] = [];
  for (const a of list) {
    if (typeof a !== "object" || a === null) continue;
    const o = a as {
      at?: { kind?: unknown; auctionIndex?: unknown; trickIndex?: unknown; playIndex?: unknown };
      note?: unknown;
      why?: unknown;
      hints?: unknown;
    };
    const idx = (n: unknown): number | null =>
      typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 400 ? n : null;
    let at: CuratedAt | null = null;
    if (o.at?.kind === "call") {
      const i = idx(o.at.auctionIndex);
      if (i !== null) at = { kind: "call", auctionIndex: i };
    } else if (o.at?.kind === "play") {
      const t = idx(o.at.trickIndex);
      const p = idx(o.at.playIndex);
      if (t !== null && p !== null && t < 13 && p < 4) at = { kind: "play", trickIndex: t, playIndex: p };
    }
    if (!at) continue;

    const note = typeof o.note === "string" ? o.note.trim().slice(0, MAX_NOTE) : "";
    const why = typeof o.why === "string" ? o.why.trim().slice(0, MAX_NOTE) : "";
    const hints = Array.isArray(o.hints)
      ? o.hints
          .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
          .map((h) => h.trim().slice(0, MAX_HINT))
          .slice(0, 5)
      : [];
    // An annotation that says nothing is not an annotation.
    if (!note && !why && hints.length < 2) continue;
    out.push({
      at,
      ...(note ? { note } : {}),
      ...(why ? { why } : {}),
      ...(hints.length >= 2 ? { hints } : {}),
    });
  }
  return withSettings(out);
}

export function serializeCurated(payload: CuratedPayload): string {
  return JSON.stringify(payload);
}

/** The recorded line, as flat sequences. */
export interface CuratedLine {
  auction: readonly { seat: Seat; call: Call }[];
  play: readonly { seat: Seat; card: Card }[];
}

export function lineOf(entry: Pick<LibraryEntry, "auction" | "play">): CuratedLine {
  return { auction: entry.auction ?? [], play: entry.play ?? [] };
}

const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;

/**
 * Where this session stands against the coach's line.
 *
 * `onPath` means every action so far — auction then play, in order — matches
 * the line's prefix. `divergedAtOwn` marks whether the FIRST mismatching
 * action was made by `seat` (the learner): that is the moment the nudge
 * belongs to; a robot can never diverge (it plays the line by construction),
 * so in practice a mismatch is always the learner's, but the check keeps the
 * nudge honest under takeovers and edge cases.
 */
export function pathStatus(
  state: Pick<GameState, "auction" | "tricks"> & Partial<Pick<GameState, "contract">>,
  line: CuratedLine,
  seat: Seat,
): {
  onPath: boolean;
  divergedAtOwn: boolean;
  divergedJustNow: boolean;
  /** WHERE the line was first left — the address the nudge speaks about. */
  divergedAt: CuratedAt | null;
} {
  /**
   * Seats this learner ACTS FOR — their own, and DUMMY while they declare.
   *
   * Declarer plays dummy's cards; the engine says so itself (controllingSeat
   * hands dummy's turn to declarer). But the event is recorded at the seat the
   * card came FROM, so a wrong card out of dummy is stamped North while the
   * learner sits South. Comparing against their own seat alone made that "not
   * theirs": no nudge, no take-back offered, and the panel just announced they
   * were off the line with nothing to do about it (owner report 2026-08-17 —
   * "take it back during play doesn't really work").
   */
  const isOwn = (actor: Seat): boolean =>
    actor === seat ||
    (state.contract != null &&
      state.contract.declarer === seat &&
      actor === partnerOf(state.contract.declarer));

  // The auction prefix.
  for (let i = 0; i < state.auction.length; i++) {
    const played = state.auction[i]!;
    const charted = line.auction[i];
    if (!charted || charted.seat !== played.seat || charted.call !== played.call) {
      return {
        onPath: false,
        divergedAtOwn: isOwn(played.seat),
        // STILL OFFERABLE UNTIL THE LEARNER MOVES ON. This used to mean "the
        // divergence is the last action on the board", which the robots close
        // within the same second — they reply the moment the learner acts, so
        // the take-back was offered for a window nobody could ever click in.
        // Their replies are not the learner changing their mind; the learner
        // acting AGAIN is, and that is what ends the offer now. (The take-back
        // itself rewinds to the line, so however many replies landed in
        // between, accepting still lands in the right place.)
        divergedJustNow: !laterActionBy(state, isOwn, { auctionFrom: i + 1, playsFrom: 0 }),
        divergedAt: { kind: "call", auctionIndex: i },
      };
    }
  }
  // The play prefix, flattened in table order.
  const played = state.tricks.flatMap((t) => t.plays);
  for (let i = 0; i < played.length; i++) {
    const p = played[i]!;
    const charted = line.play[i];
    if (!charted || charted.seat !== p.seat || !sameCard(charted.card, p.card)) {
      return {
        onPath: false,
        divergedAtOwn: isOwn(p.seat),
        divergedJustNow: !played.slice(i + 1).some((q) => isOwn(q.seat)),
        // From the FLAT index: every trick before this one is complete, so
        // four plays per trick holds.
        divergedAt: { kind: "play", trickIndex: Math.floor(i / 4), playIndex: i % 4 },
      };
    }
  }
  return { onPath: true, divergedAtOwn: false, divergedJustNow: false, divergedAt: null };
}

/** Has `seat` acted at or after the given point? */
function laterActionBy(
  state: Pick<GameState, "auction" | "tricks">,
  isOwn: (seat: Seat) => boolean,
  from: { auctionFrom: number; playsFrom: number },
): boolean {
  if (state.auction.slice(from.auctionFrom).some((c) => isOwn(c.seat))) return true;
  return state.tricks
    .flatMap((t) => t.plays)
    .slice(from.playsFrom)
    .some((p) => isOwn(p.seat));
}

/** The decision address the session is AT right now (the next action to be
 *  made), in annotation coordinates. */
export function currentAt(state: Pick<GameState, "phase" | "auction" | "tricks">): CuratedAt | null {
  if (state.phase === "auction") {
    return { kind: "call", auctionIndex: state.auction.length };
  }
  if (state.phase === "play") {
    const ti = Math.max(0, state.tricks.length - 1);
    const trick = state.tricks[ti];
    if (!trick || (trick.plays.length === 4 && trick.winner)) {
      // Between tricks — the next play opens a new trick.
      return { kind: "play", trickIndex: trick ? ti + 1 : 0, playIndex: 0 };
    }
    return { kind: "play", trickIndex: ti, playIndex: trick.plays.length };
  }
  return null;
}

/** The stable string form of an address — drafts, progress stamps and the
 *  report all key by it, so it lives here rather than per-consumer. */
export const atKey = (at: CuratedAt): string =>
  at.kind === "call" ? `call:${at.auctionIndex}` : `play:${at.trickIndex}:${at.playIndex}`;

export const sameAt = (a: CuratedAt, b: CuratedAt): boolean =>
  a.kind === "call" && b.kind === "call"
    ? a.auctionIndex === b.auctionIndex
    : a.kind === "play" && b.kind === "play"
      ? a.trickIndex === b.trickIndex && a.playIndex === b.playIndex
      : false;

/**
 * The FIRST action that left the coach's line, with what the line charted
 * there — the review loop's anchor ("left your line at trick 2: played ♠Q,
 * charted ♦3"). Null while the session is still a prefix of the line.
 * `charted` is null when the session simply outran the line's end.
 */
export function firstDivergence(
  state: Pick<GameState, "auction" | "tricks">,
  line: CuratedLine,
): {
  at: CuratedAt;
  played: { seat: Seat; call?: Call; card?: Card };
  charted: { seat: Seat; call?: Call; card?: Card } | null;
} | null {
  for (let i = 0; i < state.auction.length; i++) {
    const p = state.auction[i]!;
    const c = line.auction[i];
    if (!c || c.seat !== p.seat || c.call !== p.call) {
      return {
        at: { kind: "call", auctionIndex: i },
        played: { seat: p.seat, call: p.call },
        charted: c ? { seat: c.seat, call: c.call } : null,
      };
    }
  }
  const played = state.tricks.flatMap((t) => t.plays);
  for (let i = 0; i < played.length; i++) {
    const p = played[i]!;
    const c = line.play[i];
    if (!c || c.seat !== p.seat || !sameCard(c.card, p.card)) {
      return {
        at: { kind: "play", trickIndex: Math.floor(i / 4), playIndex: i % 4 },
        played: { seat: p.seat, card: p.card },
        charted: c ? { seat: c.seat, card: c.card } : null,
      };
    }
  }
  return null;
}

/**
 * THE LEARNER'S PROGRESS through a curated board — today just which decisions
 * they opened the hint ladder at (`atKey` strings). It rides the LEARNER'S
 * copy of the entry as `curatedProgressJson` (jsonb-additive, no migration):
 * that copy is theirs alone and nothing else writes it after the assign, so
 * the stamp can never race a game action the way a session write could.
 */
export interface CuratedProgress {
  opened: string[];
}

export function parseCuratedProgress(json: string | undefined): CuratedProgress {
  if (!json) return { opened: [] };
  try {
    const raw = JSON.parse(json) as { opened?: unknown };
    const opened = Array.isArray(raw?.opened)
      ? raw.opened.filter((k): k is string => typeof k === "string").slice(0, 400)
      : [];
    return { opened: [...new Set(opened)] };
  } catch {
    return { opened: [] };
  }
}

export function serializeCuratedProgress(progress: CuratedProgress): string {
  return JSON.stringify(progress);
}

/**
 * Seats a learner ACTS FOR — their own, and dummy's while they declare.
 * Shared by every reader that has to ask "was that theirs?".
 */
function actsFor(
  state: Partial<Pick<GameState, "contract">>,
  seat: Seat,
): (actor: Seat) => boolean {
  return (actor) =>
    actor === seat ||
    (state.contract != null &&
      state.contract.declarer === seat &&
      actor === partnerOf(state.contract.declarer));
}

/**
 * THE TABLE'S ANSWER SINCE THE LEARNER LAST ACTED — every action the other
 * three seats have taken while the learner watched, oldest first.
 *
 * A coach's word about a PARTNER's bid or an opponent's lead is teaching
 * material ("partner's 2NT is 18-19 balanced — now count your side's tricks"),
 * and the line records those actions as surely as it records the learner's.
 * But an annotation cannot be SHOWN at the moment it is anchored to: the
 * robots answer within the same second the learner acts, so a note served at
 * a robot's own turn would flash past unread, if it rendered at all.
 *
 * So it is anchored where it belongs and shown where it can be read — when
 * the board comes back to the learner, ahead of the note for the decision
 * they are now at. That is also the order a coach speaks in at a real table.
 */
export function actionsSince(
  state: Pick<GameState, "auction" | "tricks"> & Partial<Pick<GameState, "contract">>,
  seat: Seat,
): CuratedAt[] {
  const isOwn = actsFor(state, seat);
  const timeline: { at: CuratedAt; actor: Seat }[] = [
    ...state.auction.map((c, i) => ({
      at: { kind: "call", auctionIndex: i } as CuratedAt,
      actor: c.seat,
    })),
    ...state.tricks.flatMap((t) => t.plays).map((p, i) => ({
      at: { kind: "play", trickIndex: Math.floor(i / 4), playIndex: i % 4 } as CuratedAt,
      actor: p.seat,
    })),
  ];
  let lastOwn = -1;
  for (let i = 0; i < timeline.length; i++) if (isOwn(timeline[i]!.actor)) lastOwn = i;
  return timeline.slice(lastOwn + 1).map((e) => e.at);
}

/** The line's charted action at an address, if any — powers the nudge text
 *  and the learner-facing "coach's road". Structured; callers pretty-print. */
export function chartedActionAt(
  line: CuratedLine,
  at: CuratedAt,
): { seat: Seat; call?: Call; card?: Card } | null {
  if (at.kind === "call") {
    const a = line.auction[at.auctionIndex];
    return a ? { seat: a.seat, call: a.call } : null;
  }
  const flatIndex = at.trickIndex * 4 + at.playIndex;
  const p = line.play[flatIndex];
  return p ? { seat: p.seat, card: p.card } : null;
}