// POST /api/bridge/library/entries/[entryId]/play — put a saved entry on a
// table and return the sessionId. One route, three modes, because all three
// converge on resolveEntryLineup + createSession:
//
//   { mode: "play" }    deal the entry's cards fresh vs. house players
//                       (playEntryAction)
//   { mode: "resume" }  replay a saved play's recording; a complete recording
//                       opens as a finished board (resumePlayEntryAction)
//   { mode: "table" }   start a saved table lineup on a fresh deal
//                       (startTableEntryAction)
//
// Same gates as the actions: library.resume, AI allowed, KB allowed. Errors
// the actions surfaced by redirect come back as 400 { error }.

import type { GameEvent, Seat } from "@bridge/events";
import { eventsFromRecording, SessionService, type SeatConfig } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { resolveEntryLineup } from "@/app/bridge/library/actions";
import { requireFeature } from "@/lib/access";
import { apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const context = await requireContext();
    await requireFeature(context, "library.resume");
    await ensureSeeds();
    await assertAiAllowed(context);

    const { entryId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      kbId?: string;
    };
    const mode = body.mode === "resume" || body.mode === "table" ? body.mode : "play";

    const entry = await libraryStore().getEntry(entryId);
    if (!entry) return bad("That library entry no longer exists.");

    const scope = {
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    };

    if (mode === "table") {
      // startTableEntryAction, minus the redirect.
      if (entry.kind !== "table" || !entry.kbId || !entry.seats)
        return bad("This entry is not a table lineup.");
      await assertKbAllowed(context, entry.kbId);
      const compiled = await kbService().liveCompile(entry.kbId);
      if (!compiled) return bad("This knowledge base has no live compile yet.");

      const store = kbStore();
      const seats = {} as Record<Seat, SeatConfig>;
      for (const seat of ["N", "E", "S", "W"] as Seat[]) {
        const ref = entry.seats[seat];
        if (ref.human || !ref.playerId) {
          seats[seat] = { kind: "human", nexusUserId: context.nexusUserId };
          continue;
        }
        const player = await store.getPlayer(ref.playerId);
        if (!player) return bad(`Saved player for seat ${seat} no longer exists.`);
        seats[seat] = SessionService.seatFromPlayer(player, compiled);
      }

      const record = await sessionService().createSession({
        kbId: entry.kbId,
        compiled,
        seats,
        seed: (Date.now() % 100_000) + 1,
        boardName: `${entry.name} — fresh deal`,
        ...scope,
      });
      await audit(context, "profile.update", "kb_session", record.sessionId, {
        kbId: entry.kbId,
        fromTableEntry: entryId,
      });
      return NextResponse.json({ sessionId: record.sessionId }, { headers: CORS });
    }

    if (!entry.hands) return bad("This entry has no deal to play.");

    if (mode === "resume") {
      // resumePlayEntryAction, minus the redirect.
      if (entry.kind !== "play") return bad("This entry is not a saved deal.");
      const { kbId, compiled, seats } = await resolveEntryLineup(entry, "", context);

      let primed: { events: GameEvent[]; complete: boolean };
      try {
        primed = eventsFromRecording({
          boardRef: entry.name,
          dealer: entry.dealer ?? "N",
          vul: entry.vul ?? "none",
          hands: entry.hands,
          auction: entry.auction ?? [],
          play: entry.play ?? [],
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return bad(`This recording can't be replayed: ${detail}`);
      }

      const record = await sessionService().createSession({
        kbId,
        compiled,
        seats,
        seed: 1,
        hands: entry.hands,
        dealer: entry.dealer ?? "N",
        vul: entry.vul ?? "none",
        boardName: entry.name,
        primedEvents: primed.events,
        status: primed.complete ? "completed" : "active",
        ...scope,
      });
      await audit(context, "profile.update", "kb_session", record.sessionId, {
        kbId,
        resumedFrom: entryId,
      });
      return NextResponse.json({ sessionId: record.sessionId }, { headers: CORS });
    }

    // mode === "play": playEntryAction, minus the redirect.
    const { kbId, compiled, seats } = await resolveEntryLineup(
      entry,
      String(body.kbId ?? "").trim(),
      context,
    );
    const record = await sessionService().createSession({
      kbId,
      compiled,
      seats,
      seed: 1,
      hands: entry.hands,
      dealer: entry.dealer ?? "N",
      vul: entry.vul ?? "none",
      boardName: entry.name,
      ...scope,
    });
    await audit(context, "profile.update", "kb_session", record.sessionId, {
      kbId,
      fromLibrary: entryId,
    });
    return NextResponse.json({ sessionId: record.sessionId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
