// GET /api/bridge/play-why?sessionId=… — why the card the hint just named.
//
// Second half of "What should I play?". The hint route answers first with the
// card and the authority's own wording; this one comes back a beat later with the
// same answer written for a player. Two requests rather than one, so the card is
// never held behind the explanation — the useful part lands immediately and the
// teaching part catches up.
//
// THE CLIENT SENDS ONLY A SESSION ID, and the answer being explained is
// recomputed server-side rather than accepted from the browser. That is not
// belt-and-braces: if the client could post the card and the position, anyone
// could ask for an explanation of a hand they cannot see, or have the coach
// justify a card no authority chose.
//
// The model never receives the game state. It receives a VisiblePosition, which
// has no field for the concealed hands. See lib/coach/visible.ts.

import { NextResponse } from "next/server";

import { advisePlay } from "@/lib/coach/advise";
import { explainPlay, modelConfigured, type PlayExplanation } from "@/lib/coach/model";
import { partnershipSystem } from "@/lib/coach/verdicts";
import { positionKey, visiblePosition } from "@/lib/coach/visible";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

const PARTNER: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };

/**
 * Same position and same answer → same wording.
 *
 * This is what stops the coach paraphrasing itself: a learner who meets the same
 * ending twice should be told the same thing, and so should two learners who meet
 * it once each. It also makes the common endings free after the first ask.
 *
 * In memory, deliberately behind one shape. The table of position → what the
 * coach said is the artifact a bridge player would review and correct, and a
 * corrected table is a knowledge base built from the other end rather than
 * authored from a blank page. Swapping this for Postgres is one function.
 */
const MAX_ENTRIES = 500;
const cache = new Map<string, PlayExplanation>();

function remember(key: string, value: PlayExplanation): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export async function GET(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!modelConfigured()) return NextResponse.json({ explanation: null, reason: "unconfigured" });

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
  if (!seat) return NextResponse.json({ explanation: null, reason: "not seated" });
  if (state.phase !== "play") return NextResponse.json({ explanation: null, reason: "not playing" });

  // Declarer chooses dummy's cards too, so both count as theirs; dummy chooses
  // nothing. Same rule as the hint route, because it must be explaining the same
  // decision the hint just answered.
  const declarer = state.contract?.declarer;
  const dummy = declarer ? PARTNER[declarer] : undefined;
  const mine = state.turn === seat || (seat === declarer && state.turn === dummy);
  if (!mine) return NextResponse.json({ explanation: null, reason: "not your turn" });

  const pos = visiblePosition(state, seat as never);
  if (!pos) return NextResponse.json({ explanation: null, reason: "nothing to explain" });

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
  if (!advice.best.length) {
    return NextResponse.json({ explanation: null, reason: "no answer to explain" });
  }

  // Everything legal that the authority did not choose. For the guidelines that
  // is precisely the pile that broke a rule — and the reason those were rejected
  // is the most useful sentence available, which is why it gets its own field
  // rather than sitting under the cards that were kept.
  const rejected = pos.legal.filter((c) => !advice.best.includes(c));

  const key = `${positionKey(pos)}:${advice.best.join(",")}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ explanation: hit, cached: true });

  const result = await explainPlay({
    pos,
    best: advice.best,
    source: advice.source,
    ...(advice.because ? { authorityBecause: advice.because } : {}),
    ...(rejected.length ? { rejected } : {}),
  });

  if (!("explanation" in result)) {
    // `not-explainable` is the solver having answered: its reason is the hidden
    // hands, so there is nothing to put into words and the panel's "worked out
    // from the full deal" stands as the honest answer. The rest are logged for
    // whoever is watching, never surfaced.
    if (result.reason !== "not-explainable") {
      console.warn(`[coach] no explanation for ${key}: ${result.reason}${result.detail ? ` — ${result.detail}` : ""}`);
    }
    return NextResponse.json({ explanation: null, reason: result.reason });
  }

  remember(key, result.explanation);
  return NextResponse.json({ explanation: result.explanation });
}
