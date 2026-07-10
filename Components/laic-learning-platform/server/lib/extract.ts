import { createRequire } from "module";
import mammoth from "mammoth";
import * as cheerio from "cheerio";
import { fetchYouTubeTranscriptSegments, isYouTubeUrl } from "./youtube.js";
import { config } from "./config.js";

const require = createRequire(import.meta.url);

/**
 * One piece of extracted source text with provenance:
 * `page` for PDFs, `timeStart`/`timeEnd` (seconds) for transcripts.
 */
export interface ExtractedSegment {
  text: string;
  page?: number;
  timeStart?: number;
  timeEnd?: number;
}

export interface ExtractResult {
  segments: ExtractedSegment[];
  kind: "pages" | "transcript" | "text";
}

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".webm", ".ogg", ".mpga", ".mpeg", ".flac"];

function plainText(text: string): ExtractResult {
  return { segments: [{ text }], kind: "text" };
}

async function extractPdfPages(buffer: Buffer): Promise<ExtractResult> {
  const pdfParse = require("pdf-parse") as (
    b: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ text: string }>;

  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: {
      getTextContent: () => Promise<{ items: { str: string }[] }>;
    }) => {
      const tc = await pageData.getTextContent();
      const text = tc.items.map((i) => i.str).join(" ");
      pages.push(text);
      return text;
    },
  });

  const segments = pages
    .map((text, i) => ({ text: text.trim(), page: i + 1 }))
    .filter((s) => s.text.length > 0);
  return { segments, kind: "pages" };
}

/** Transcribe an audio upload with OpenAI Whisper, keeping segment timestamps. */
async function transcribeAudio(buffer: Buffer, filename: string): Promise<ExtractResult> {
  if (!config.openaiApiKey) {
    throw new Error(
      "Audio transcription requires OPENAI_API_KEY (Whisper). Add it to .env, or upload your notes as text/PDF instead."
    );
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper transcription failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    text?: string;
    segments?: { start: number; end: number; text: string }[];
  };

  if (json.segments?.length) {
    return {
      segments: json.segments.map((s) => ({
        text: s.text.trim(),
        timeStart: Math.floor(s.start),
        timeEnd: Math.ceil(s.end),
      })),
      kind: "transcript",
    };
  }
  if (json.text?.trim()) return plainText(json.text.trim());
  throw new Error("Whisper returned an empty transcript — the audio may be silent or unsupported.");
}

export async function extractFromBuffer(
  buffer: Buffer,
  mimeOrExt: string
): Promise<ExtractResult> {
  const ext = mimeOrExt.toLowerCase();
  if (ext.includes("pdf") || ext.endsWith(".pdf")) {
    return extractPdfPages(buffer);
  }
  if (AUDIO_EXTENSIONS.some((a) => ext.endsWith(a)) || ext.includes("audio")) {
    return transcribeAudio(buffer, mimeOrExt);
  }
  if (ext.includes("docx") || ext.endsWith(".docx") || ext.includes("word")) {
    const result = await mammoth.extractRawText({ buffer });
    return plainText(result.value);
  }
  return plainText(buffer.toString("utf-8"));
}

// ── Google Drive ──────────────────────────────────────────────────────────────

