// GET /api/bridge/curated-overlay?sessionId=… — the coach's voice for a
// curated session (owner design 2026-08-15), computed server-side per
// position so the panel just draws it:
//
//   · current   the annotation at the decision the learner is AT (only
//               while still on the coach's line), with the charted move
//               pretty-printed — shown automatically as a "Your coach"
//               speech bubble, and its custom ladder replaces Owlee's;
//   · nudge     the learner's LAST action was the first step off the line —
//               offer the take-it-back ("Your coach charted 2♣ here…");
//   · diverged  the learner is off the line and past the nudge — the panel
//               says so once and Owlee continues live.
//
// Non-curated sessions answer { overlay: null } cheaply; the panel only
// asks at all when the page said the session is curated.

import { stubDisplayName } from "@bridge/nexus-client";
import { NextResponse } from "next/server";

import { kFactsFor } from "@/lib/coach/kFacts";
import { lessonPlan } from "@/lib/coach/kLesson";
import { callLabel, cardLabel } from "@/lib/coach/position";
import { corsOptions, withCors } from "@/lib/cors";
import { partnerOf } from "@bridge/events";

import {
  actionsSince,
  chartedActionAt,
  constraintOf,
  currentAt,
  lineOf,
  parseCurated,
  pathStatus,
  sameAt,
  type CuratedAt,
} from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { assignmentStore, libraryStore, sessionService } from "@/lib/sessions";
import { playsFrom } from "@/lib/coach/turn";

export const OPTIONS = corsOptions("GET");

