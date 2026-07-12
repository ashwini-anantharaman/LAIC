/**
 * Zone 1 — Platform core: the online, HTTP-backed KnowledgeSource (LAIC §11.3,
 * M4/D2). The "Platform mode" adapter — the same KnowledgeSource port the Coach
 * depends on, but backed by the Learning Platform's `/retrieve` endpoint instead
 * of an in-process bundle. The Coach still decides WHEN/WHAT to retrieve; the
 * platform owns the content, embeddings, and vector store.
 *
 * Bound to a single knowledge scope (an Owlwise course) at construction. Cross-
 * course retrieval is a separate MultiScopeKnowledgeSource composite, gated off
 * by policy in M4.
 *
 * Contract: sends the Coach's RetrievalRequest; expects `{ chunks: KnowledgeChunk[] }`.
 * Rejects chunks carrying an unrecognized major schemaVersion rather than guessing.
 */
import type { KnowledgeChunk } from "../../contracts/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";
import type { KnowledgeQuery, KnowledgeSource } from "./KnowledgeSource.js";

export interface PlatformKnowledgeSourceOptions {
  /** Base URL of the Learning Platform, e.g. "http://localhost:3001". */
  endpoint: string;
  /** The bound knowledge scope — an Owlwise course id (sent as knowledgeScopeId). */
  scopeId: string;
  /** Domain this source serves. Defaults to "course_learning". */
  domainId?: string;
  /** Bearer token: the Coach service token, or a learner token. */
  authToken?: string;
  /** Injectable fetch (tests supply a mock; defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** KnowledgeScope guardrails applied to every query. */
  allowedSourceIds?: string[];
  forbiddenConceptIds?: string[];
}

interface RetrieveResponse {
  chunks?: unknown;
}

/** Major-version component of a semver-ish string ("1.2.3" -> "1"). */
function majorOf(version: string): string {
  return String(version).split(".")[0];
}

const EXPECTED_MAJOR = majorOf(CONTRACTS_SCHEMA_VERSION);

export class PlatformKnowledgeSource implements KnowledgeSource {
  readonly domainId: string;
  readonly scopeId: string;
  private readonly endpoint: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly allowedSourceIds?: string[];
  private readonly forbiddenConceptIds?: string[];

  constructor(opts: PlatformKnowledgeSourceOptions) {
    if (!opts.endpoint) throw new Error("PlatformKnowledgeSource requires an endpoint.");
    if (!opts.scopeId) throw new Error("PlatformKnowledgeSource requires a scopeId (course id).");
    this.endpoint = opts.endpoint.replace(/\/+$/, "");
    this.scopeId = opts.scopeId;
    this.domainId = opts.domainId ?? "course_learning";
    this.authToken = opts.authToken;
    const f = opts.fetchImpl ?? globalThis.fetch;
    if (!f) throw new Error("PlatformKnowledgeSource requires a fetch implementation.");
    this.fetchImpl = f;
    this.allowedSourceIds = opts.allowedSourceIds;
    this.forbiddenConceptIds = opts.forbiddenConceptIds;
  }

  async retrieve(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    const body = {
      domainId: this.domainId,
      knowledgeScopeId: this.scopeId,
      text: query.text,
      conceptIds: query.conceptIds,
      skillIds: query.skillIds,
      chunkType: query.chunkType,
      topK: query.topK,
      allowedSourceIds: this.allowedSourceIds,
      forbiddenConceptIds: this.forbiddenConceptIds,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;

    const res = await this.fetchImpl(`${this.endpoint}/api/rag/retrieve`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`PlatformKnowledgeSource /retrieve failed: ${res.status} ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as RetrieveResponse;
    const raw = Array.isArray(json.chunks) ? json.chunks : [];
    return raw.map((c) => this.toChunk(c));
  }

  /** Validate the wire object into a KnowledgeChunk; reject unknown major versions. */
  private toChunk(raw: unknown): KnowledgeChunk {
    const c = raw as Partial<KnowledgeChunk>;
    if (!c || typeof c !== "object" || typeof c.id !== "string" || typeof c.content !== "string") {
      throw new Error("PlatformKnowledgeSource: malformed chunk (missing id/content).");
    }
    if (typeof c.schemaVersion !== "string") {
      throw new Error(`PlatformKnowledgeSource: chunk ${c.id} missing schemaVersion.`);
    }
    if (majorOf(c.schemaVersion) !== EXPECTED_MAJOR) {
      throw new Error(
        `PlatformKnowledgeSource: chunk ${c.id} has unsupported schemaVersion ${c.schemaVersion} ` +
          `(expected major ${EXPECTED_MAJOR}).`,
      );
    }
    // Trust the platform's shape but enforce the required-tag rule defensively.
    const chunk: KnowledgeChunk = {
      schemaVersion: c.schemaVersion,
      id: c.id,
      content: c.content,
      conceptIds: c.conceptIds ?? [],
      skillIds: c.skillIds ?? [],
      chunkType: c.chunkType ?? "explanation",
    };
    if (c.difficulty !== undefined) chunk.difficulty = c.difficulty;
    if (c.scopeId !== undefined) chunk.scopeId = c.scopeId;
    if (c.citation !== undefined) chunk.citation = c.citation;
    if (c.pageStart !== undefined) chunk.pageStart = c.pageStart;
    if (c.pageEnd !== undefined) chunk.pageEnd = c.pageEnd;
    if (c.timeStart !== undefined) chunk.timeStart = c.timeStart;
    if (c.timeEnd !== undefined) chunk.timeEnd = c.timeEnd;
    if (c.score !== undefined) chunk.score = c.score;
    return chunk;
  }
}
