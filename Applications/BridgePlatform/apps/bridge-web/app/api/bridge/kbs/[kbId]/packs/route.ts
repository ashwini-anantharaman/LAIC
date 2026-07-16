// GET /api/bridge/kbs/:kbId/packs — the ladder with derived envelopes.

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
    const packs = await kbStore().listPacksForKb(kbId);
    return NextResponse.json({ packs });
  } catch (e) {
    return apiError(e);
  }
}
