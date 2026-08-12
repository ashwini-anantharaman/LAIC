// The coach's data plumbing for the native table — the WEB COACH'S OWN
// contract, whole (owner direction 2026-08-12: the original coach, pasted
// into the mobile space and rewired, nothing reinterpreted):
//
//   · fetchCoach — GET sessions/[id]/coach: the exact CoachPanelData the web
//     page hands <CoachDock data={quanCoach}/> (position line, flip-card
//     facts, think scaffold, meaning-folded history, ask context).
//   · fetchHints / fetchPlayAdvice / fetchBenTell — coachPrefetch.ts cloned:
//     one shared promise per session+epoch, misses never cached, so the
//     screens open onto answers instead of spinners.
//   · askEvent — event-qa, for the chat and the per-call question box.
//
// The ONLY difference from the web files is the transport: every call rides
// bridgeRequest (bearer + x-program-id) instead of a same-origin fetch.

import { useEffect } from "react";

import { bridgeRequest } from "../bridge-api";

// ── the web's types, verbatim (CoachPanel.tsx / lib/coach/*) ─────────────────

export interface CoachLookingEvent {
  id: string;
  label: string;
  detail?: string;
  kind: "call" | "play";
  seat?: string;
  who?: string;
  verb?: string;
  token?: string;
  auctionIndex?: number;
}

export interface CoachEventGroup {
  id: string;
  title: string;
  note?: string;
  current?: boolean;
  events: CoachLookingEvent[];
}

export interface KnownCard {
  title: string;
  value: string;
  detail: string;
}

export interface ThinkCandidate {
  label: string;
  note?: string;
}

export interface ThinkAid {
  knownCards: KnownCard[];
  candidates: ThinkCandidate[];
  noChoice?: string;
}

export interface CoachAsk {
  sessionId: string;
  active: boolean;
  phase: "auction" | "play" | "other";
}

export interface CoachPanelData {
  title?: string;
  placeholder?: string;
  facts?: { label: string; value: string; detail?: string }[];
  looking?: string;
  eventGroups?: CoachEventGroup[];
  aid?: ThinkAid;
  ask?: CoachAsk;
  /** No seat resolved — the route's own flag (the web derives it the same way). */
  watcher?: boolean;
}

/** What /api/bridge/play-hint answers with — the coach's card. */
export interface PlayHint {
  best: string[];
  prefer?: string;
  source: "system" | "convention" | "solution";
  because?: string;
}

export interface PlayAdvice {
  hint: PlayHint | null;
  reason?: string;
  why?: string;
}

export interface HintsAnswer {
  hints: string[] | null;
  reason?: string;
}

export interface BenTell {
  kind: "call" | "card";
  action: string;
  because?: string;
  score?: number;
  alternatives: { action: string; score?: number; because?: string }[];
}

export interface BenAnswer {
  tell: BenTell | null;
  reason?: string;
}

/** The auth every coach call rides — resolved once by the host, passed down. */
export interface CoachAuth {
  token: string;
  programId: string;
}

export function fetchCoach(auth: CoachAuth, sessionId: string): Promise<CoachPanelData> {
  return bridgeRequest(`/api/bridge/sessions/${encodeURIComponent(sessionId)}/coach`, {
    token: auth.token,
    programId: auth.programId,
  });
}

export function askEvent(
  auth: CoachAuth,
  sessionId: string,
  question: string,
  eventId?: string,
): Promise<{ answer?: string | null }> {
  return bridgeRequest("/api/bridge/event-qa", {
    token: auth.token,
    programId: auth.programId,
    method: "POST",
    body: { sessionId, question, ...(eventId ? { eventId } : {}) },
  });
}

// ── coachPrefetch.ts, cloned: shared promises, misses stay retryable ─────────

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

