import { Router } from "express";
import multer from "multer";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { extractFromBuffer, extractFromUrl, isDriveUrl, isQuizletUrl } from "../lib/extract.js";
import { extractYouTubeId, isYouTubeUrl } from "../lib/youtube.js";
import { getCourseRagStats, ingestExtract } from "../lib/rag.js";
import { formatErrorMessage } from "../lib/errors.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

const SOURCES_BUCKET = "sources";

type PdfSourceRow = { id: string; name: string; type: string; storage_path: string | null; status: string };

async function ensureSourcesBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(SOURCES_BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.warn(`[rag] Could not ensure "${SOURCES_BUCKET}" bucket:`, error.message);
  }
}

/** Resolve storage path for a ready PDF — uses DB path or discovers file in bucket. */
async function resolvePdfStoragePath(
  source: PdfSourceRow,
  courseId: string
): Promise<string | null> {
  if (source.storage_path) return source.storage_path;

  const prefix = `${courseId}/${source.id}`;
  const { data: files, error } = await supabaseAdmin.storage.from(SOURCES_BUCKET).list(prefix);
  if (error || !files?.length) return null;

  const file = files.find((f) => f.name && !f.name.endsWith("/"));
  if (!file) return null;

  const path = `${prefix}/${file.name}`;
  await supabaseAdmin.from("sources").update({ storage_path: path }).eq("id", source.id);
  return path;
}

async function findReferencePdfSource(courseId: string): Promise<{ source: PdfSourceRow; storagePath: string } | null> {
  const { data: sources, error } = await supabaseAdmin
    .from("sources")
    .select("id, name, type, storage_path, status")
    .eq("course_id", courseId)
    .eq("type", "PDF")
    .eq("status", "ready")
    .order("created_at", { ascending: true });

  if (error) throw error;

  for (const source of (sources ?? []) as PdfSourceRow[]) {
    const storagePath = await resolvePdfStoragePath(source, courseId);
    if (storagePath) return { source, storagePath };
  }
  return null;
}

