import type { BridgeKnowledgeSource } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/sources (§16.4). */
export async function GET() {
  try {
    await requireAdminContext();
    return NextResponse.json({ sources: await knowledgeStore().listSources() });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/bridge/knowledge/sources — register a source (§16.4). */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminContext();
    const body = (await request.json().catch(() => ({}))) as Partial<BridgeKnowledgeSource> & {
      slug?: string;
    };
    if (!body.slug || !body.title || !body.sourceType || !body.rightsStatus)
      return NextResponse.json(
        { error: "Body must include slug, title, sourceType, rightsStatus" },
        { status: 400 },
      );
    const source: BridgeKnowledgeSource = {
      sourceId: `src_${body.slug}`,
      title: body.title,
      sourceType: body.sourceType,
      rightsStatus: body.rightsStatus,
      systemFamily: body.systemFamily,
      locator: body.locator,
      notes: body.notes,
      uploadedBy: context.nexusUserId,
      uploadedAt: new Date().toISOString(),
      status: "registered",
    };
    await knowledgeStore().saveSource(source);
    await audit(context, "knowledge.source.register", "source", source.sourceId, {
      title: source.title,
      via: "api",
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
