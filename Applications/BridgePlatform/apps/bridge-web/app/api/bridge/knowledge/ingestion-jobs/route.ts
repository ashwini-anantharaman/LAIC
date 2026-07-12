import { runLlmIngestion, type BridgeIngestionIntent } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { extractionClient } from "@/lib/extraction";
import { knowledgeStore } from "@/lib/knowledge";

/** GET /api/bridge/knowledge/ingestion-jobs (§16.4). */
export async function GET() {
  try {
    await requireAdminContext();
    return NextResponse.json({ jobs: await knowledgeStore().listJobs() });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * POST /api/bridge/knowledge/ingestion-jobs — run LLM extraction over an
 * uploaded source (§16.4). Body: { sourceId, systemFamily, intent? }.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminContext();
    const client = extractionClient();
    if (!client)
      return NextResponse.json(
        { error: "LLM extraction unavailable — ANTHROPIC_API_KEY is not provisioned" },
        { status: 503 },
      );
    const body = (await request.json().catch(() => ({}))) as {
      sourceId?: string;
      systemFamily?: string;
      intent?: BridgeIngestionIntent;
    };
    if (!body.sourceId || !body.systemFamily)
      return NextResponse.json({ error: "Body must include sourceId and systemFamily" }, { status: 400 });
    const job = await runLlmIngestion(knowledgeStore(), client, {
      sourceId: body.sourceId,
      systemFamily: body.systemFamily as never,
      requestedBy: context.nexusUserId,
      now: new Date().toISOString(),
      jobId: `job_${crypto.randomUUID().slice(0, 8)}`,
      intent: body.intent,
    });
    await audit(context, "knowledge.ingestion.run", "source", body.sourceId, {
      extractor: "llm",
      via: "api",
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
