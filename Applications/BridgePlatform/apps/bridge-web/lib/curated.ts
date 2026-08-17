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
import type { Call, Card, Seat } from "@bridge/events";
import type { LibraryEntry } from "@bridge/sessions";

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

export interface CuratedPayload {
  annotations: CuratedAnnotation[];
}

const MAX_NOTE = 500;
const MAX_HINT = 220;

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
  const list = (raw as { annotations?: unknown })?.annotations;
  if (!Array.isArray(list)) return { annotations: [] };

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
  return { annotations: out };
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
  state: Pick<GameState, "auction" | "tricks">,
  line: CuratedLine,
  seat: Seat,
): { onPath: boolean; divergedAtOwn: boolean; divergedJustNow: boolean } {
  // The auction prefix.
  for (let i = 0; i < state.auction.length; i++) {
    const played = state.auction[i]!;
    const charted = line.auction[i];
    if (!charted || charted.seat !== played.seat || charted.call !== played.call) {
      const isLast = i === state.auction.length - 1 && !state.tricks.some((t) => t.plays.length > 0);
      return { onPath: false, divergedAtOwn: played.seat === seat, divergedJustNow: isLast };
    }
  }
  // The play prefix, flattened in table order.
  const played = state.tricks.flatMap((t) => t.plays);
  for (let i = 0; i < played.length; i++) {
    const p = played[i]!;
    const charted = line.play[i];
    if (!charted || charted.seat !== p.seat || !sameCard(charted.card, p.card)) {
      const isLast = i === played.length - 1;
      return { onPath: false, divergedAtOwn: p.seat === seat, divergedJustNow: isLast };
    }
  }
  return { onPath: true, divergedAtOwn: false, divergedJustNow: false };
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