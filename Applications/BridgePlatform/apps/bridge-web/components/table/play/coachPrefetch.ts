"use client";

// The coach answers before it is asked (owner direction 2026-08-11).
//
// The hint ladder and the play advice each cost seconds of model time, and
// both used to start fetching at the tap that wanted them — so every tap paid
// the full wait. Now the fetches fire the moment a decision lands on the
// table (useCoachPrefetch, called by the coach's always-mounted hosts), and
// the screens read the same promise when they open: usually resolved, so the
// answer is just THERE. Nothing shows earlier than it used to — the hints
// stay face-down until revealed — only the waiting moved off-screen.
//
// ONE FETCH PER DECISION, shared. Each request is cached by session + epoch
// (the board's current section — a new trick is a new epoch and refetches),
// so the prefetch and however many screens open afterwards all share a single
// network call. The server dedups by position too; this cache exists so the
// CLIENT doesn't even ask twice, and so a component mounting later gets the
// already-resolved promise instead of a spinner.
//
// A MISS IS NOT CACHED. "No answer" can be transient (a cold function, a slow
// model); pinning it for the whole epoch would turn one hiccup into a dead
// screen. Failed or empty results drop out of the cache so the next open
// retries.

import { useEffect } from "react";

/** What /api/bridge/play-hint answers with — the coach's card. */
export interface PlayHint {
  best: string[];
  prefer?: string;
  source: "system" | "convention" | "solution";
  because?: string;
}

/** The card and its reason, gathered from play-hint + play-why. */
export interface PlayAdvice {
  hint: PlayHint | null;
  reason?: string;
  why?: string;
}

/** The five hints, or why there are none. */
export interface HintsAnswer {
  hints: string[] | null;
  reason?: string;
}

/** What /api/bridge/ben-tell answers with — BEN's choice and what it weighed. */
export interface BenTell {
  kind: "call" | "card";
  action: string;
  because?: string;
  score?: number;
  alternatives: { action: string; score?: number; because?: string }[];
}

/** BEN's answer, or why there is none. */
export interface BenAnswer {
  tell: BenTell | null;
  reason?: string;
}

// Promises, not results: a screen that opens mid-flight joins the wait
// instead of starting its own. Bounded so an all-night session can't grow it
// without limit — oldest first, and 40 epochs is several boards of history.
const cache = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 40;

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().catch((err) => {
    // A rejected promise must not be the cached answer for this epoch.
    cache.delete(key);
    throw err;
  });
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, p);
  return p;
}

/** One Position card, as the state-reads route serves it — grouped and captioned. */
export interface StateReadCard {
  title: string;
  value: string;
  detail: string;
  group?: "me" | "partner" | "partnership" | "theirs" | "advanced";
}

/**
 * Claude's read of the auction for the Position states (boss direction
 * 2026-08-15: no KB in this path). Keyed per DECISION like the hints, but
 * the server caches per AUCTION — during the play every card shares one
 * answer, so the extra epochs are free.
 */
export function fetchStateReads(
  sessionId: string,
  epoch: string,
): Promise<{ cards: StateReadCard[] | null; reason?: string }> {
  const key = `reads:${sessionId}:${epoch}`;
  return once(key, async () => {
    const res = await fetch(`/api/bridge/state-reads?sessionId=${encodeURIComponent(sessionId)}`);
    const body = (await res.json()) as { cards?: StateReadCard[] | null; reason?: string };
    if (!body.cards) {
      cache.delete(key); // a miss stays retryable
      return { cards: null, ...(body.reason ? { reason: body.reason } : {}) };
    }
    return { cards: body.cards };
  });
}

/** The coach's voice for a CURATED session, computed per position server-side. */
export interface CuratedOverlay {
  onPath: boolean;
  diverged: boolean;
  /** The coach's display name, resolved from the assignment ("Coach Sarah"). */
  coachName?: string;
  /** The board is over — how the sitting went against the coach's line. */
  finished?: { stayedOnLine: boolean };
  /** The learner's last action was the first step off the coach's line. */
  nudge?: { charted: string };
  /** WHERE the line was left, and what was played there instead — so "off the
   *  line" carries its evidence rather than being an unarguable verdict. */
  left?: { where: string; charted: string; played: string };
  /** The annotation at the decision the learner is at (on-path only). */
  current?: { note?: string; why?: string; hints?: string[]; charted?: string };
}

export function fetchCuratedOverlay(
  sessionId: string,
  epoch: string,
): Promise<CuratedOverlay | null> {
  const key = `curated:${sessionId}:${epoch}`;
  return once(key, async () => {
    const res = await fetch(
      `/api/bridge/curated-overlay?sessionId=${encodeURIComponent(sessionId)}`,
    );
    const body = (await res.json()) as { overlay?: CuratedOverlay | null };
    if (!body.overlay) cache.delete(key); // stays retryable
    return body.overlay ?? null;
  });
}

