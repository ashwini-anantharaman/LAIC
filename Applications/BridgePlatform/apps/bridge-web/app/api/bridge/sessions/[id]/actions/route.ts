// POST /api/bridge/sessions/:id/actions — a human call or card.

import type { Card } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireContext();
    const { id } = await params;
    const body = (await request.json()) as { call?: string; card?: Card };
    const view = await sessionService().act(id, body);
    return NextResponse.json({
      state: view.state,
      actingSeat: view.actingSeat,
      actingIsHuman: view.actingIsHuman,
    });
  } catch (e) {
    return apiError(e);
  }
}
