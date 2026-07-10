import { chunkSegments, type ProvenancedChunk } from "./chunking.js";
import type { ExtractResult } from "./extract.js";
import { formatErrorMessage } from "./errors.js";
import { embedTexts, embedQuery } from "./voyage.js";
import { supabaseAdmin } from "./supabase.js";
import { claudeJSON } from "./anthropic.js";

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
    chunk_type: "explanation" as const,
  }));

  const INSERT_BATCH = 40;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabaseAdmin.from("document_chunks").insert(batch);
    if (error) {
      const msg = formatErrorMessage(error);
      // Migration 002 adds page/time columns — fall back for older schemas.
      if (error.code === "PGRST204" && /page_|time_|chunk_type|concept_ids|skill_ids/.test(msg)) {
        const legacy = batch.map(({ page_start, page_end, time_start, time_end, chunk_type, concept_ids, skill_ids, ...rest }) => rest);
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

  // Best-effort concept tagging (LR7). No-op if the course has no concepts yet
  // (pre-publish) — the publish step and the manual backfill route cover that.
  autoTagCourseChunks(courseId).catch((e) =>
    console.warn(`[rag] post-ingest auto-tag skipped: ${formatErrorMessage(e)}`)
  );
}

export type RagChunkType =
  | "rule"
  | "example"
  | "explanation"
  | "misconception"
  | "hint_template"
  | "drill_prompt";

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
  conceptIds?: string[];
  skillIds?: string[];
  chunkType?: RagChunkType;
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

export function mergeChunksById(lists: RagChunk[][], max: number): RagChunk[] {
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

// ---------------------------------------------------------------------------
// M4 · Workstream A (LR1) — Coach-facing retrieval.
// Serves the Generalizable Coach's RetrievalRequest contract and returns
// chunks in its KnowledgeChunk shape. The Coach owns WHEN/WHAT to retrieve;
// this platform owns the content, embeddings, and vector store.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// M4 · Workstream B (LR7) — tag chunks with concept ids.
// Retrieval + progressive disclosure key off concept_ids, so every chunk should
// carry the course's concept ids. Ingest often runs before a course is
// published (concepts are created at publish), so tagging is (a) attempted
// best-effort after ingest and (b) run over the whole course at publish and via
// a manual backfill route. Safe default chunk_type "explanation" stays; a chunk
// is never left silently un-retrievable.
// ---------------------------------------------------------------------------

const TAG_BATCH = 20;

/**
 * Assign each still-untagged chunk in a course the concept ids it teaches,
 * chosen from that course's concept list (LLM-assisted, validated against the
 * real id set — never invents ids). Idempotent: only touches empty concept_ids.
 */
export async function autoTagCourseChunks(courseId: string): Promise<{ tagged: number; skipped: string }> {
  const { data: concepts } = await supabaseAdmin
    .from("concepts")
    .select("id, name, subtitle")
    .eq("course_id", courseId);
  if (!concepts?.length) return { tagged: 0, skipped: "no concepts yet (tag after publish)" };

  const { data: chunks, error } = await supabaseAdmin
    .from("document_chunks")
    .select("id, content, concept_ids")
    .eq("course_id", courseId);
  if (error) throw new Error(formatErrorMessage(error));

  const untagged = (chunks ?? []).filter((c) => !((c.concept_ids as string[] | null)?.length));
  if (!untagged.length) return { tagged: 0, skipped: "all chunks already tagged" };

  const validIds = new Set(concepts.map((c) => c.id as string));
  const conceptList = concepts.map((c) => `- ${c.id}: ${c.name}${c.subtitle ? ` (${c.subtitle})` : ""}`).join("\n");

  let tagged = 0;
  for (let i = 0; i < untagged.length; i += TAG_BATCH) {
    const batch = untagged.slice(i, i + TAG_BATCH);
    const system =
      `You tag course source excerpts with the concept ids they teach. ` +
      `Only use ids from this list; never invent one. A chunk may match 0-3 concepts.\n\nConcepts:\n${conceptList}\n\n` +
      `Return JSON: { "tags": [ { "id": "<chunkId>", "conceptIds": ["<conceptId>", ...] } ] }`;
    const user = batch
      .map((c) => `Chunk ${c.id}:\n${String(c.content).slice(0, 700)}`)
      .join("\n\n---\n\n");

    let result: { tags?: { id: string; conceptIds?: string[] }[] };
    try {
      result = await claudeJSON<{ tags?: { id: string; conceptIds?: string[] }[] }>(system, user, 2048);
    } catch (e) {
      console.warn(`[rag] auto-tag batch failed for course ${courseId}: ${formatErrorMessage(e)}`);
      continue;
    }

    for (const t of result.tags ?? []) {
      const valid = (t.conceptIds ?? []).filter((id) => validIds.has(id));
      const { error: upErr } = await supabaseAdmin
        .from("document_chunks")
        .update({ concept_ids: valid })
        .eq("id", t.id)
        .eq("course_id", courseId);
      if (!upErr) tagged++;
    }
  }
  console.info(`[rag] auto-tagged ${tagged}/${untagged.length} chunk(s) for course ${courseId.slice(0, 8)}…`);
  return { tagged, skipped: "" };
}

/** KnowledgeChunk contract version this endpoint emits (Coach rejects unknown majors). */
export const COACH_CONTRACT_SCHEMA_VERSION = "1.0.0";

/** The Coach's RetrievalRequest, narrowed to what this platform serves in M4. */
export interface CoachRetrievalRequest {
  /** Owlwise course to retrieve from. Carried as knowledgeScopeId in the contract. */
  courseId: string;
  text?: string;
  conceptIds?: string[];
  skillIds?: string[];
  chunkType?: string;
  topK?: number;
  allowedSourceIds?: string[];
  forbiddenConceptIds?: string[];
}

/** A chunk in the Coach's KnowledgeChunk shape (contracts/schemas/KnowledgeChunk). */
export interface CoachKnowledgeChunk {
  schemaVersion: string;
  id: string;
  content: string;
  conceptIds: string[];
  skillIds: string[];
  chunkType: RagChunkType;
  citation?: string;
  pageStart?: number;
  pageEnd?: number;
  timeStart?: number;
  timeEnd?: number;
  scopeId?: string;
  score?: number;
}

type CoachChunkRow = {
  id: string;
  content: string;
  citation?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  time_start?: number | null;
  time_end?: number | null;
  concept_ids?: string[] | null;
  skill_ids?: string[] | null;
  chunk_type?: string | null;
  similarity?: number | null;
};

function coachChunkFromRow(row: CoachChunkRow, courseId: string): CoachKnowledgeChunk {
  const chunk: CoachKnowledgeChunk = {
    schemaVersion: COACH_CONTRACT_SCHEMA_VERSION,
    id: row.id,
    content: row.content,
    conceptIds: row.concept_ids ?? [],
    skillIds: row.skill_ids ?? [],
    // Required-tag rule: never emit a chunk without a chunkType.
    chunkType: (row.chunk_type as RagChunkType) ?? "explanation",
    scopeId: courseId,
  };
  if (row.citation != null) chunk.citation = row.citation;
  if (row.page_start != null) chunk.pageStart = row.page_start;
  if (row.page_end != null) chunk.pageEnd = row.page_end;
  if (row.time_start != null) chunk.timeStart = row.time_start;
  if (row.time_end != null) chunk.timeEnd = row.time_end;
  if (row.similarity != null) chunk.score = row.similarity;
  return chunk;
}

/**
 * Serve the Coach a scoped, source-bound chunk set. Semantic path when `text`
 * is given (embed → filtered match_chunks); tag-only path otherwise (direct
 * filtered read, no vector ranking) so a pure conceptIds/skillIds query still
 * returns material.
 */
export async function retrieveForCoach(req: CoachRetrievalRequest): Promise<CoachKnowledgeChunk[]> {
  const topK = req.topK ?? 6;
  const conceptIds = req.conceptIds?.length ? req.conceptIds : null;
  const skillIds = req.skillIds?.length ? req.skillIds : null;
  const sourceIds = req.allowedSourceIds?.length ? req.allowedSourceIds : null;
  const forbidden = req.forbiddenConceptIds?.length ? req.forbiddenConceptIds : null;

  if (req.text?.trim()) {
    const embedding = await embedQuery(req.text.trim());
    const { data, error } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: embedding,
      match_course_id: req.courseId,
      match_count: topK,
      filter_chunk_type: req.chunkType ?? null,
      filter_concept_ids: conceptIds,
      filter_skill_ids: skillIds,
      filter_source_ids: sourceIds,
      forbid_concept_ids: forbidden,
    });
    if (error) throw new Error(formatErrorMessage(error));
    return ((data ?? []) as CoachChunkRow[]).map((r) => coachChunkFromRow(r, req.courseId));
  }

  // Tag-only query: no semantic ranking available, filter directly.
  let q = supabaseAdmin
    .from("document_chunks")
    .select("id, content, citation, page_start, page_end, time_start, time_end, concept_ids, skill_ids, chunk_type")
    .eq("course_id", req.courseId);
  if (req.chunkType) q = q.eq("chunk_type", req.chunkType);
  if (conceptIds) q = q.overlaps("concept_ids", conceptIds);
  if (skillIds) q = q.overlaps("skill_ids", skillIds);
  if (sourceIds) q = q.in("source_id", sourceIds);

  const { data, error } = await q.order("chunk_index").limit(topK * 3);
  if (error) throw new Error(formatErrorMessage(error));
  let rows = (data ?? []) as CoachChunkRow[];
  if (forbidden) {
    const forbid = new Set(forbidden);
    rows = rows.filter((r) => !(r.concept_ids ?? []).some((c) => forbid.has(c)));
  }
  return rows.slice(0, topK).map((r) => coachChunkFromRow(r, req.courseId));
}
