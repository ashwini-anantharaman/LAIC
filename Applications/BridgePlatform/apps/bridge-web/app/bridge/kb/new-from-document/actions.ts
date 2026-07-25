"use server";

// Actions for the "new knowledge base from a document" wizard (visual ingest).
//
// Every action here follows the source-audit discipline: ONE CLICK = ONE
// SERVERLESS INVOCATION. Nothing long-running is started in the background and
// no progress is held in memory — each run does a bounded slice of work, writes
// it to the store, and redirects back to the wizard, which recomputes the whole
// picture from the store. Reload, resume tomorrow, or hand the URL to someone
// else: the stage is always derived, never remembered.
//
// The heavy lifting lives in modules this file only CALLS:
//   @/lib/visualIngest  — bucket + PDF storage, page counting, the reading pass
//   @/lib/extraction    — the section-map proposal and per-section extraction
// so this file stays a thin, audited seam between the UI and those runners.

import {
  newId,
  runVisualSectionExtraction,
  type KbSource,
  type KbSourceDocument,
  type KbSourcePassage,
  type KnowledgeItem,
} from "@bridge/kb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { createVisualSectionExtractor, proposeSections } from "@/lib/extraction";
import {
  buildDocumentText,
  downloadSourcePdf,
  INGEST_MODELS,
  pdfPageCount,
  readingCandidates,
  runReadingBatch,
  storageAvailable,
  uploadSourcePdf,
  visionAvailable,
  type IngestModelOption,
} from "@/lib/visualIngest";
import { readingsFromPassages } from "@/lib/visualSections";
import {
  MAX_PDF_BYTES,
  PAGE_BATCH,
  normalizeSections,
  parseSectionRows,
  wizardUrl,
  type DocSection,
} from "./wizard";

/** The priced option the owner picked; Balanced is the default (plan §Costs). */
function ingestOption(raw: string): IngestModelOption {
  return INGEST_MODELS.find((m) => m.id === raw) ?? INGEST_MODELS[1] ?? INGEST_MODELS[0]!;
}

/** Every action returns to the wizard with the same identity + model choice. */
function back(
  formData: FormData,
  extra: Readonly<Record<string, string | number | undefined>> = {},
): string {
  return wizardUrl({
    kbId: String(formData.get("kbId") ?? ""),
    sourceId: String(formData.get("sourceId") ?? ""),
    model: String(formData.get("model") ?? ""),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// 1. The knowledge base
// ---------------------------------------------------------------------------

/**
 * Create the KB the document will fill. Same service call the ordinary "New
 * knowledge base" form uses (kbService().createKb) — only the landing differs:
 * back into the wizard, now carrying ?kbId=.
 */
export async function createKbFromDocumentAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kb = await kbService().createKb({
    name: String(formData.get("name") ?? "").trim(),
    systemLabel: String(formData.get("systemLabel") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.create", "kb", kb.kbId, { name: kb.name, fromDocument: true });
  revalidatePath("/bridge/kb", "layout");
  redirect(
    wizardUrl({ kbId: kb.kbId, model: String(formData.get("model") ?? "") }),
  );
}

// ---------------------------------------------------------------------------
// 2. The source + the PDF itself
// ---------------------------------------------------------------------------

/** Register the deck as a source (same record shape as the Sources tab). */
export async function registerVisualSourceAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const source: KbSource = {
    sourceId: `src_${String(formData.get("slug") ?? "").trim() || newId("s").slice(2)}`,
    title: String(formData.get("title") ?? "").trim(),
    sourceType: String(formData.get("sourceType")) as KbSource["sourceType"],
    rightsStatus: String(formData.get("rightsStatus")) as KbSource["rightsStatus"],
    locator: String(formData.get("locator") ?? "").trim() || undefined,
    kbId,
    registeredBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
  };
  await kbStore().putSource(source);
  await audit(context, "knowledge.source.register", "kb_source", source.sourceId, {
    kbId,
    visual: true,
  });
  revalidatePath(`/bridge/kb/${kbId}/sources`);
  redirect(
    wizardUrl({
      kbId,
      sourceId: source.sourceId,
      model: String(formData.get("model") ?? ""),
    }),
  );
}

/**
 * Store the raw PDF. Unlike the text flow (whose PdfUploadForm extracts text in
 * the BROWSER and posts only the text), visual ingest needs the actual bytes on
 * the server: Claude reads the pages as a document, so the file itself is what
 * gets uploaded and kept in the private bucket.
 */
export async function uploadVisualPdfAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const fail = (message: string): never => redirect(back(formData, { error: message }));

  if (!storageAvailable())
    fail(
      "Visual ingestion needs the Postgres backend — this server has nowhere to keep the PDF.",
    );
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size)
    fail("No file was attached — choose the PDF first, then upload.");
  const pdf = file as File;
  if (!(pdf.type === "application/pdf" || pdf.name.toLowerCase().endsWith(".pdf")))
    fail("Visual ingestion reads PDFs — export the slide deck to PDF and upload that.");
  if (pdf.size > MAX_PDF_BYTES)
    fail(
      `That file is ${(pdf.size / 1_000_000).toFixed(1)} MB — the cap is 50 MB, and this server's request-body limit is 4 MB.`,
    );

  const bytes = new Uint8Array(await pdf.arrayBuffer());
  let storagePath = "";
  let pageCount = 0;
  try {
    // uploadSourcePdf creates the bucket if needed and returns the object path.
    storagePath = await uploadSourcePdf({ sourceId, fileName: pdf.name, bytes });
    pageCount = await pdfPageCount(bytes);
  } catch (e) {
    fail(
      `The PDF could not be stored: ${e instanceof Error ? e.message : "unknown storage error"}`,
    );
  }
  if (!storagePath) fail("The PDF was stored but no object path came back — nothing to read.");
  if (!pageCount) fail("That PDF reports zero pages — is the export complete?");

  // The document's `text` is REQUIRED and every text surface reads it; the
  // reading pass replaces this placeholder page by page.
  const text = `Visual ingest — ${pageCount} slide${pageCount === 1 ? "" : "s"} stored, not read yet. Each page's reading replaces this line as the reading pass runs.`;
  const document: KbSourceDocument = {
    sourceId,
    fileName: pdf.name,
    mediaType: "application/pdf",
    charCount: text.length,
    uploadedAt: new Date().toISOString(),
    text,
    storagePath,
    pageCount,
    ingestMode: "visual",
  };
  const store = kbStore();
  await store.putDocument(document);
  // A new PDF invalidates any earlier page readings (page N is a different
  // slide now) — start the reading pass from a clean slate.
  await store.replacePassages(sourceId, []);
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    visual: true,
    pageCount,
    bytes: pdf.size,
  });
  revalidatePath(`/bridge/kb/${kbId}`, "layout");
  redirect(back(formData, { uploaded: pageCount }));
}

