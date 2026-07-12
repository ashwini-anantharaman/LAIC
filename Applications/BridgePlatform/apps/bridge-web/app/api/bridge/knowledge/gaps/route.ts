import { NextResponse } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/gaps — the explicit gap registry (§12.6, §16.4). */
export async function GET() {
  try {
    await requireAdminContext();
    return NextResponse.json({ gaps: await knowledgeStore().listGaps() });
  } catch (e) {
    return apiError(e);
  }
}
