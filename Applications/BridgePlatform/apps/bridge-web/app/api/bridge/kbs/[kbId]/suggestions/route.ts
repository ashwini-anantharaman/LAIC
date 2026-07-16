// GET/POST /api/bridge/kbs/:kbId/suggestions — the fellow feedback queue.

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { kbService, kbStore } from "@/lib/kb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    await requireContext();
    const { kbId } = await params;
    const suggestions = await kbStore().listSuggestionsForKb(kbId);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const context = await requireContext();
    const { kbId } = await params;
    const body = (await request.json()) as { text: string; itemId?: string };
    const suggestion = await kbService().createSuggestion({
      kbId,
      itemId: body.itemId,
      text: body.text,
      createdBy: context.nexusUserId,
    });
    await audit(context, "kb.suggestion.change", "kb_suggestion", suggestion.suggestionId, {
      kbId,
      api: true,
    });
    return NextResponse.json({ suggestion }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
