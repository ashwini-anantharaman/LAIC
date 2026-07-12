import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/generation-runs/:id/diff (§16.4). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminContext();
    const { id } = await params;
    const run = await knowledgeStore().getRun(id);
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      diff: run.diff,
      warnings: run.warnings ?? [],
      testCoverage: run.testCoverage ?? null,
    });
  } catch (e) {
    return apiError(e);
  }
}