router.get("/course/:courseId/status", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const stats = await getCourseRagStats(String(req.params.courseId));
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/course/:courseId/sources", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("*")
    .eq("course_id", req.params.courseId)
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** Primary instructor PDF for the split-screen reference panel. */
router.get("/course/:courseId/reference-pdf", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const found = await findReferencePdfSource(String(req.params.courseId));
    if (!found) {
      return res.status(404).json({
        error: "No reference PDF found for this course. Ask your instructor to re-upload the PDF.",
      });
    }
    const { source, storagePath } = found;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");
    res.json({ sourceId: source.id, url: signed.signedUrl, name: source.name });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

/** Stream reference PDF through API (avoids CORS issues with react-pdf). */
router.get("/course/:courseId/reference-pdf/stream", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const found = await findReferencePdfSource(String(req.params.courseId));
    if (!found) {
      return res.status(404).json({
        error: "No reference PDF found for this course. Ask your instructor to re-upload the PDF.",
      });
    }
    const { source, storagePath } = found;
    const { data, error } = await supabaseAdmin.storage.from(SOURCES_BUCKET).download(storagePath);
    if (error || !data) throw error ?? new Error("Could not download PDF from storage");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${source.name.replace(/"/g, "")}"`);
    res.setHeader("X-Source-Name", source.name);
    res.setHeader("X-Source-Id", source.id);
    const buf = Buffer.from(await data.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

/** Signed URL for viewing an original uploaded file (PDF reference panel). */
router.get("/sources/:sourceId/file-url", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: source, error } = await supabaseAdmin
      .from("sources")
      .select("id, storage_path, name, type, course_id")
      .eq("id", req.params.sourceId)
      .single();
    if (error || !source) return res.status(404).json({ error: "Source not found" });

    const storagePath =
      source.storage_path ??
      (await resolvePdfStoragePath(source as PdfSourceRow, source.course_id));
    if (!storagePath) {
      return res.status(404).json({ error: "No stored file for this source — ask your instructor to re-upload." });
    }
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");
    res.json({ url: signed.signedUrl, name: source.name, type: source.type });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Stream a single source file (PDF) through API. */
router.get("/sources/:sourceId/stream", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: source, error } = await supabaseAdmin
      .from("sources")
      .select("id, storage_path, name, type, course_id")
      .eq("id", req.params.sourceId)
      .single();
    if (error || !source) return res.status(404).json({ error: "Source not found" });

    const storagePath =
      source.storage_path ??
      (source.type === "PDF"
        ? await resolvePdfStoragePath(source as PdfSourceRow, source.course_id)
        : null);
    if (!storagePath) {
      return res.status(404).json({ error: "No stored file for this source" });
    }

    const { data, error: dlErr } = await supabaseAdmin.storage.from(SOURCES_BUCKET).download(storagePath);
    if (dlErr || !data) throw dlErr ?? new Error("Could not download file");

    const mime = source.type === "PDF" ? "application/pdf" : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${source.name.replace(/"/g, "")}"`);
    res.setHeader("X-Source-Name", source.name);
    res.send(Buffer.from(await data.arrayBuffer()));
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

function sourceTypeForFile(mime: string, name: string): string {
  const lower = name.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || lower.endsWith(".docx") || lower.endsWith(".doc")) return "DOCX";
  if (mime.includes("audio") || /\.(mp3|wav|m4a|webm|ogg|flac)$/.test(lower)) return "Audio";
  return "File";
}

router.post("/course/:courseId/sources/upload", requireAuth, upload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const courseId = String(req.params.courseId);
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file" });

    const type = sourceTypeForFile(file.mimetype, file.originalname);
    const { data: source, error } = await supabaseAdmin
      .from("sources")
      .insert({
        course_id: courseId,
        name: file.originalname,
        type,
        status: type === "Audio" ? "transcribing" : "indexing",
        detail: type === "Audio" ? "Transcribing audio…" : "Processing…",
      })
      .select()
      .single();
    if (error) throw error;

    await ensureSourcesBucket();

    // Keep the original file so students can open the actual source
    const storagePath = `${courseId}/${source.id}/${file.originalname.replace(/[^\w.\-() ]+/g, "_")}`;
    const { error: storageErr } = await supabaseAdmin.storage
      .from(SOURCES_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (storageErr) {
      const msg = `Could not store file: ${storageErr.message}`;
      console.error(`[rag] Storage upload failed for ${file.originalname}:`, msg);
      if (type === "PDF") {
        await supabaseAdmin
          .from("sources")
          .update({ status: "error", detail: msg.slice(0, 500) })
          .eq("id", source.id);
        return res.status(500).json({ error: msg });
      }
    } else {
      await supabaseAdmin.from("sources").update({ storage_path: storagePath }).eq("id", source.id);
      source.storage_path = storagePath;
    }

    res.json(source);

    (async () => {
      try {
        const extract = await extractFromBuffer(file.buffer, file.originalname);
        await ingestExtract(courseId, source.id, extract, file.originalname);
      } catch (e) {
        const message = formatErrorMessage(e);
        console.error(`[rag] File ingest failed for ${file.originalname}:`, message);
        await supabaseAdmin
          .from("sources")
          .update({ status: "error", detail: message.slice(0, 500) })
          .eq("id", source.id);
      }
    })();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/course/:courseId/sources/url", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const courseId = String(req.params.courseId);
    const { url, type } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }
    const trimmed = url.trim();
    const isVideo = type === "Video" || isYouTubeUrl(trimmed);
    if (isVideo && !extractYouTubeId(trimmed)) {
      res.status(400).json({
        error: "Invalid YouTube URL — paste a full watch link (youtube.com/watch?v=…) with an 11-character video id.",
      });
      return;
    }
    const videoId = isVideo ? extractYouTubeId(trimmed) : null;
    const displayName =
      videoId ? `YouTube · ${videoId}` : trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
    const resolvedType =
      type ??
      (isVideo ? "Video" : isQuizletUrl(trimmed) ? "Quizlet" : isDriveUrl(trimmed) ? "Drive" : "URL");

    const { data: source, error } = await supabaseAdmin
      .from("sources")
      .insert({
        course_id: courseId,
        name: displayName,
        type: resolvedType,
        url: trimmed,
        status: isVideo ? "transcribing" : "indexing",
        detail: isVideo ? "Fetching captions…" : "Processing…",
      })
      .select()
      .single();
    if (error) throw error;

    res.json(source);

    (async () => {
      try {
        const extract = await extractFromUrl(trimmed);
        await ingestExtract(courseId, source.id, extract, displayName);
      } catch (e) {
        const message = formatErrorMessage(e);
        console.error(`[rag] URL ingest failed for ${displayName}:`, message);
        await supabaseAdmin
          .from("sources")
          .update({ status: "error", detail: message.slice(0, 500) })
          .eq("id", source.id);
      }
    })();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/course/:courseId/sources/register", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { name, type } = req.body;
    const { data, error } = await supabaseAdmin
      .from("sources")
      .insert({
        course_id: req.params.courseId,
        name,
        type,
        status: "indexing",
        detail: "Awaiting content…",
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/sources/:sourceId", requireAuth, async (req, res) => {
  const { data: source } = await supabaseAdmin
    .from("sources")
    .select("storage_path")
    .eq("id", req.params.sourceId)
    .maybeSingle();
  if (source?.storage_path) {
    await supabaseAdmin.storage.from(SOURCES_BUCKET).remove([source.storage_path]);
  }
  const { error } = await supabaseAdmin.from("sources").delete().eq("id", req.params.sourceId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