// ---------------------------------------------------------------------------
// 3. The reading pass — batched, resumable
// ---------------------------------------------------------------------------

/**
 * Read the next batch of unread pages. Candidates are pages without a passage,
 * so re-clicking walks the deck and a crash mid-deck costs one batch. Progress
 * is the passage count, never a cursor we could get wrong.
 */
export async function runReadingBatchAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const model = String(formData.get("model") ?? "");
  if (!visionAvailable())
    throw new Error("Reading a document needs ANTHROPIC_API_KEY on the server");

  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  if (!doc?.storagePath || !doc.pageCount)
    redirect(back(formData, { error: "Upload the PDF for this source first." }));

  const before = await store.listPassages(sourceId);
  const candidates = readingCandidates(doc.pageCount, before);
  if (!candidates.length) redirect(back(formData, { read: 0, remaining: 0 }));

  const batch = candidates.slice(0, PAGE_BATCH);
  const option = ingestOption(model);
  let fresh: KbSourcePassage[] = [];
  try {
    const bytes = await downloadSourcePdf(doc.storagePath);
    fresh = await runReadingBatch({
      sourceId,
      bytes,
      pages: batch,
      model: option.readingModel,
    });
  } catch (e) {
    redirect(
      back(formData, {
        error: `Reading pages ${batch[0]}–${batch[batch.length - 1]} failed: ${e instanceof Error ? e.message : "unknown error"}. Nothing was written — click again to retry just those pages.`,
      }),
    );
  }

  // replacePassages is wholesale, so merge: keep every page already read and
  // let this batch replace its own pages. Progress is the passage count itself
  // — never a cursor that could disagree with the store.
  const readNow = new Set(fresh.map((p) => p.ordinal));
  const merged = [...before.filter((p) => !readNow.has(p.ordinal)), ...fresh].sort(
    (a, b) => a.ordinal - b.ordinal,
  );
  await store.replacePassages(sourceId, merged);
  const text = buildDocumentText(merged);
  await store.putDocument({ ...doc, text, charCount: text.length });
  const read = fresh.length;
  const remaining = readingCandidates(doc.pageCount, merged).length;

  await audit(context, "knowledge.ingestion.run", "kb_source", sourceId, {
    kbId,
    visualReading: true,
    attempted: batch.length,
    read,
    remaining,
    model: option.readingModel,
  });
  revalidatePath(`/bridge/kb/${kbId}`, "layout");
  redirect(back(formData, { read, remaining }));
}

