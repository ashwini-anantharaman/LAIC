// GET/POST /api/bridge/kbs/:kbId/items — the readable knowledge surface.

import type { KnowledgeItem } from "@bridge/kb";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { kbService, kbStore } from "@/lib/kb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    await requireContext();
    const { kbId } = await params;
    const items = await kbStore().listItemsForKb(kbId);
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit");
    const { kbId } = await params;
    const body = (await request.json()) as Omit<
      KnowledgeItem,
      "itemId" | "version" | "createdAt" | "updatedAt" | "createdBy"
    >;
    const item = await kbService().createItem(kbId, {
      ...body,
      createdBy: context.nexusUserId,
    });
    await audit(context, "kb.item.create", "kb_item", item.itemId, { kbId, api: true });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
