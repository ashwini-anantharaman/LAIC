// POST /api/bridge/curated/author — open the coach's studio (curated v2,
// owner design 2026-08-18): the sitting the coach plays IS the golden line the
// learner will follow.
//
// Two doors, one room:
//   { hands, dealer?, vul?, name?, learnerSeat? }  — a fresh board from the
//     deal the coach just built in the picker (validated here: 13 a seat, 52
//     distinct);
//   { fromEntryId }                  — REVISE a published curated deal: the
//     same board primed with the recorded line, so the coach can undo back
//     to any decision and replay from there. Its learner seat comes from the
//     entry's own payload, never from the caller.
//
// AN ORDINARY TABLE, WITH A RAIL BESIDE IT (owner direction 2026-08-19: "just
// reverse it back to how the play would be during New Play but with the
// annotation"). The coach sits in the LEARNER'S chair and the other three are
// house robots — the same lineup, the same turn order, the same tempo controls
// as any other board on this platform. So the coach plays the board the way
// their learner will, the robots bid by the KB system the coach teaches and
// play their cards by double dummy, and every action of the sitting — theirs
// and the robots' — is recorded as the line.
//
// This replaced two earlier shapes, both of which the owner rejected on sight:
// four human chairs (the coach playing every hand by hand, 2026-08-18), and
// four human chairs with a double-dummy autopilot for the opponents' cards
// (2026-08-19 — "the playing sequence is messed up": the felt re-anchored
// itself as the turn moved between the coach's chairs, and a hand-built
// autopilot beside the platform's own robot loop was one turn-taking mechanism
// too many). The lesson worth keeping: the studio is not a new kind of table.
//
// THE LEARNER SEAT IS STAMPED ON THE RECORD (`authoring`). It is what seats the
// coach, and afterwards it is how the studio's own doors — the table resolver's
// ?author gate, the advisor strip — know an authoring sitting when they see one
// without inferring it from the seat layout.
//
// No `curated` stamp: the robots here have no coach's line to follow yet (they
// are making it) and there is no learner to nudge. The studio chrome is the
// client's business (?author=1 on the table page). Being a coach is the
// permission, exactly the save route's rule: curating is a coaching act.

