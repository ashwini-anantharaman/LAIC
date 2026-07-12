import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/ingestion-jobs/:id (§16.4). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminContext();
    const { id } = await params;
    const job = (await knowledgeStore().listJobs()).find((j) => j.jobId === id);
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (e) {
    return apiError(e);
  }
}
