// POST /api/bridge/kbs/:kbId/read-pages — run ONE reading batch for a visual
// source and return progress as JSON. The client auto-read runner loops this
// (one batch per request keeps each call under the serverless timeout; pages
// already read are skipped, so it's resumable and a crash costs one batch).

import { NextResponse, type NextRequest } from "next/server";
import type { KbSourcePassage } from "@bridge/kb";
import { apiError, requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { kbStore } from "@/lib/kb";
import {
  buildDocumentText,
  downloadSourcePdf,
  ingestModel,
  readingCandidates,
  runReadingBatch,
  storageAvailable,
  visionAvailable,
  type IngestModelId,
} from "@/lib/visualIngest";

const PAGE_BATCH = 8;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> },
) {
  try {
    const context = await requireAdminContext("bridge.knowledge.edit");
    const { kbId } = await params;
    const { sourceId, model } = (await request.json()) as {
      sourceId?: string;
      model?: string;
    };
    if (!sourceId)
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    if (!visionAvailable())
      return NextResponse.json(
        { error: "Reading a document needs ANTHROPIC_API_KEY on the server" },
        { status: 400 },
      );
    if (!storageAvailable())
      return NextResponse.json(
        { error: "Source-file storage needs the Postgres backend" },
        { status: 400 },
      );

    const store = kbStore();
    const doc = await store.getDocument(sourceId);
    if (!doc?.storagePath || !doc.pageCount)
      return NextResponse.json(
        { error: "Upload the PDF for this source first" },
        { status: 400 },
      );

    const before = await store.listPassages(sourceId);
    const candidates = readingCandidates(doc.pageCount, before);
    if (!candidates.length)
      return NextResponse.json({
        total: doc.pageCount,
        remaining: 0,
        read: 0,
        done: true,
      });

    const batch = candidates.slice(0, PAGE_BATCH);
    const option = ingestModel((model ?? "balanced") as IngestModelId);
    const bytes = await downloadSourcePdf(doc.storagePath);
    const fresh: KbSourcePassage[] = await runReadingBatch({
      sourceId,
      bytes,
      pages: batch,
      model: option.readingModel,
    });

    // replacePassages is wholesale: keep every page already read and let this
    // batch replace its own pages. Progress is the passage count itself.
    const readNow = new Set(fresh.map((p) => p.ordinal));
    const merged = [...before.filter((p) => !readNow.has(p.ordinal)), ...fresh].sort(
      (a, b) => a.ordinal - b.ordinal,
    );
    await store.replacePassages(sourceId, merged);
    const text = buildDocumentText(merged);
    await store.putDocument({ ...doc, text, charCount: text.length });

    const remaining = readingCandidates(doc.pageCount, merged).length;
    await audit(context, "knowledge.ingestion.run", "kb_source", sourceId, {
      kbId,
      visualReading: true,
      attempted: batch.length,
      read: fresh.length,
      remaining,
      model: option.readingModel,
    });
    return NextResponse.json({
      total: doc.pageCount,
      remaining,
      read: fresh.length,
      done: remaining === 0,
    });
  } catch (e) {
    return apiError(e);
  }
}
