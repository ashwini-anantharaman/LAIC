// GET /api/bridge/play-hints?sessionId=… — five hints for the decision on the
// table, each more revealing than the last. The coach panel's HINTS screen
// fetches the whole ladder once and reveals it rung by rung client-side.
//
// On demand, never on render: a model call costs seconds and the learner asked
// for it by opening the first hint.
//
// Like play-hint and event-qa, the CLIENT SENDS ONLY A SESSION ID. The seat
// comes from the session record, and the position handed to the model is built
// by visiblePosition — the same turn-gated builder the advice surface uses, so
// hints exist only while the decision is actually the caller's to make, and
// the model never sees a hand the learner cannot.
//
// During the play the ladder is anchored: advisePlay's answer rides along as
// the authoritative target, so hint 5 names the same card "What should I
// play?" would. In the auction the model reasons to its own conclusion.

import { NextResponse } from "next/server";

import { advisePlay } from "@/lib/coach/advise";
import { generateHints, hintsConfigured } from "@/lib/coach/hints";
import { codeLabel } from "@/lib/coach/position";
import { partnershipSystem } from "@/lib/coach/verdicts";
import { positionKey, visiblePosition } from "@/lib/coach/visible";
import { kbStore } from "@/lib/kb";
import { corsOptions, withCors } from "@/lib/cors";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

// Serverless time limit — a thinking model writing five hints sits well over
// the 10-15s default, and a killed function reads as "no hints".
export const maxDuration = 60;

/**
 * Same position → same ladder, verbatim — the event-qa rule. A learner who
 * closes the sheet and reopens it should find the hints they already read,
 * not a paraphrase; and the reveal-one-more tap must never re-roll the rungs.
 */
const MAX_ENTRIES = 200;
const cache = new Map<string, string[]>();

/** Identical requests in the air share one model call (see play-why). */
const inFlight = new Map<string, Promise<{ hints: string[] } | { reason: string }>>();

function remember(key: string, hints: string[]): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, hints);
}

export const OPTIONS = corsOptions("GET");

export async function GET(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "GET");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!hintsConfigured()) return NextResponse.json({ hints: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  const seat = (Object.entries(record.seats) as [string, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0];
  if (!seat) return NextResponse.json({ hints: null, reason: "not seated" });

  // The turn gate IS the builder: visiblePosition returns null whenever the
  // decision on the table is not the caller's to make (declarer counts for
  // dummy's turn; dummy and watchers get nothing).
  const pos = visiblePosition(state, seat as never);
  if (!pos) return NextResponse.json({ hints: null, reason: "not your turn" });

  const key = positionKey(pos);
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ hints: hit, cached: true });

  const running = inFlight.get(key);
  if (running) {
    const joined = await running;
    return "hints" in joined
      ? NextResponse.json({ hints: joined.hints, cached: true })
      : NextResponse.json({ hints: null, reason: joined.reason });
  }

  const work = (async (): Promise<{ hints: string[] } | { reason: string }> => {
    // The play has an authority to anchor to; the auction does not (yet).
    let target: string | undefined;
    if (state.phase === "play") {
      try {
        const advice = await advisePlay({
          state,
          learnerSeat: seat as never,
          actor: state.turn,
          system: {
            compiled: await sessionService().compiledFor(record),
            player: partnershipSystem(record.seats, seat as never),
          },
          kb: kbStore(),
        });
        const best = advice.prefer ?? advice.best[0];
        // codeLabel: the advice speaks in engine codes ("DT"); the model and
        // the learner speak in table labels ("10♦").
        if (best) target = codeLabel(best);
      } catch {
        // No anchor is a degraded ladder, not a dead one — the model still
        // reasons to its own conclusion, exactly as it does in the auction.
      }
    }

    let result = await generateHints({ pos, ...(target ? { target } : {}) });
    if (!("hints" in result) && result.reason === "off-target") {
      // An off-target ladder is a model wobble, not a position problem — one
      // bounded retry usually lands it. Never more than one: the VALIDATOR is
      // the guarantee that Hints and Tell agree, the retry is just politeness.
      console.warn(`[coach] play-hints off-target — one retry for ${sessionId}`);
      result = await generateHints({ pos, ...(target ? { target } : {}) });
    }
    if (!("hints" in result)) {
      // Every no-answer is logged with its reason — whoever reads the function
      // logs must be able to tell a leak from a dead key (the event-qa rule).
      // The reason also rides the response: it names a failure class, never
      // content, and "no hints, no idea why" already cost one debugging pass.
      console.warn(`[coach] play-hints no-answer (${result.reason}) for ${sessionId}`);
      return { reason: result.reason };
    }
    remember(key, result.hints);
    return result;
  })();
  inFlight.set(key, work);

  try {
    const out = await work;
    return "hints" in out
      ? NextResponse.json({ hints: out.hints })
      : NextResponse.json({ hints: null, reason: out.reason });
  } finally {
    inFlight.delete(key);
  }
}
