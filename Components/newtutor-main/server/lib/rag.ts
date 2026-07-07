import { chunkSegments, type ProvenancedChunk } from "./chunking.js";
import type { ExtractResult } from "./extract.js";
import { formatErrorMessage } from "./errors.js";
import { embedTexts, embedQuery } from "./voyage.js";
import { supabaseAdmin } from "./supabase.js";

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function chunkCitation(prefix: string, chunk: ProvenancedChunk, index: number): string {
  if (chunk.pageStart !== undefined) {
    return chunk.pageStart === chunk.pageEnd
      ? `${prefix} · p. ${chunk.pageStart}`
      : `${prefix} · pp. ${chunk.pageStart}–${chunk.pageEnd}`;
  }
  if (chunk.timeStart !== undefined && (chunk.timeEnd ?? 0) > 0) {
    return `${prefix} · ${fmtTime(chunk.timeStart)}–${fmtTime(chunk.timeEnd ?? chunk.timeStart)}`;
  }
  return `${prefix} · chunk ${index + 1}`;
}

export async function ingestExtract(
  courseId: string,
  sourceId: string,
  extract: ExtractResult,
  citationPrefix: string
) {
  const chunks = chunkSegments(extract.segments);
  if (!chunks.length) {
    await supabaseAdmin
      .from("sources")
      .update({
        status: "error",
        detail: "No extractable text — PDF may be scanned/image-only or file is empty",
      })
      .eq("id", sourceId);
    return;
  }

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  const rows = chunks.map((chunk, i) => ({
    course_id: courseId,
    source_id: sourceId,
    content: chunk.content,
    citation: chunkCitation(citationPrefix, chunk, i),
    embedding: embeddings[i],
    chunk_index: i,
    page_start: chunk.pageStart ?? null,
    page_end: chunk.pageEnd ?? null,
    time_start: chunk.timeStart ?? null,
    time_end: chunk.timeEnd ?? null,
  }));

  const INSERT_BATCH = 40;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabaseAdmin.from("document_chunks").insert(batch);
    if (error) {
      const msg = formatErrorMessage(error);
      // Migration 002 adds page/time columns — fall back for older schemas.
      if (error.code === "PGRST204" && /page_|time_/.test(msg)) {
        const legacy = batch.map(({ page_start, page_end, time_start, time_end, ...rest }) => rest);
        const { error: legacyErr } = await supabaseAdmin.from("document_chunks").insert(legacy);
        if (legacyErr) throw new Error(formatErrorMessage(legacyErr));
      } else {
        throw new Error(msg);
      }
    }
  }

  await supabaseAdmin
    .from("sources")
    .update({ status: "ready", detail: `${chunks.length} chunks indexed` })
    .eq("id", sourceId);
}

export interface RagChunk {
  id: string;
  content: string;
  citation: string;
  similarity: number;
  source_id?: string;
  page_start?: number | null;
  page_end?: number | null;
  time_start?: number | null;
  time_end?: number | null;
}

export async function getCourseRagStats(courseId: string) {
  const { count, error: countErr } = await supabaseAdmin
    .from("document_chunks")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);
  if (countErr) throw countErr;

  const { data: sources, error: srcErr } = await supabaseAdmin
    .from("sources")
    .select("id, status")
    .eq("course_id", courseId);
  if (srcErr) throw srcErr;

  const list = sources ?? [];
  return {
    chunkCount: count ?? 0,
    sourceCount: list.length,
    readyCount: list.filter((s) => s.status === "ready").length,
    indexingCount: list.filter((s) => s.status === "indexing" || s.status === "transcribing").length,
    errorCount: list.filter((s) => s.status === "error").length,
  };
}

