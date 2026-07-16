// POST /api/bridge/sessions — start a session (players by id; optional human
// seat). GET — recent sessions.

import type { Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { sessionService } from "@/lib/sessions";

const SEATS: Seat[] = ["N", "E", "S", "W"];

export async function GET() {
  try {
    await requireContext();
    const sessions = await sessionService().listRecent();
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        kbId: s.kbId,
        board: s.board,
        status: s.status,
        compileRef: s.compileRef,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    await ensureSeeds();
    const body = (await request.json()) as {
      kbId: string;
      seed?: number;
      humanSeat?: Seat;
      players: Partial<Record<Seat, string>>;
    };
    await assertAiAllowed(context);
    await assertKbAllowed(context, body.kbId);
    const compiled = await kbService().liveCompile(body.kbId);
    if (!compiled) throw new Error("No live compile for that knowledge base");

    const store = kbStore();
    const seats = {} as Record<Seat, SeatConfig>;
    for (const seat of SEATS) {
      if (seat === body.humanSeat) {
        seats[seat] = { kind: "human", nexusUserId: context.nexusUserId };
        continue;
      }
      const player = body.players[seat] ? await store.getPlayer(body.players[seat]!) : null;
      if (!player) throw new Error(`Missing player for seat ${seat}`);
      seats[seat] = SessionService.seatFromPlayer(player, compiled);
    }
    const record = await sessionService().createSession({
      kbId: body.kbId,
      compiled,
      seats,
      seed: body.seed ?? 1,
      createdBy: context.nexusUserId,
    });
    await audit(context, "profile.update", "kb_session", record.sessionId, {
      kbId: body.kbId,
      api: true,
    });
    return NextResponse.json({ session: record }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
