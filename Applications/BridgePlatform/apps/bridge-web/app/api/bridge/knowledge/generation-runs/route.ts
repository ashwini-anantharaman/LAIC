import { runGeneration } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/generation-runs (§16.4). */
export async function GET() {
  try {
    await requireAdminContext();
    return NextResponse.json({ runs: await knowledgeStore().listRuns() });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/bridge/knowledge/generation-runs — body { systemFamily, bump? } (§16.4). */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminContext("bridge.knowledge.review", "bridge.program.manage");
    const body = (await request.json().catch(() => ({}))) as {
      systemFamily?: string;
      bump?: "major" | "minor" | "patch";
    };
    if (!body.systemFamily)
      return NextResponse.json({ error: "Body must include systemFamily" }, { status: 400 });
    const run = await runGeneration(knowledgeStore(), {
      systemFamily: body.systemFamily as never,
      requestedBy: context.nexusUserId,
      bump: body.bump ?? "minor",
      now: new Date().toISOString(),
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
    });
    await audit(context, "generation.run", "generation_run", run.runId, {
      status: run.status,
      resultVersion: run.resultVersion,
      via: "api",
    });
    return NextResponse.json({ run }, { status: run.status === "completed" ? 201 : 422 });
  } catch (e) {
    return apiError(e);
  }
}