export async function GET(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "GET");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state, actingIsHuman } = view;
  if (!record.curated) return NextResponse.json({ overlay: null });

  const seat = (Object.entries(record.seats) as [string, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0] as "N" | "E" | "S" | "W" | undefined;
  if (!seat) return NextResponse.json({ overlay: null });

  const entry = await libraryStore().getEntry(record.curated.entryId);
  if (!entry) return NextResponse.json({ overlay: null });
  const line = lineOf(entry);
  const payload = parseCurated(entry.curatedJson);
  const { annotations } = payload;
  // The v2 board settings (owner design 2026-08-18) ride the overlay whole:
  // the constraint tells the client which experience this board IS, and the
  // intro/debrief/pin are the coach's framing around the decisions.
  const constraint = constraintOf(payload);

  // WHAT THIS BOARD TEACHES (owner direction 2026-08-18; card-level picks
  // 2026-08-19). The deal's own K item picks — or, for a deal that named only
  // a topic, its tags' collections — resolve to what the Know panel should put
  // in front of the learner, for the phase the board is actually in: an
  // auction lesson and a play lesson select differently from the same choice.
  // Null when the coach named no lesson, and the panel then behaves exactly as
  // it always has, which is what every deal authored before this needs.
  const plan =
    state.phase === "auction" || state.phase === "play"
      ? lessonPlan(payload, state.phase)
      : null;
  // AND THE VALUES THEMSELVES (owner ask 2026-08-19). The plan says which cards
  // this board teaches; these are what they READ right now, counted from this
  // learner's seat over what they may see. Recomputed per decision, because the
  // overlay is fetched per decision — that is what makes the lesson's cards move
  // with the board instead of standing there as names.
  const lesson = plan ? { ...plan, facts: kFactsFor(plan.items, state, seat) } : null;

  // WHO the coach is — the assignment that issued this entry knows (owner
  // pick #3, 2026-08-15: "Coach Sarah", not "Your coach"). Best-effort: a
  // curated board opened outside an assignment just keeps the generic name.
  let coachName: string | undefined;
  try {
    const mine = await assignmentStore().listAssignments({
      learnerId: context.nexusUserId,
      entryId: record.curated.entryId,
    });
    const a = mine.find((x) => x.sessionId === sessionId) ?? mine[0];
    if (a) coachName = a.coachName ?? stubDisplayName(a.coachId) ?? undefined;
  } catch {
    // Name resolution must never cost the overlay.
  }

  // The chair the learner is choosing from — theirs, or the declarer's under a
  // takeover. Every line question below (are they on it, whose move left it,
  // may they still take it back) is answered against that seat.
  const from = playsFrom(record, state, seat);
  const status = pathStatus(state, line, seat, from);

  // THE FINISH (owner pick #4): the board is over — say how the journey
  // went against the coach's line. An undo that returned to the line leaves
  // no trace in the log, which is exactly right: finding the way back IS
  // staying on the road.
  const finished = state.phase === "complete" ? { stayedOnLine: status.onPath } : null;
  const pretty = (at: CuratedAt): string | null => {
    const charted = chartedActionAt(line, at);
    if (!charted) return null;
    return charted.call ? callLabel(charted.call) : charted.card ? cardLabel(charted.card) : null;
  };

  // The nudge: the learner's own action stepped off the line, and they have
  // not moved on since. It speaks about the DIVERGENCE's own address, which
  // pathStatus now hands back — this used to address "the last play on the
  // board", and the robots reply within the same second, so the charted move
  // it printed was the one for a robot's position rather than the learner's.
  let nudge: { charted: string } | null = null;
  if (!status.onPath && status.divergedAtOwn && status.divergedJustNow && status.divergedAt) {
    const charted = pretty(status.divergedAt);
    if (charted) nudge = { charted };
  }
  // A FREE board never interrupts (curated v2): the notes, road and ladders
  // stay offered, but nothing stops the table or asks for a take-back.
  if (constraint === "free") nudge = null;

  // The intro stands until the learner's first own action — their framing,
  // not a recurring banner. Dummy's cards count as the declarer's own.
  const dummySeat = state.contract
    ? (({ N: "S", S: "N", E: "W", W: "E" }) as const)[state.contract.declarer]
    : null;
  const learnerActed =
    state.auction.some((c) => c.seat === seat) ||
    state.tricks.some((t) =>
      t.plays.some(
        (p) =>
          p.seat === seat || (state.contract?.declarer === seat && p.seat === dummySeat),
      ),
    );

  // WHERE the line was left, and what was played there instead of the charted
  // move. "You're off the line" on its own is an accusation with no evidence —
  // a learner who believes they followed the coach has nothing to check it
  // against, and neither did we (owner report 2026-08-17: "even if I click on
  // the correct playing card, it still says I am off the line").
  let left: { where: string; charted: string; played: string } | null = null;
  if (!status.onPath && status.divergedAt) {
    const at = status.divergedAt;
    const chartedMove = pretty(at);
    const actual =
      at.kind === "call"
        ? (() => {
            const c = state.auction[at.auctionIndex];
            return c ? `${c.seat} ${callLabel(c.call)}` : null;
          })()
        : (() => {
            const p = state.tricks.flatMap((t) => t.plays)[at.trickIndex * 4 + at.playIndex];
            return p ? `${p.seat} ${cardLabel(p.card)}` : null;
          })();
    const where =
      at.kind === "call"
        ? `bid ${at.auctionIndex + 1}`
        : `trick ${at.trickIndex + 1}, card ${at.playIndex + 1}`;
    if (chartedMove && actual) left = { where, charted: chartedMove, played: actual };
  }

  /**
   * WHAT THE TABLE DID WHILE THEY WATCHED (owner, 2026-08-18: "shouldn't
   * there be annotation for both when you or your partner play?").
   *
   * The coach can write at any seat's action on the line, but a note at a
   * robot's own turn could never be read — the robots answer within the same
   * second the learner acts. So the notes ride back to the learner's next
   * decision, in the order they happened, each naming the seat and the move
   * it speaks about: "Partner · 2NT — 18-19 balanced, so count nine tricks."
   *
   * On-path only, like every other annotation: off the line these addresses
   * stop corresponding to what actually happened.
   */
  const since =
    status.onPath && actingIsHuman
      ? actionsSince(state, seat)
          .map((at) => {
            const note = annotations.find((a) => sameAt(a.at, at));
            if (!note?.note && !note?.why) return null;
            const actor =
              at.kind === "call"
                ? state.auction[at.auctionIndex]?.seat
                : state.tricks.flatMap((t) => t.plays)[at.trickIndex * 4 + at.playIndex]?.seat;
            const move = pretty(at);
            if (!actor || !move) return null;
            return {
              seat: actor,
              partner: actor === partnerOf(seat),
              move,
              ...(note.note ? { note: note.note } : {}),
              ...(note.why ? { why: note.why } : {}),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : [];

  // The current annotation — only while the line still holds.
  const here = currentAt(state);
  const annotation =
    status.onPath && here ? (annotations.find((a) => sameAt(a.at, here)) ?? null) : null;
  /**
   * THE ROAD IS OFFERED AT EVERY DECISION OF THE LEARNER'S OWN (owner pick B,
   * 2026-08-17), annotated or not — they can always ask what their coach did
   * here. It stays behind the panel's disclosure, so asking remains a choice:
   * handing the charted card over unprompted would turn a curated deal into
   * copying, which is the one thing the hint ladders exist to avoid.
   *
   * THEIR OWN only. At a robot's turn there is nothing for the learner to
   * choose and the line's next card is not theirs to be told; actingIsHuman
   * already folds in declarer-plays-dummy, so a card out of dummy counts.
   */
  const chartedHere = status.onPath && here && actingIsHuman ? pretty(here) : null;

  return NextResponse.json({
    overlay: {
      onPath: status.onPath,
      diverged: !status.onPath,
      constraint,
      ...(payload.intro && !learnerActed && state.phase !== "complete"
        ? { intro: payload.intro }
        : {}),
      ...(payload.debrief && state.phase === "complete" ? { debrief: payload.debrief } : {}),
      ...(payload.pin ? { pin: payload.pin } : {}),
      ...(lesson ? { lesson } : {}),
      ...(coachName ? { coachName } : {}),
      ...(finished ? { finished } : {}),
      ...(left ? { left } : {}),
      ...(since.length && !finished ? { since } : {}),
      ...(nudge && !finished ? { nudge } : {}),
      // Sent when the coach WROTE something here, or when there is simply a
      // road to show at this decision — either alone is worth a bubble.
      ...(annotation || chartedHere
        ? {
            current: {
              ...(annotation?.note ? { note: annotation.note } : {}),
              ...(annotation?.why ? { why: annotation.why } : {}),
              ...(annotation?.hints ? { hints: annotation.hints } : {}),
              ...(chartedHere ? { charted: chartedHere } : {}),
            },
          }
        : {}),
    },
  });
}