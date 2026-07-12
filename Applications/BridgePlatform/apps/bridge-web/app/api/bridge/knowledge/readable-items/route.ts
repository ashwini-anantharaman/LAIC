import type { BridgeReadableKnowledgeItem } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/readable-items?systemFamily=&status= (§16.4). */
export async function GET(request: NextRequest) {
  try {
    await requireAdminContext();
    const systemFamily = request.nextUrl.searchParams.get("systemFamily") ?? undefined;
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const items = await knowledgeStore().listItems({
      systemFamily: systemFamily as never,
      status: status as never,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/bridge/knowledge/readable-items — author a new item (§16.4). */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit", "bridge.knowledge.review");
    const body = (await request.json().catch(() => ({}))) as Partial<BridgeReadableKnowledgeItem>;
    if (!body.itemId || !body.itemType || !body.title || !body.humanReadableRule || !body.systemFamily)
      return NextResponse.json(
        { error: "Body must include itemId, itemType, title, humanReadableRule, systemFamily" },
        { status: 400 },
      );
    if (await knowledgeStore().getItem(body.itemId))
      return NextResponse.json({ error: `Item ${body.itemId} already exists — PATCH it` }, { status: 409 });
    const item: BridgeReadableKnowledgeItem = {
      itemId: body.itemId,
      systemFamily: body.systemFamily,
      itemType: body.itemType,
      title: body.title,
      humanReadableRule: body.humanReadableRule,
      structuredFields: body.structuredFields ?? {},
      sourceIds: body.sourceIds ?? [],
      citations: body.citations ?? [],
      relatedItemIds: body.relatedItemIds,
      relatedSkillIds: body.relatedSkillIds,
      relatedConceptIds: body.relatedConceptIds,
      gapIds: body.gapIds ?? [],
      reviewerNotes: body.reviewerNotes,
      status: "active",
      version: "1",
      createdBy: context.nexusUserId,
      createdAt: new Date().toISOString(),
    };
    await knowledgeStore().saveItem(item);
    await audit(context, "knowledge.item.edit", "knowledge_item", item.itemId, {
      created: true,
      via: "api",
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
