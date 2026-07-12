import type { BridgeReadableKnowledgeItem } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/readable-items/:id (§16.4). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminContext();
    const { id } = await params;
    const item = await knowledgeStore().getItem(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item, revisions: await knowledgeStore().listItemRevisions(id) });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * PATCH /api/bridge/knowledge/readable-items/:id — edit bumps the version;
 * pinned package versions keep the text they consumed (§16.4). Status flips
 * (active/deprecated) replace the plan's approve/reject (deviation 6:
 * provenance over approval — nothing blocks on review).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit", "bridge.knowledge.review");
    const { id } = await params;
    const existing = await knowledgeStore().getItem(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Partial<BridgeReadableKnowledgeItem>;
    const edited: BridgeReadableKnowledgeItem = {
      ...existing,
      title: body.title ?? existing.title,
      humanReadableRule: body.humanReadableRule ?? existing.humanReadableRule,
      structuredFields: body.structuredFields ?? existing.structuredFields,
      relatedSkillIds: body.relatedSkillIds ?? existing.relatedSkillIds,
      relatedConceptIds: body.relatedConceptIds ?? existing.relatedConceptIds,
      reviewerNotes: body.reviewerNotes ?? existing.reviewerNotes,
      status: body.status ?? existing.status,
      version: String(Number(existing.version) + 1),
    };
    await knowledgeStore().saveItem(edited);
    await audit(context, "knowledge.item.edit", "knowledge_item", id, {
      fromVersion: existing.version,
      toVersion: edited.version,
      via: "api",
    });
    return NextResponse.json({ item: edited });
  } catch (e) {
    return apiError(e);
  }
}
