// POST /api/bridge/sessions/:id/seats — swap who sits in a seat. The lift of
// swapSeatAction: sessions snapshot their seats, so a swap is a FORK — the
// response's { sessionId } is the NEW table the client navigates to. Body:
// { seat, playerId } where playerId is a KB player id, "me", or "ben".

import type { Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { kbStore } from "@/lib/kb";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

const SEATS: Seat[] = ["N", "E", "S", "W"];

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "table.seats_panel"))) throw new AccessError("No seat swaps");
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      seat?: string;
      playerId?: string;
    };
    const seat = body.seat as Seat;
    const playerId = String(body.playerId ?? "");
    if (!SEATS.includes(seat)) return bad("Pick a seat.");

    const service = sessionService();
    const record = await service.requireSession(id);
    await assertKbAllowed(context, record.kbId);

    let config: SeatConfig;
    if (playerId === "me") {
      config = { kind: "human", nexusUserId: context.nexusUserId };
    } else if (playerId === "ben") {
      // BEN as a character — re-checked here so a stale sheet can't seat a
      // BEN that will immediately fail to act.
      if (!(await canUse(context, "table.ben_seat"))) throw new AccessError("No BEN seating");
      await assertAiAllowed(context);
      const { benAvailable, BEN_SEAT_LABEL } = await import("@/lib/benSeat");
      if (!benAvailable()) return bad("BEN isn't configured on this server (BEN_ENDPOINT).");
      config = { kind: "ben", label: BEN_SEAT_LABEL };
    } else {
      await assertAiAllowed(context);
      const player = await kbStore().getPlayer(playerId);
      if (!player || player.kbId !== record.kbId)
        return bad("That player doesn't belong to this knowledge base.");
      const compiled = await service.compiledFor(record);
      config = SessionService.seatFromPlayer(player, compiled);
    }

    const forked = await service.fork(
      id,
      { ...record.seats, [seat]: config },
      context.nexusUserId,
      { fresh: record.status === "completed" },
    );
    await audit(context, "profile.update", "kb_session", forked.sessionId, {
      kbId: record.kbId,
      swappedSeat: seat,
      playerId,
      forkedFrom: id,
    });
    return NextResponse.json({ sessionId: forked.sessionId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}