export async function retrieveChunks(courseId: string, query: string, count = 6): Promise<RagChunk[]> {
  try {
    const embedding = await embedQuery(query);
    const { data, error } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: embedding,
      match_course_id: courseId,
      match_count: count,
    });
    if (error) throw error;
    const chunks = (data ?? []) as RagChunk[];
    if (chunks.length) {
      const top = chunks[0]?.similarity?.toFixed(3) ?? "?";
      console.info(
        `[rag] Retrieved ${chunks.length} chunk(s) for course ${courseId.slice(0, 8)}… (top similarity ${top})`
      );
    } else {
      console.warn(`[rag] No chunks matched for course ${courseId} — query: ${query.slice(0, 80)}`);
    }
    return chunks;
  } catch (e) {
    const msg = formatErrorMessage(e);
    if (/page_start|page_end|time_start|time_end|does not exist/i.test(msg)) {
      console.warn("[rag] match_chunks unavailable (run migration 002) — using all-chunks fallback");
      return (await retrieveAllCourseChunks(courseId)).slice(0, count);
    }
    throw new Error(msg);
  }
}

/** Return all indexed chunks for a course (ordered). Used when the corpus is small. */
export async function retrieveAllCourseChunks(courseId: string): Promise<RagChunk[]> {
  const full = await supabaseAdmin
    .from("document_chunks")
    .select("id, source_id, content, citation, page_start, page_end, time_start, time_end")
    .eq("course_id", courseId)
    .order("chunk_index");

  if (!full.error) {
    return (full.data ?? []).map((c) => ({ ...c, similarity: 1 }));
  }

  const msg = formatErrorMessage(full.error);
  if (/page_start|page_end|time_start|time_end|does not exist/i.test(msg)) {
    const { data, error } = await supabaseAdmin
      .from("document_chunks")
      .select("id, source_id, content, citation")
      .eq("course_id", courseId)
      .order("chunk_index");
    if (error) throw new Error(formatErrorMessage(error));
    return (data ?? []).map((c) => ({ ...c, similarity: 1 }));
  }

  throw new Error(msg);
}

function mergeChunksById(lists: RagChunk[][], max: number): RagChunk[] {
  const seen = new Set<string>();
  const merged: RagChunk[] = [];
  for (const list of lists) {
    for (const chunk of list) {
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      merged.push(chunk);
    }
  }
  merged.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return merged.slice(0, max);
}

const SMALL_CORPUS_CHUNK_LIMIT = 15;

/** Retrieve source context for a lesson — uses all material when the upload corpus is small. */
export async function retrieveContextForLesson(
  courseId: string,
  moduleName: string,
  opts?: { chapter?: string; subtitle?: string; count?: number }
): Promise<RagChunk[]> {
  const count = opts?.count ?? 10;
  const stats = await getCourseRagStats(courseId);
  if (!stats.chunkCount) return [];

  if (stats.chunkCount <= SMALL_CORPUS_CHUNK_LIMIT) {
    const all = await retrieveAllCourseChunks(courseId);
    console.info(
      `[rag] Using all ${all.length} chunk(s) for "${moduleName}" (small source corpus)`
    );
    return all.slice(0, count);
  }

  const focusQuery = [moduleName, opts?.chapter, opts?.subtitle].filter(Boolean).join(" ");
  const focused = await retrieveChunks(courseId, `${focusQuery} lesson teaching`, Math.ceil(count * 0.65));
  const broad = await retrieveChunks(
    courseId,
    `instructor source material themes content ${moduleName}`,
    Math.ceil(count * 0.65)
  );
  return mergeChunksById([focused, broad], count);
}

/** Retrieve source context for course drafting from any uploaded material. */
export async function retrieveContextForDraft(
  courseId: string,
  instructorPrompt: string,
  count = 12
): Promise<RagChunk[]> {
  const stats = await getCourseRagStats(courseId);
  if (!stats.chunkCount) return [];

  if (stats.chunkCount <= SMALL_CORPUS_CHUNK_LIMIT) {
    return (await retrieveAllCourseChunks(courseId)).slice(0, count);
  }

  const query = instructorPrompt.trim()
    ? `${instructorPrompt} course structure outline chapters modules key topics`
    : "main topics themes concepts arguments course outline from uploaded instructor materials";
  return retrieveChunks(courseId, query, count);
}

export function formatRetrievedContext(
  chunks: { content: string; citation: string }[]
): string {
  if (!chunks.length) return "No retrieved sources.";
  return chunks
    .map((c, i) => `[${i + 1}] (${c.citation})\n${c.content}`)
    .join("\n\n");
}