// ---------------------------------------------------------------------------
// 4. The section map
// ---------------------------------------------------------------------------

/** Propose a table of contents over the page readings (one cheap call). */
export async function proposeSectionsAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  if (!visionAvailable())
    throw new Error("Proposing a section map needs ANTHROPIC_API_KEY on the server");

  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  if (!doc?.pageCount)
    redirect(back(formData, { error: "Upload the PDF for this source first." }));

  let sections: DocSection[] = [];
  try {
    const passages = await store.listPassages(sourceId);
    const source = await store.getSource(sourceId);
    // The proposal reads the STORED page readings (recovered from the passages),
    // not the PDF — one cheap call, so it rides the option's reading model.
    sections = await proposeSections({
      pageReadings: readingsFromPassages(passages),
      pageCount: doc.pageCount,
      deckTitle: source?.title ?? doc.fileName,
      model: ingestOption(String(formData.get("model") ?? "")).readingModel,
    });
  } catch (e) {
    redirect(
      back(formData, {
        error: `The section map couldn't be proposed: ${e instanceof Error ? e.message : "unknown error"}. Add sections by hand instead.`,
      }),
    );
  }
  await store.putDocument({ ...doc, sections });
  await audit(context, "knowledge.ingestion.run", "kb_source", sourceId, {
    kbId,
    sectionMap: "proposed",
    sections: sections.length,
  });
  redirect(back(formData, { proposed: sections.length }));
}

/**
 * Save the edited section map. One form, three intents: save, add a row, or
 * remove row N (plain submit buttons — no client JS in the wizard).
 */
export async function saveSectionsAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  if (!doc?.pageCount)
    redirect(back(formData, { error: "Upload the PDF for this source first." }));

  const rows = parseSectionRows(formData);
  const removed = formData.get("remove");
  const kept =
    removed === null ? rows : rows.filter((_, index) => index !== Number(removed));
  const sections = normalizeSections(kept, doc.pageCount);
  if (formData.get("add") !== null) {
    const lastPage = sections.length ? sections[sections.length - 1]!.toPage : 0;
    sections.push({
      title: "New section",
      fromPage: Math.min(lastPage + 1, doc.pageCount),
      toPage: doc.pageCount,
    });
  }

  await store.putDocument({ ...doc, sections });
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    sectionMap: "saved",
    sections: sections.length,
  });
  redirect(back(formData, { sectionsSaved: sections.length }));
}

// ---------------------------------------------------------------------------
// 5. Per-section extraction
// ---------------------------------------------------------------------------

/**
 * Extract ONE named section. Jobs, failures and resumability are the ordinary
 * extraction machinery — a visual section is just a section whose passages are
 * pages — so what lands is draft items citing `page-N`, gated by the compiler.
 */
export async function extractSectionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const model = String(formData.get("model") ?? "");
  const index = Number(formData.get("sectionIndex"));
  if (!visionAvailable())
    throw new Error("Extraction needs ANTHROPIC_API_KEY on the server");

  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  const section = doc?.sections?.[index];
  if (!section)
    redirect(
      back(formData, { error: "That section is gone — save the section map and try again." }),
    );
  if (!doc?.storagePath)
    redirect(back(formData, { error: "The stored PDF is missing — upload it again." }));

  const option = ingestOption(model);
  const [passages, items] = await Promise.all([
    store.listPassages(sourceId),
    store.listItemsForKb(kbId),
  ]);
  let extracted = 0;
  let failed = 0;
  try {
    // Extraction reads the real PAGES (pixels), so it needs the whole PDF; the
    // KB's existing titles and setting keys go along as dedupe context.
    const extractor = createVisualSectionExtractor({
      kbId,
      sourceId,
      bytes: await downloadSourcePdf(doc.storagePath),
      existingTitles: items.map((item) => item.title),
      existingSettingKeys: items.flatMap((item) => item.settings.map((s) => s.key)),
      model: option.extractionModel,
    });
    // Jobs, the compiler gate, citation wiring and the failure report are the
    // ordinary extraction machinery — a visual section IS a section.
    const job = await runVisualSectionExtraction(store, kbService(), extractor, {
      kbId,
      sourceId,
      requestedBy: context.nexusUserId,
      section,
      passages,
    });
    extracted = job.createdItemIds.length;
    failed = job.failures.length;
  } catch (e) {
    redirect(
      back(formData, {
        error: `Extracting “${section.title}” failed: ${e instanceof Error ? e.message : "unknown error"}. Nothing was written — try again, or narrow the page range.`,
      }),
    );
  }

  await audit(context, "kb.extraction.run", "kb_source", sourceId, {
    kbId,
    visualSection: section.title,
    fromPage: section.fromPage,
    toPage: section.toPage,
    itemsCreated: extracted,
    failures: failed,
    model: option.extractionModel,
  });
  revalidatePath(`/bridge/kb/${kbId}`, "layout");
  redirect(back(formData, { extracted, failed, section: index }));
}