import type { Card, Seat, Vul } from "@bridge/events";
import { canAccessAdminArea } from "@bridge/nexus-client";
import { eventsFromRecording } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { houseLineup } from "@/app/bridge/library/actions";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { learnerSeatOf, parseCurated } from "@/lib/curated";
import { ensureSeeds } from "@/lib/kb";
import { getMyLearners, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
const SUITS = new Set(["S", "H", "D", "C"]);
const VULS: readonly Vul[] = ["none", "ns", "ew", "both"];

/** The picker's deal, held to the card: four seats, 13 each, 52 distinct.
 *  Returns the readable refusal instead of throwing — the picker shows it. */
function parseHands(raw: unknown): Record<Seat, Card[]> | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "A deal needs four hands." };
  const hands = {} as Record<Seat, Card[]>;
  const seen = new Set<string>();
  for (const seat of SEATS) {
    const list = (raw as Record<string, unknown>)[seat];
    if (!Array.isArray(list) || list.length !== 13)
      return { error: `${seat} needs exactly 13 cards.` };
    const cards: Card[] = [];
    for (const c of list) {
      const suit = (c as { suit?: unknown })?.suit;
      const rank = (c as { rank?: unknown })?.rank;
      if (
        typeof suit !== "string" ||
        !SUITS.has(suit) ||
        typeof rank !== "number" ||
        !Number.isInteger(rank) ||
        rank < 2 ||
        rank > 14
      )
        return { error: `${seat} holds an unreadable card.` };
      const key = `${suit}${rank}`;
      if (seen.has(key)) return { error: `A card is placed twice (${key}).` };
      seen.add(key);
      cards.push({ suit: suit as Card["suit"], rank: rank as Card["rank"] });
    }
    hands[seat] = cards;
  }
  return hands;
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();

    // Curating is a coaching act — the roster IS the permission (the same
    // gate the curated publish uses), and program admins curate by role.
    const coaches = canAccessAdminArea(context)
      ? true
      : await getMyLearners()
          .then((l) => l.length > 0)
          .catch(() => false);
    if (!coaches) throw new AccessError("Not a coach");

    const body = (await request.json().catch(() => ({}))) as {
      hands?: unknown;
      dealer?: string;
      vul?: string;
      name?: string;
      learnerSeat?: string;
      fromEntryId?: string;
    };

    await ensureSeeds();

    // The board: built in the picker, or lifted from the entry under revision.
    let hands: Record<Seat, Card[]>;
    let dealer: Seat;
    let vul: Vul;
    let name: string;
    let primedEvents;
    let revisesEntryId: string | undefined;
    // The chair the board is FOR. A revision takes it from the entry (the
    // annotations on that line are anchored to it and must not move); a fresh
    // board takes it from the deal screen, defaulting to the South every
    // curated board sat its learner in before the field existed.
    let learnerSeat: Seat = SEATS.includes(body.learnerSeat as Seat)
      ? (body.learnerSeat as Seat)
      : "S";
    if (typeof body.fromEntryId === "string" && body.fromEntryId) {
      const entry = await libraryStore().getEntry(body.fromEntryId);
      // Only the deal's own coach revises it (admins may steward the shelf) —
      // and not-yours reads as not-found, the API layer's one posture.
      if (
        !entry?.hands ||
        !entry.curatedJson ||
        (entry.createdBy !== context.nexusUserId && !canAccessAdminArea(context))
      )
        throw new AccessError("No such curated deal");
      hands = entry.hands;
      dealer = entry.dealer ?? "N";
      vul = entry.vul ?? "none";
      name = entry.name;
      revisesEntryId = entry.entryId;
      learnerSeat = learnerSeatOf(parseCurated(entry.curatedJson));
      // The recorded line, primed — the studio opens at its end, and the
      // coach undoes back to the decision they want to replay from.
      primedEvents = eventsFromRecording({
        boardRef: entry.name,
        dealer,
        vul,
        hands,
        auction: entry.auction ?? [],
        play: entry.play ?? [],
      }).events;
    } else {
      const parsed = parseHands(body.hands);
      if ("error" in parsed)
        return NextResponse.json({ error: parsed.error }, { status: 400, headers: CORS });
      hands = parsed;
      dealer = SEATS.includes(body.dealer as Seat) ? (body.dealer as Seat) : "N";
      vul = VULS.includes(body.vul as Vul) ? (body.vul as Vul) : "none";
      name = String(body.name ?? "").trim() || "Curated board";
    }

    // THE LINEUP IS THE LIBRARY'S OWN (owner direction 2026-08-19): the coach
    // in the learner's chair, house robots in the other three — the identical
    // call every "New Play" board makes, which is the point. It picks the KB,
    // checks the caller may use it, finds-or-creates the house player and
    // snapshots it into the three seats.
    let kbId: string;
    let compiled;
    let seats;
    try {
      // Robots at a table is an org capability (lib/org.ts), and so is the
      // knowledge base the lineup lands on — both refuse with a sentence
      // written for a person, which the catch below carries to the picker.
      await assertAiAllowed(context);
      // No KB named: the studio takes the first live compile, exactly as a
      // library board with no knowledge base of its own does.
      ({ kbId, compiled, seats } = await houseLineup("", context, learnerSeat));
    } catch (e) {
      // "No knowledge base has a live compile yet", "your organization has
      // disabled AI players" — a readable refusal, the way the picker's other
      // failures arrive. An access error stays an access error: those are the
      // API layer's own posture (not-yours reads as not-found), never a 409.
      if (e instanceof AccessError) throw e;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Couldn't seat the table." },
        { status: 409, headers: CORS },
      );
    }

    const record = await sessionService().createSession({
      authoring: { learnerSeat },
      kbId,
      compiled,
      seats,
      seed: 1,
      hands,
      dealer,
      vul,
      boardName: name,
      ...(primedEvents ? { primedEvents } : {}),
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });

    await audit(context, "profile.update", "kb_session", record.sessionId, {
      curatedAuthoring: true,
      learnerSeat,
      ...(revisesEntryId ? { revisesEntryId } : {}),
    });
    return NextResponse.json(
      {
        sessionId: record.sessionId,
        learnerSeat,
        ...(revisesEntryId ? { revisesEntryId } : {}),
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
