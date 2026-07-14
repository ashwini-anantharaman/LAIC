// GET /api/bridge/sessions/:id/events — the full traced stream.

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { sessionService } from "@/lib/sessions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireContext();
    const { id } = await params;
    const record = await sessionService().requireSession(id);
    return NextResponse.json({ events: record.events, status: record.status });
  } catch (e) {
    return apiError(e);
  }
}
