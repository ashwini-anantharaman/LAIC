// VISUAL INGEST (2026-07-25): build a knowledge base from a slide deck whose
// meaning lives in TABLES, COLOR-CODED ROWS, 2D matrices, card diagrams and
// four-hand figures — none of which survive a text-layer extraction. Claude
// reads PDFs natively, so the raw PDF is stored (Supabase Storage) and fed to
// the model in page windows: one READING pass transcribes each page into a
// citable passage, and (later) extraction sees the same pixels again.
//
// ADDITIVE by construction: nothing here touches the text pipeline
// (lib/documents.ts, packages/bridge-kb/src/passages.ts). A visual document
// still ends up with a required `text` (buildDocumentText) so every existing
// text surface behaves identically.
//
// SERVER-ONLY: imports the Anthropic SDK, the Supabase service-role client and
// pdf-lib. Never import this from a client component.
//
// LLM boundary: transcription + extraction assistance only. Output is
// attributed, editable content citing exact pages. Claude never decides bids.

import Anthropic from "@anthropic-ai/sdk";
import { fnv1a, type KbSourcePassage } from "@bridge/kb";
import { PDFDocument } from "pdf-lib";
import { pgClient, storeBackend } from "./backend";

// ---------------------------------------------------------------------------
// Availability (honest degradation — mirrors extractionAvailable()/auditAvailable())
// ---------------------------------------------------------------------------

/** True when a key is configured; the wizard shows a no-key notice otherwise. */
export function visionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * True when raw source files can be stored. Storage lives in the Supabase
 * project, so it only exists on the postgres backend; on the file backend
 * (local dev, Playwright) there is nowhere to put a PDF and callers must
 * degrade honestly rather than throw.
 */