// ---------------------------------------------------------------------------
// 6. Make it playable
// ---------------------------------------------------------------------------

/** The floor a document almost never states: fallbacks per phase + a signal
 *  policy. Mirrors @bridge/sayc-template's floor items exactly (chapters/floor.ts
 *  and the "Defensive signals" item) — signals is the one completeness category
 *  no fallback can satisfy. */
const FLOOR_ITEMS: readonly {
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeItem["knowledgeType"];
  phase: KnowledgeItem["phase"];
  payload: KnowledgeItem["payload"];
}[] = [
  {
    title: "Auction fallback: pass",
    humanReadableText:
      "When no agreement applies to the auction, pass. The floor under every convention — it guarantees the player always has a legal call.",
    knowledgeType: "fallback_rule",
    phase: "auction",
    payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
  },
  {
    title: "Lead fallback: low from longest",
    humanReadableText: "When no lead agreement applies, lead low from the longest suit.",
    knowledgeType: "fallback_rule",
    phase: "opening_lead",
    payload: {
      kind: "fallback",
      fallback: { phase: "opening_lead", behavior: "low_from_longest" },
    },
  },
  {
    title: "Play fallback: lowest legal card",
    humanReadableText:
      "When no play technique applies, play the lowest legal card (following suit when possible).",
    knowledgeType: "fallback_rule",
    phase: "declarer_play",
    payload: { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
  },
  {
    title: "Defensive signals",
    humanReadableText:
      "Standard signals: high encourages, low discourages (attitude); when giving count, high-low shows an even number and low-high odd. The first discard is attitude.",
    knowledgeType: "signal_agreement",
    phase: "defense",
    payload: {
      kind: "signals",
      signals: { attitude: "standard", count: "standard", firstDiscard: "attitude" },
    },
  },
];

/**
 * Make the KB playable: add any missing floor items and put EVERYTHING into one
 * intended-complete set, so the 17-category checklist scores it and players can
 * be built. Idempotent — items match by title, the set by name — and it batches
 * store puts with ONE recompile (savePack's), never per-item createItem.
 */
export async function makePlayableAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const store = kbStore();
  const kb = await kbService().getKb(kbId);
  const existing = await store.listItemsForKb(kbId);
  const byTitle = new Set(existing.map((item) => item.title));
  const now = new Date().toISOString();

  let added = 0;
  for (const floor of FLOOR_ITEMS) {
    if (byTitle.has(floor.title)) continue;
    const item: KnowledgeItem = {
      itemId: newId("ki"),
      title: floor.title,
      humanReadableText: floor.humanReadableText,
      knowledgeType: floor.knowledgeType,
      phase: floor.phase,
      payload: floor.payload,
      settings: [],
      sourceReferences: [
        { sourceId: "src_claude", anchor: "platform floor — added by the document wizard" },
      ],
      supportedLevels: [],
      status: "draft",
      version: 1,
      createdBy: context.nexusUserId,
      createdAt: now,
      updatedAt: now,
    };
    await store.putItem(item);
    await store.addMembership({ kbId, itemId: item.itemId });
    added++;
  }

  const itemIds = (await store.listItemsForKb(kbId))
    .filter((item) => item.status !== "deprecated")
    .map((item) => item.itemId);
  const packName = `Full ${kb.systemLabel}`;
  const packs = await store.listPacksForKb(kbId);
  let packId = packs.find((pack) => pack.name === packName)?.packId;
  try {
    const pack = await kbService().savePack({
      packId,
      kbId,
      name: packName,
      description:
        "Everything this knowledge base knows, plus the floor — the set players are built from.",
      intendedComplete: true,
      itemIds,
      createdBy: context.nexusUserId,
    });
    packId = pack.packId;
  } catch (e) {
    redirect(
      back(formData, {
        error: `The set couldn't be saved: ${e instanceof Error ? e.message : "unknown error"}`,
      }),
    );
  }

  await audit(context, "kb.pack.save", "kb_pack", packId!, {
    kbId,
    makePlayable: true,
    floorItemsAdded: added,
    items: itemIds.length,
  });
  revalidatePath(`/bridge/kb/${kbId}`, "layout");
  redirect(back(formData, { playable: added, packId }));
}