/** The five hints for the current decision — auction or play. */
export function fetchHints(sessionId: string, epoch: string): Promise<HintsAnswer> {
  const key = `hints:${sessionId}:${epoch}`;
  return once(key, async () => {
    const res = await fetch(`/api/bridge/play-hints?sessionId=${encodeURIComponent(sessionId)}`);
    const body = (await res.json()) as { hints?: string[] | null; reason?: string };
    if (!body.hints?.length) {
      cache.delete(key); // a miss stays retryable
      return { hints: null, ...(body.reason ? { reason: body.reason } : {}) };
    }
    return { hints: body.hints };
  });
}

/**
 * The coach's card for the current play decision, with its reason. The same
 * two requests the old button made — the card first, the explanation after —
 * rolled into one shared promise.
 */
export function fetchPlayAdvice(sessionId: string, epoch: string): Promise<PlayAdvice> {
  const key = `advice:${sessionId}:${epoch}`;
  return once(key, async () => {
    const res = await fetch(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`);
    const body = (await res.json()) as { hint?: PlayHint | null; reason?: string };
    if (!body.hint?.best?.length) {
      cache.delete(key); // a miss stays retryable
      return { hint: null, reason: body.reason ?? "no answer" };
    }
    let why: string | undefined;
    try {
      const whyRes = await fetch(`/api/bridge/play-why?sessionId=${encodeURIComponent(sessionId)}`);
      const whyBody = (await whyRes.json()) as { explanation?: { why: string } | null };
      why = whyBody.explanation?.why;
    } catch {
      // The authority's own wording still stands; the rewrite just didn't arrive.
    }
    return { hint: body.hint, ...(why ? { why } : {}) };
  });
}

/**
 * BEN's answer for the current decision — bid or card. The slowest thing the
 * coach asks for by a wide margin (a card answer runs full simulations,
 * 20-45s measured), which is exactly why it prefetches (owner direction
 * 2026-08-11: "run the BEN before anyone even taps"): started when the
 * decision lands, it is usually done by the time the TELL screen opens.
 */
export function fetchBenTell(sessionId: string, epoch: string): Promise<BenAnswer> {
  const key = `ben:${sessionId}:${epoch}`;
  return once(key, async () => {
    const res = await fetch(`/api/bridge/ben-tell?sessionId=${encodeURIComponent(sessionId)}`);
    const body = (await res.json()) as { tell?: BenTell | null; reason?: string };
    if (!body.tell) {
      cache.delete(key); // a miss stays retryable
      return { tell: null, ...(body.reason ? { reason: body.reason } : {}) };
    }
    return { tell: body.tell };
  });
}

/**
 * BEN's read of a PAST decision — the History screen's "what if". `query` is
 * ben-tell's own addressing for the spot: "at=3" for a call, "play=6-1" for
 * a card. Never prefetched (a finished board holds up to 26 of these, most
 * never asked); cached hard once asked — the position is over and cannot
 * change, so a 40-second simulation is paid at most once per spot. Only a
 * miss stays retryable, same rule as everything above.
 */
export function fetchBenWhatIf(sessionId: string, query: string): Promise<BenAnswer> {
  const key = `benwhatif:${sessionId}:${query}`;
  return once(key, async () => {
    const res = await fetch(
      `/api/bridge/ben-tell?sessionId=${encodeURIComponent(sessionId)}&${query}`,
    );
    const body = (await res.json()) as { tell?: BenTell | null; reason?: string };
    if (!body.tell) {
      cache.delete(key); // a miss stays retryable
      return { tell: null, ...(body.reason ? { reason: body.reason } : {}) };
    }
    return { tell: body.tell };
  });
}

/**
 * Fire the fetches the moment the decision is the learner's — called by the
 * coach's always-mounted hosts (the dock, the sheet), NOT by the screens that
 * display the answers. Results land in the shared cache above; errors are
 * swallowed here because a failed prefetch simply means the screen that
 * eventually opens pays the wait it would have paid anyway.
 */
export function useCoachPrefetch(
  ask: { sessionId: string; active: boolean; phase: "auction" | "play" | "other" } | undefined,
  epoch: string,
  /** The session is a curated deal — prefetch the coach's overlay too. */
  curated?: boolean,
): void {
  const sessionId = ask?.sessionId;
  const active = ask?.active ?? false;
  const phase = ask?.phase;
  useEffect(() => {
    if (!sessionId) return;
    // The coach's overlay is position-addressed; a curated session wants it
    // fresh at every decision, learner's turn or not (the nudge rides it).
    if (curated) void fetchCuratedOverlay(sessionId, epoch).catch(() => {});
    // The Position reads don't wait for the learner's turn — the panel shows
    // them the moment any bid lands, whoever is thinking.
    if (phase !== "other") void fetchStateReads(sessionId, epoch).catch(() => {});
    if (!active || phase === "other") return;
    void fetchHints(sessionId, epoch).catch(() => {});
    void fetchBenTell(sessionId, epoch).catch(() => {});
    // The card advice exists only during the play; the auction's answer lives
    // at the top of the hint ladder instead.
    if (phase === "play") void fetchPlayAdvice(sessionId, epoch).catch(() => {});
  }, [sessionId, active, phase, epoch, curated]);
}
