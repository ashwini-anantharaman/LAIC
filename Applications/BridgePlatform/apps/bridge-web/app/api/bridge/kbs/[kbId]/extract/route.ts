// POST /api/bridge/kbs/:kbId/extract — run ONE extraction batch for a source
// and return progress as JSON. The client auto-extract runner loops this (one
// batch per request keeps each call under the serverless timeout; completed
// sections are skipped, so it's resumable).

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createClaudeExtractor, extractionAvailable } from "@/lib/extraction";
import { kbService, kbStore } from "@/lib/kb";

const EXTRACTION_BATCH = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit");
    const { kbId } = await params;
    const { sourceId } = (await request.json()) as { sourceId?: string };
    if (!sourceId)
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    if (!extractionAvailable())
      return NextResponse.json(
        { error: "Extraction needs ANTHROPIC_API_KEY on the server" },
        { status: 400 },
      );

    const { pendingSections } = await import("@/lib/documents");
    const { total, remaining } = await pendingSections(kbId, sourceId);
    if (!remaining.length)
      return NextResponse.json({ total, remaining: 0, extracted: 0, failed: 0, done: true });

    const batch = remaining.slice(0, EXTRACTION_BATCH);
    const { runExtraction } = await import("@bridge/kb");
    const jobs = await runExtraction(kbStore(), kbService(), createClaudeExtractor(), {
      kbId,
      sourceId,
      requestedBy: context.nexusUserId,
      sections: batch,
    });
    const extracted = jobs.reduce((n, j) => n + j.createdItemIds.length, 0);
    const failed = jobs.reduce((n, j) => n + j.failures.length, 0);
    const left = remaining.length - batch.length;
    await audit(context, "kb.extraction.run", "kb_source", sourceId, {
      kbId,
      jobs: jobs.length,
      itemsCreated: extracted,
    });
    return NextResponse.json({ total, remaining: left, extracted, failed, done: left === 0 });
  } catch (e) {
    return apiError(e);
  }
}
