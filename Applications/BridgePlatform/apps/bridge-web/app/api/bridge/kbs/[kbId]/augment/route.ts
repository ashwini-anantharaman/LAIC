// POST /api/bridge/kbs/:kbId/augment — run ONE augmentation batch against a
// DRAFT KB (kb.augmentation must exist) and return progress. The client
// board loops this exactly like source extraction; completed sections are
// skipped server-side, so it is pausable and resumable.

import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { extractionAvailable } from "@/lib/extraction";
import { createClaudeAugmentor } from "@/lib/augmentExtraction";
import { kbService, kbStore } from "@/lib/kb";

/** Augment prompts carry the item index too — keep batches small. */
const AUGMENT_BATCH = 2;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit");
    const { kbId } = await params;
    const kb = await kbService().getKb(kbId);
    if (!kb.augmentation || kb.augmentation.status !== "review")
      return NextResponse.json(
        { error: "This knowledge base has no augmentation in review" },
        { status: 400 },
      );
    if (!extractionAvailable())
      return NextResponse.json(
        { error: "Augmentation needs ANTHROPIC_API_KEY on the server" },
        { status: 400 },
      );

    const sourceId = kb.augmentation.sourceId;
    const { pendingSections } = await import("@/lib/documents");
    const { total, remaining } = await pendingSections(kbId, sourceId);
    if (!remaining.length)
      return NextResponse.json({
        total,
        remaining: 0,
        extracted: 0,
        modified: 0,
        failed: 0,
        done: true,
      });

    const batch = remaining.slice(0, AUGMENT_BATCH);
    const { runAugmentation } = await import("@bridge/kb");
    const existingItems = await kbStore().listItemsForKb(kbId);
    const jobs = await runAugmentation(
      kbStore(),
      kbService(),
      createClaudeAugmentor(existingItems),
      { kbId, sourceId, requestedBy: context.nexusUserId, sections: batch },
    );
    const extracted = jobs.reduce((n, j) => n + j.createdItemIds.length, 0);
    const modified = jobs.reduce((n, j) => n + (j.modifiedItemIds?.length ?? 0), 0);
    const failed = jobs.reduce((n, j) => n + j.failures.length, 0);
    const left = remaining.length - batch.length;
    await audit(context, "kb.extraction.run", "kb_source", sourceId, {
      kbId,
      augmentation: true,
      itemsCreated: extracted,
      itemsModified: modified,
    });
    return NextResponse.json({
      total,
      remaining: left,
      extracted,
      modified,
      failed,
      done: left === 0,
    });
  } catch (e) {
    return apiError(e);
  }
}