export function storageAvailable(): boolean {
  return (
    storeBackend() === "postgres" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

// ---------------------------------------------------------------------------
// Storage: the private bucket holding raw source files
// ---------------------------------------------------------------------------

export const SOURCE_BUCKET = "kb-source-files";

function sourceStorage() {
  if (!storageAvailable())
    throw new Error(
      "Source-file storage needs STORE_BACKEND=postgres with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  return pgClient().storage;
}

/** Create the private bucket if it isn't there yet. Safe to call every time. */
export async function ensureSourceBucket(): Promise<void> {
  const storage = sourceStorage();
  const existing = await storage.getBucket(SOURCE_BUCKET);
  if (existing.data) return;
  const created = await storage.createBucket(SOURCE_BUCKET, { public: false });
  // A concurrent caller may have won the race — "already exists" is success.
  if (created.error && !/exist/i.test(created.error.message))
    throw new Error(`Could not create the ${SOURCE_BUCKET} bucket: ${created.error.message}`);
}

/** Object path for a source's file: scoped by source so re-uploads replace. */
export function sourceStoragePath(sourceId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "source.pdf";
  return `${sourceId}/${safe}`;
}

/** Store the raw PDF (upsert) and return its storagePath. */
export async function uploadSourcePdf(input: {
  sourceId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<string> {
  await ensureSourceBucket();
  const storagePath = sourceStoragePath(input.sourceId, input.fileName);
  const body = new Blob([new Uint8Array(input.bytes)], { type: "application/pdf" });
  const { error } = await sourceStorage()
    .from(SOURCE_BUCKET)
    .upload(storagePath, body, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return storagePath;
}

/** A short-lived signed URL — the bucket is private, so viewers need one. */
export async function getSignedSourceUrl(
  storagePath: string,
  expiresSeconds = 3600,
): Promise<string> {
  const { data, error } = await sourceStorage()
    .from(SOURCE_BUCKET)
    .createSignedUrl(storagePath, expiresSeconds);
  if (error || !data) throw new Error(`Could not sign ${storagePath}: ${error?.message ?? "no url"}`);
  return data.signedUrl;
}

/** Fetch the stored PDF back as bytes (for page counting and windowing). */
export async function downloadSourcePdf(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await sourceStorage().from(SOURCE_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Could not download ${storagePath}: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

// ---------------------------------------------------------------------------
// The model menu: the owner picks a priced option per run
// ---------------------------------------------------------------------------

export type IngestModelId = "max" | "balanced" | "budget";

export interface PriceRange {
  lowUsd: number;
  highUsd: number;
}

export interface IngestModelOption {
  id: IngestModelId;
  label: string;
  /** One line the wizard shows under the label. */
  note: string;
  /** Model for the per-page reading pass. */
  readingModel: string;
  /** Model for the (pixel-reading) extraction pass. */
  extractionModel: string;
  /** Estimated cost of a FULL run (reading + extraction) over `pages` pages. */
  estimate(pages: number): PriceRange;
}

/**
 * Per-run price bands from the plan's Costs table, quoted for the 88-page
 * reference deck and scaled linearly by page count. Re-runs are per-window and
 * resumable, so iterating costs a fraction of these.
 */
const REFERENCE_PAGES = 88;
const BANDS: Record<IngestModelId, PriceRange> = {
  max: { lowUsd: 8, highUsd: 18 },
  balanced: { lowUsd: 5, highUsd: 12 },
  budget: { lowUsd: 3, highUsd: 8 },
};

function scaleBand(id: IngestModelId, pages: number): PriceRange {
  const band = BANDS[id];
  const p = Number.isFinite(pages) && pages > 0 ? pages : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    lowUsd: round((band.lowUsd * p) / REFERENCE_PAGES),
    highUsd: round((band.highUsd * p) / REFERENCE_PAGES),
  };
}

export const INGEST_MODELS: IngestModelOption[] = [
  {
    id: "max",
    label: "A. Max fidelity",
    note: "Opus 4.8 reads every slide and extracts. Best transcription of colour and matrices.",
    readingModel: "claude-opus-4-8",
    extractionModel: "claude-opus-4-8",
    estimate: (pages) => scaleBand("max", pages),
  },
  {
    id: "balanced",
    label: "B. Balanced (default)",
    note: "Haiku 4.5 reads the slides, Opus 4.8 extracts. Extraction still sees the real pixels.",
    readingModel: "claude-haiku-4-5",
    extractionModel: "claude-opus-4-8",
    estimate: (pages) => scaleBand("balanced", pages),
  },
  {
    id: "budget",
    label: "C. Budget",
    note: "Sonnet 4.6 for both passes. Cheapest first look; re-run weak pages on A.",
    readingModel: "claude-sonnet-4-6",
    extractionModel: "claude-sonnet-4-6",
    estimate: (pages) => scaleBand("budget", pages),
  },
];

export function ingestModel(id: IngestModelId): IngestModelOption {
  const found = INGEST_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown ingest model option "${id}"`);
  return found;
}

/** Pure price estimator for a full run of `pages` pages under one option. */
export function priceEstimate(id: IngestModelId, pages: number): PriceRange {
  return ingestModel(id).estimate(pages);
}

// ---------------------------------------------------------------------------
// PDF windowing (pdf-lib — pure JS, serverless-safe; no rasterization needed)
// ---------------------------------------------------------------------------

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

/** Copy an explicit list of 1-indexed pages, in the given order. */
export async function slicePdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = source.getPageCount();
  const wanted = pages.filter((p) => Number.isInteger(p) && p >= 1 && p <= total);
  if (wanted.length === 0) throw new Error("slicePdfPages: no pages in range");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    source,
    wanted.map((p) => p - 1),
  );
  for (const page of copied) out.addPage(page);
  return out.save();
}

/** A window of the PDF, `fromPage`..`toPage` inclusive (1-indexed). */
export async function slicePdf(
  bytes: Uint8Array,
  fromPage: number,
  toPage: number,
): Promise<Uint8Array> {
  const pages: number[] = [];
  for (let p = fromPage; p <= toPage; p++) pages.push(p);
  return slicePdfPages(bytes, pages);
}

/**
 * Split an inclusive page range into windows of at most `size` pages. Pure —
 * this is the batching arithmetic behind "one click = one invocation".
 */
export function pageWindows(
  fromPage: number,
  toPage: number,
  size: number,
): { from: number; to: number }[] {
  if (!Number.isFinite(size) || size < 1) throw new Error("pageWindows: size must be >= 1");
  const out: { from: number; to: number }[] = [];
  for (let from = fromPage; from <= toPage; from += size) {
    out.push({ from, to: Math.min(from + size - 1, toPage) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The reading pass: one passage per PAGE
// ---------------------------------------------------------------------------

/**
 * Passage id for a page reading. Mirrors the chunker's `pp_<ordinal>_<hash>`
 * shape (packages/bridge-kb/src/passages.ts) but hashes the SOURCE + PAGE
 * rather than the text, so re-reading a page (a better model, a repaired
 * transcript) keeps existing citations pointing at it.
 */
export function pagePassageId(sourceId: string, page: number): string {
  return `pp_${page}_${fnv1a(`${sourceId}\npage-${page}`)}`;
}

/** Anchor convention for visual documents: `page-12`. */
export function pageAnchor(page: number): string {
  return `page-${page}`;
}

/**
 * Pages with no passage yet, in order — the resumable candidate list. Repeated
 * clicks walk the deck; a re-read is done by deleting a page's passage.
 */
export function readingCandidates(
  pageCount: number,
  existingPassages: { ordinal: number }[],
): number[] {
  const done = new Set(existingPassages.map((p) => p.ordinal));
  const out: number[] = [];
  for (let page = 1; page <= pageCount; page++) if (!done.has(page)) out.push(page);
  return out;
}

export type PageReadingKind = "table" | "matrix" | "diagram" | "prose" | "mixed";

export interface PageReading {
  page: number;
  kind: PageReadingKind;
  title: string;
  transcript: string;
}

const READING_KINDS: PageReadingKind[] = ["table", "matrix", "diagram", "prose", "mixed"];

export const READING_INSTRUCTIONS = `
You are TRANSCRIBING pages of a bridge teaching deck so that a rule extractor
(and a human reviewer) can work from your text alone. You are NOT summarizing
and you are NOT teaching: nothing on the page may be dropped, and nothing may
be added.

Return STRICT JSON (no markdown fences, no commentary) of shape:
{"pages":[{"page":<number>,"kind":"table"|"matrix"|"diagram"|"prose"|"mixed",
           "title":"<the slide's heading, or a short one you write>",
           "transcript":"<the full reading, markdown>"}]}

Use the ORIGINAL page numbers given in the user message, in order — one entry
per attached page, even if a page is blank ("transcript":"(blank slide)").

Transcription rules — these are the point of the exercise:
- TABLES become markdown tables, every row, every column, in page order.
  Keep the column headings verbatim (e.g. Points | Suit length | Bid | Note |
  Example). Never merge or summarize rows.
- COLOUR IS MEANING. Spell it out in words, both in a note above the table and
  in an extra column when rows differ: "rows highlighted orange = forcing for
  one round", "green row = game-forcing". Say which rows carry which colour.
  If a legend on the page defines the colours, transcribe the legend too.
- 2D MATRICES (support along one axis, strength along the other) become a
  markdown table with the axis labels stated explicitly.
- COMBINED opener/responder strength tables: keep both axes and say which axis
  is the opener's and which the responder's.
- DIAGRAMS (card positions, finesses): describe the layout hand by hand
  (declarer/dummy/LHO/RHO as labelled) and describe every annotation —
  especially a green arrow or line marking a recommended line of play — in
  words: what is led, from which hand, and what the annotation recommends.
- FOUR-HAND DEAL FIGURES: give all four hands suit by suit (spades, hearts,
  diamonds, clubs), the dealer/vulnerability if shown, the auction if shown,
  and the play/commentary if shown.
- COMPACT EXAMPLE HANDS ("xxx, KJx, xx, QJxxx") must be EXPANDED with the suit
  order stated: "spades xxx, hearts KJx, diamonds xx, clubs QJxxx".
- NEGATIVE AGREEMENTS are content: transcribe "Undiscussed, DON'T USE THEM!"
  and anything like it verbatim, attached to the rows it applies to.
- PROBABILITY / percentage tables: every row, numbers exactly as printed.
- Footnotes, asterisks, arrows and marginal notes are transcribed too.
- Never invent a bid, a point range or a holding that is not on the page.
`;

/** Build the (system, user-text) prompt for a window. Pure — unit-tested. */
export function buildReadingPrompt(pages: number[]): { system: string; user: string } {
  const list = pages.join(", ");
  return {
    system: READING_INSTRUCTIONS,
    user:
      `The attached PDF holds ${pages.length} page(s) of the deck. In order, they are ` +
      `the original page numbers: ${list}.\n\n` +
      `Transcribe each one and return the strict JSON object described above, ` +
      `using those original page numbers in the "page" field.`,
  };
}

/**
 * Parse the model's reply into page readings. Follows the extraction
 * JSON-slice idiom (first "{" … last "}"); throws when there is no JSON object
 * or no pages array, so a window either lands whole or is retried.
 */
export function parseReadingResponse(text: string): PageReading[] {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart)
    throw new Error("reading pass returned no JSON object");
  const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { pages?: unknown };
  if (!Array.isArray(raw.pages)) throw new Error("reading pass output missing pages array");
  const out: PageReading[] = [];
  for (const entry of raw.pages) {
    if (typeof entry !== "object" || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const page = typeof o.page === "number" ? Math.trunc(o.page) : NaN;
    if (!Number.isFinite(page) || page < 1) continue;
    const kind = READING_KINDS.includes(o.kind as PageReadingKind)
      ? (o.kind as PageReadingKind)
      : "mixed";
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    out.push({
      page,
      kind,
      title: str(o.title),
      transcript: str(o.transcript),
    });
  }
  return out;
}

/** The readable, structured passage text stored for one page. */
export function readingPassageText(reading: PageReading): string {
  const heading = `Page ${reading.page} — ${reading.title || "(untitled slide)"} [${reading.kind}]`;
  return reading.transcript ? `${heading}\n\n${reading.transcript}` : heading;
}

/** One page reading as a store-ready passage. */
export function readingToPassage(sourceId: string, reading: PageReading): KbSourcePassage {
  return {
    passageId: pagePassageId(sourceId, reading.page),
    sourceId,
    ordinal: reading.page,
    anchor: pageAnchor(reading.page),
    text: readingPassageText(reading),
  };
}

/**
 * The whole visual document as text, in page order — this is what fills the
 * REQUIRED `KbSourceDocument.text` once every page has been read, so the
 * source reader, the source-fidelity audit and search all keep working.
 */
export function buildDocumentText(passages: { ordinal: number; text: string }[]): string {
  return [...passages]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// The LLM call (client injectable so tests stub it — no network in CI)
// ---------------------------------------------------------------------------

/** The narrow slice of the Anthropic SDK this module uses. */
export interface VisionClient {
  messages: {
    stream(params: VisionRequest): VisionStream;
  };
}

export interface VisionRequest {
  model: string;
  max_tokens: number;
  thinking?: { type: "adaptive" };
  system?: string;
  messages: { role: "user"; content: VisionContentBlock[] }[];
}

export type VisionContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

export interface VisionStream {
  finalMessage(): Promise<{ content: { type: string; text?: string }[] }>;
}

/**
 * The real client, narrowed to VisionClient. The SDK's parameter types are
 * wider than what we send; the cast is the single seam so tests can inject a
 * stub with the same tiny surface.
 */
export function createVisionClient(): VisionClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("The reading pass needs ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey }) as unknown as VisionClient;
}

function textOf(message: { content: { type: string; text?: string }[] }): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

async function askForReadings(
  client: VisionClient,
  model: string,
  blocks: VisionContentBlock[],
  system: string,
): Promise<string> {
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: blocks }],
  });
  return textOf(await stream.finalMessage());
}

export interface ReadingBatchInput {
  sourceId: string;
  /** The whole stored PDF; the window is sliced from it here. */
  bytes: Uint8Array;
  /** Original 1-indexed page numbers to read in this invocation. */
  pages: number[];
  /** A reading model id from INGEST_MODELS. */
  model: string;
  /** Injected for tests; defaults to the real Anthropic client. */
  client?: VisionClient;
}

/**
 * Read ONE window: slice those pages out of the stored PDF, send them as a
 * native PDF document block, and return KbSourcePassage rows (ordinal = page,
 * anchor = `page-N`, deterministic passageId). One call = one invocation, so
 * the wizard batches and persists after each click.
 */
export async function runReadingBatch(input: ReadingBatchInput): Promise<KbSourcePassage[]> {
  const pages = [...new Set(input.pages)].filter((p) => Number.isInteger(p) && p >= 1).sort((a, b) => a - b);
  if (pages.length === 0) return [];
  const client = input.client ?? createVisionClient();

  const slice = await slicePdfPages(input.bytes, pages);
  const { system, user } = buildReadingPrompt(pages);
  const blocks: VisionContentBlock[] = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(slice).toString("base64"),
      },
    },
    { type: "text", text: user },
  ];

  const first = await askForReadings(client, input.model, blocks, system);
  let readings: PageReading[];
  try {
    readings = parseReadingResponse(first);
  } catch {
    // One repair attempt: the model sees its own malformed reply and re-emits
    // strict JSON. A second failure throws, leaving the window a candidate.
    const repair = await askForReadings(
      client,
      input.model,
      [
        ...blocks,
        {
          type: "text",
          text:
            `Your previous reply was not parseable as the required JSON object. ` +
            `Re-emit it as STRICT JSON of shape {"pages":[{"page","kind","title","transcript"}]} ` +
            `with no prose and no markdown fences. Previous reply:\n\n${first}`,
        },
      ],
      system,
    );
    readings = parseReadingResponse(repair);
  }

  // Keep the FIRST reading per requested page; ignore anything else the model
  // volunteered (a page outside the window, a duplicate entry).
  const wanted = new Set(pages);
  const byPage = new Map<number, PageReading>();
  for (const reading of readings) {
    if (!wanted.has(reading.page) || byPage.has(reading.page)) continue;
    byPage.set(reading.page, reading);
  }
  return [...byPage.values()]
    .sort((a, b) => a.page - b.page)
    .map((r) => readingToPassage(input.sourceId, r));
}