/** Convert a Drive/Docs share link into a direct-download / export URL. */
function driveDirectUrl(url: string): string | null {
  const file = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (file) return `https://drive.google.com/uc?export=download&id=${file[1]}`;
  const openId = url.match(/drive\.google\.com\/(?:open|uc)\?[^#]*id=([\w-]+)/);
  if (openId) return `https://drive.google.com/uc?export=download&id=${openId[1]}`;
  const doc = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  if (doc) return `https://docs.google.com/document/d/${doc[1]}/export?format=txt`;
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (sheet) return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv`;
  const slides = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/);
  if (slides) return `https://docs.google.com/presentation/d/${slides[1]}/export/txt`;
  return null;
}

export function isDriveUrl(url: string): boolean {
  return /(?:drive|docs)\.google\.com/.test(url);
}

async function extractFromDrive(url: string): Promise<ExtractResult> {
  const direct = driveDirectUrl(url);
  if (!direct) {
    throw new Error(
      "Unrecognized Google Drive link — share the file itself (drive.google.com/file/d/… or docs.google.com/document/d/…)."
    );
  }
  const res = await fetch(direct, {
    headers: { "User-Agent": "Mozilla/5.0 (LAIC-Bot)" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok || contentType.includes("text/html")) {
    const body = contentType.includes("text/html") ? await res.text() : "";
    if (!res.ok || /accounts\.google\.com|Sign in|need access|virus scan/i.test(body)) {
      throw new Error(
        'Google Drive blocked the download — set the file to "Anyone with the link can view" and try again.'
      );
    }
    // Drive sometimes serves an interstitial page for large files
    const $ = cheerio.load(body);
    const confirm = $("form#download-form").attr("action");
    if (confirm) {
      return extractFromDrive(confirm);
    }
    throw new Error("Google Drive returned a web page instead of the file — check sharing settings.");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (contentType.includes("pdf")) return extractPdfPages(buffer);
  if (contentType.includes("word") || contentType.includes("officedocument")) {
    const result = await mammoth.extractRawText({ buffer });
    return plainText(result.value);
  }
  if (contentType.includes("audio")) return transcribeAudio(buffer, "drive-audio.mp3");
  return plainText(buffer.toString("utf-8"));
}

// ── Quizlet ───────────────────────────────────────────────────────────────────

export function isQuizletUrl(url: string): boolean {
  return /quizlet\.com/.test(url);
}

function findQuizletTerms(node: unknown, out: { word: string; definition: string }[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) findQuizletTerms(item, out);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (typeof rec.word === "string" && typeof rec.definition === "string" && rec.word.trim()) {
    out.push({ word: rec.word.trim(), definition: String(rec.definition).trim() });
  }
  for (const value of Object.values(rec)) findQuizletTerms(value, out);
}

async function extractFromQuizlet(url: string): Promise<ExtractResult> {
  const quizletHelp =
    "Quizlet blocks most automated access. Open the set → ⋯ menu → Export → copy the text, then paste it into a .txt file and upload it as Notes.";
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new Error(`Could not fetch the Quizlet set (${e instanceof Error ? e.message : e}). ${quizletHelp}`);
  }

  const $ = cheerio.load(html);
  const terms: { word: string; definition: string }[] = [];
  const nextData = $("script#__NEXT_DATA__").html();
  if (nextData) {
    try {
      findQuizletTerms(JSON.parse(nextData), terms);
    } catch {
      /* fall through to DOM scrape */
    }
  }
  if (!terms.length) {
    $("span.TermText").each((i, el) => {
      const text = $(el).text().trim();
      if (i % 2 === 0) terms.push({ word: text, definition: "" });
      else if (terms[terms.length - 1]) terms[terms.length - 1].definition = text;
    });
  }

  const seen = new Set<string>();
  const unique = terms.filter((t) => {
    const key = `${t.word}::${t.definition}`;
    if (seen.has(key) || !t.definition) return false;
    seen.add(key);
    return true;
  });

  if (!unique.length) {
    throw new Error(`No terms found on that Quizlet page. ${quizletHelp}`);
  }
  const text = unique.map((t) => `${t.word}: ${t.definition}`).join("\n");
  return plainText(text);
}

// ── URL dispatch ──────────────────────────────────────────────────────────────

export async function extractFromUrl(url: string): Promise<ExtractResult> {
  if (isYouTubeUrl(url)) {
    const segments = await fetchYouTubeTranscriptSegments(url);
    return { segments, kind: "transcript" };
  }
  if (isDriveUrl(url)) return extractFromDrive(url);
  if (isQuizletUrl(url)) return extractFromQuizlet(url);

  const res = await fetch(url, {
    headers: { "User-Agent": "LAIC-Bot/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("pdf")) {
    return extractPdfPages(Buffer.from(await res.arrayBuffer()));
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  return plainText($("body").text().replace(/\s+/g, " ").trim());
}
