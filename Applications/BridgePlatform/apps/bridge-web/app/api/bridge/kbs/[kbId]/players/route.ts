// GET /api/bridge/kbs/:kbId/players — players with validation state.

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { kbStore } from "@/lib/kb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    await requireContext();
    const { kbId } = await params;
    const players = await kbStore().listPlayersForKb(kbId);
    return NextResponse.json({ players });
  } catch (e) {
    return apiError(e);
  }
}
