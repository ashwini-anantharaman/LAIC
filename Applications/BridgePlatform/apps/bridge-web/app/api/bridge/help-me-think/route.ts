// GET /api/bridge/help-me-think?sessionId=… — layer 2 of "Help me think".
//
// Layer 1 (the facts and the candidate list) is computed during the page render
// and arrives as a prop, so the button answers instantly with no request. This
// route adds only what arithmetic cannot produce: what the calls promised, what
// each option does, and the question the position poses.
//
// THE CLIENT SENDS ONLY A SESSION ID. Which seat, which hand, which cards — all
// read server-side from the session record. Accepting a position from the browser
// would let anyone ask about a hand they cannot see, which is the whole game.
//
// The model never receives the session state. It receives a VisiblePosition,
// which has no field for the concealed hands and no field for the solver's
// verdict. See lib/coach/visible.ts.
//
// EVERY FAILURE IS A NULL, NOT AN ERROR. Unconfigured, unreachable, refused,
// malformed, or caught by the validator — all return `{framing: null, reason}`
// and the panel keeps its deterministic half. A learner should never see a stack
// trace because a coaching flourish did not arrive.

import { NextResponse } from "next/server";

import { frameThinking, modelConfigured } from "@/lib/coach/model";
import type { Framing } from "@/lib/coach/model";
import { thinkAid } from "@/lib/coach/think";
import { positionKey, visiblePosition } from "@/lib/coach/visible";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

/**
 * Same position → same answer, which is what makes the coach read as having
 * settled opinions rather than improvising. Keyed on the VISIBLE position, so the
 * entry is shared across every learner who reaches it.
 *
 * In memory for now, and deliberately behind this one interface: the table of
 * position → what the coach said is the artifact a bridge player would review and
 * correct, and a corrected table is the knowledge base rebuilt from the other
 * end. Swapping this for Postgres is one implementation of `FramingCache`.
 */
export interface FramingCache {
  get(key: string): Framing | undefined;
  set(key: string, value: Framing): void;
}

const MAX_ENTRIES = 500;

function inMemoryCache(): FramingCache {
  const map = new Map<string, Framing>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      // Crude LRU: oldest insertion out first. Fine for a per-instance cache whose
      // job is to make repeated positions free, not to be a database.
      if (map.size >= MAX_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, value);
    },
  };
}

const cache = inMemoryCache();

export async function GET(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!modelConfigured()) return NextResponse.json({ framing: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  // The caller's OWN seat at this table, or nothing. A watcher gets no framing:
  // there is no "your hand" to reason from, and describing the position from
  // nobody's point of view is not a thing this can honestly do.
  const seat = (Object.entries(record.seats) as [typeof state.turn, (typeof record.seats)[typeof state.turn]][])
    .find(([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId)?.[0];
  if (!seat) return NextResponse.json({ framing: null, reason: "not seated" });

  const pos = visiblePosition(state, seat);
  const aid = thinkAid(state, seat);
  if (!pos || !aid) return NextResponse.json({ framing: null, reason: "nothing to frame" });

  const key = positionKey(pos);
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ framing: hit, cached: true });

  const result = await frameThinking(pos, aid);
  if (!("framing" in result)) {
    // The reason is for whoever is watching the logs, not for the learner — the
    // panel says "the reasoning half is still being built" either way.
    console.warn(`[coach] no framing for ${key}: ${result.reason}${result.detail ? ` — ${result.detail}` : ""}`);
    return NextResponse.json({ framing: null, reason: result.reason });
  }

  cache.set(key, result.framing);
  return NextResponse.json({ framing: result.framing });
}