/** The five hints for the current decision — auction or play. */
export function fetchHints(auth: CoachAuth, sessionId: string, epoch: string): Promise<HintsAnswer> {
  const key = `hints:${sessionId}:${epoch}`;
  return once(key, async () => {
    const body = await bridgeRequest<{ hints?: string[] | null; reason?: string }>(
      `/api/bridge/play-hints?sessionId=${encodeURIComponent(sessionId)}`,
      { token: auth.token, programId: auth.programId },
    );
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
export function fetchPlayAdvice(
  auth: CoachAuth,
  sessionId: string,
  epoch: string,
): Promise<PlayAdvice> {
  const key = `advice:${sessionId}:${epoch}`;
  return once(key, async () => {
    const body = await bridgeRequest<{ hint?: PlayHint | null; reason?: string }>(
      `/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`,
      { token: auth.token, programId: auth.programId },
    );
    if (!body.hint?.best?.length) {
      cache.delete(key); // a miss stays retryable
      return { hint: null, reason: body.reason ?? "no answer" };
    }
    let why: string | undefined;
    try {
      const whyBody = await bridgeRequest<{ explanation?: { why: string } | null }>(
        `/api/bridge/play-why?sessionId=${encodeURIComponent(sessionId)}`,
        { token: auth.token, programId: auth.programId },
      );
      why = whyBody.explanation?.why;
    } catch {
      // The authority's own wording still stands; the rewrite just didn't arrive.
    }
    return { hint: body.hint, ...(why ? { why } : {}) };
  });
}

/**
 * BEN's answer for the current decision — bid or card. The slowest thing the
 * coach asks for (a card answer runs full simulations, 20-45s measured),
 * which is exactly why it prefetches: started when the decision lands, it is
 * usually done by the time the TELL screen opens.
 */
export function fetchBenTell(auth: CoachAuth, sessionId: string, epoch: string): Promise<BenAnswer> {
  const key = `ben:${sessionId}:${epoch}`;
  return once(key, async () => {
    const body = await bridgeRequest<{ tell?: BenTell | null; reason?: string }>(
      `/api/bridge/ben-tell?sessionId=${encodeURIComponent(sessionId)}`,
      { token: auth.token, programId: auth.programId },
    );
    if (!body.tell) {
      cache.delete(key); // a miss stays retryable
      return { tell: null, ...(body.reason ? { reason: body.reason } : {}) };
    }
    return { tell: body.tell };
  });
}

/**
 * Fire the fetches the moment the decision is the learner's — called by the
 * coach's always-mounted hosts (the dock), NOT by the screens that display
 * the answers. Errors are swallowed: a failed prefetch simply means the
 * screen that eventually opens pays the wait it would have paid anyway.
 */
export function useCoachPrefetch(auth: CoachAuth | null, ask: CoachAsk | undefined, epoch: string): void {
  const sessionId = ask?.sessionId;
  const active = ask?.active ?? false;
  const phase = ask?.phase;
  useEffect(() => {
    if (!auth || !sessionId || !active || phase === "other") return;
    void fetchHints(auth, sessionId, epoch).catch(() => {});
    void fetchBenTell(auth, sessionId, epoch).catch(() => {});
    // The card advice exists only during the play; the auction's answer lives
    // at the top of the hint ladder instead.
    if (phase === "play") void fetchPlayAdvice(auth, sessionId, epoch).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, auth?.programId, sessionId, active, phase, epoch]);
}

// ── the epoch helpers (CoachPanel.tsx, verbatim) ─────────────────────────────

export function currentGroup(data: CoachPanelData): CoachEventGroup | undefined {
  return (
    data.eventGroups?.find((g) => g.current) ?? data.eventGroups?.[data.eventGroups.length - 1]
  );
}

/** Per TRICK — the chat's remount key. */
export function boardEpoch(data: CoachPanelData): string {
  return currentGroup(data)?.id ?? "start";
}

/** Per CARD — the hint ladder / advice / BEN key: every decision is fresh. */
export function decisionEpoch(data: CoachPanelData): string {
  const g = currentGroup(data);
  return g ? `${g.id}#${g.events.length}` : "start";
}
