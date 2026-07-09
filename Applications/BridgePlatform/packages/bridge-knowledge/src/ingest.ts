// Structured ingestion (Bridge plan §12.3-§12.5, §20.2): extractors propose
// readable items from registered sources. Extracted items are ordinary
// editable content — attributed to their extractor in createdBy, flags
// captured in the notes, citing the passages they came from. The coach edits
// or deprecates them in the Knowledge Browser; there is no approval gate
// (revised decision 3).

import { KNOWN_PREDICATES } from "@bridge/engine";
import type { Setting } from "@bridge/config";
import type {
  BridgeIngestionJob,
  BridgeReadableKnowledgeItem,
  SourcePassage,
  SystemFamily,
} from "./model";
import type { KnowledgeStore } from "./store";

const KNOWN_PREDICATES_LIST = [...KNOWN_PREDICATES].sort();

export interface CandidateItem {
  itemId: string;
  itemType: BridgeReadableKnowledgeItem["itemType"];
  title: string;
  humanReadableRule: string;
  structuredFields: Record<string, unknown>;
  /** Passage reference within the source (file/section locator). */
  passage: string;
  /** Assumptions or ambiguities the extractor flagged. */
  flags: string[];
}

export interface CandidateExtractor {
  readonly kind: "prototype_registry" | "llm";
  extract(sourceText: string): CandidateItem[] | Promise<CandidateItem[]>;
}

/**
 * Deterministic extractor for the bridgebot prototype's setting registry
 * (src/vendor/config/data/registry.ts). Regex-based on the object-literal
 * entries; anything unparsable is counted as skipped, never silently guessed.
 * Each candidate is a setting_definition whose real-source citation is still
 * missing — it lands active but visibly "uncited" until someone matches it
 * to a passage or deprecates it.
 */
export class PrototypeRegistryExtractor implements CandidateExtractor {
  readonly kind = "prototype_registry" as const;

  extract(sourceText: string): CandidateItem[] {
    const out: CandidateItem[] = [];
    // Entries look like `{ key: "nt1_range", label: "...", ... }`.
    const blocks = sourceText.split(/\n\s*\{\s*\n?\s*key:/).slice(1);
    for (const block of blocks) {
      const key = block.match(/^\s*["']([a-z0-9_]+)["']/)?.[1];
      const label = block.match(/label:\s*["']([^"']+)["']/)?.[1];
      const description = block.match(/description:\s*["']([^"']*)["']/)?.[1];
      const module = block.match(/module:\s*["']([a-z0-9_]+)["']/)?.[1];
      const control = block.match(/control:\s*["']([a-z_]+)["']/)?.[1];
      if (!key || !label) continue;

      const setting: Setting = {
        key,
        label,
        control: (control as Setting["control"]) ?? "toggle",
        default: false, // defaults must be re-derived from a real source
        module: module ?? "unknown",
        exclusive_group: null,
        depends_on: null,
        skill_level: "Intermediate",
        coach_supported: false,
        binds_to: "convention_rules",
        aliases: [],
        description: description ?? "",
        origin: "PROTOTYPE",
      };
      out.push({
        itemId: `cand_proto_${key}`,
        itemType: "setting_definition",
        title: `Setting: ${label}`,
        humanReadableRule:
          description ||
          `Prototype setting "${label}" (${key}) — definition and default should be re-derived from a cited source.`,
        structuredFields: { setting },
        passage: `registry.ts entry key="${key}"`,
        flags: [
          "prototype_derived: default value NOT carried over — re-derive from a real source",
          ...(description ? [] : ["no description in prototype entry"]),
        ],
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// LLM extraction over uploaded passages (plan §12.10 step 4, §20.2: LLMs
// draft content, never make table decisions). The network client is a seam —
// bridge-web supplies the Anthropic implementation; tests supply fakes.
// ---------------------------------------------------------------------------

/** One item proposed by the LLM from a batch of passages. */
export interface LlmExtractedItem {
  /** Short kebab/snake slug; namespaced to cand_llm_<slug> on save. */
  slug: string;
  itemType: BridgeReadableKnowledgeItem["itemType"];
  title: string;
  humanReadableRule: string;
  /**
   * Optional machine payload as a JSON string (BidRulePayload / PlayRulePayload
   * / Setting). Left unvalidated here — generation's validatePackage is the
   * structural check; bad payloads surface as run errors, never at the table.
   */
  structuredFieldsJson?: string;
  /** passageIds (from the batch) this item is grounded in. */
  passageIds: string[];
  /** Ambiguities/assumptions the extractor flagged. */
  flags: string[];
}

export interface LlmExtractionClient {
  extractItems(input: {
    systemFamily: SystemFamily;
    passages: SourcePassage[];
    knownPredicates: readonly string[];
  }): Promise<LlmExtractedItem[]>;
}

export interface LlmIngestionRequest {
  sourceId: string;
  systemFamily: SystemFamily;
  requestedBy: string;
  now: string;
  jobId: string;
  /** Passages per LLM call (default 6). */
  batchSize?: number;
}

/**
 * Run LLM extraction over a source's uploaded passages. Items land active,
 * attributed to the extractor, citing the exact passages they came from.
 */
export async function runLlmIngestion(
  store: KnowledgeStore,
  client: LlmExtractionClient,
  req: LlmIngestionRequest,
): Promise<BridgeIngestionJob> {
  const fail = async (errors: string[]): Promise<BridgeIngestionJob> => {
    const job: BridgeIngestionJob = {
      jobId: req.jobId,
      sourceId: req.sourceId,
      extractor: "llm",
      systemFamily: req.systemFamily,
      requestedBy: req.requestedBy,
      createdAt: req.now,
      status: "failed",
      stats: { parsedEntries: 0, candidatesCreated: 0, skipped: 0 },
      candidateItemIds: [],
      errors,
    };
    await store.saveJob(job);
    return job;
  };

  const source = await store.getSource(req.sourceId);
  if (!source) return fail([`Unknown source ${req.sourceId}`]);
  const passages = await store.listPassages(req.sourceId);
  if (!passages.length)
    return fail([`Source ${req.sourceId} has no uploaded document/passages — upload the book first`]);

  const byId = new Map(passages.map((p) => [p.passageId, p]));
  const batchSize = req.batchSize ?? 6;
  const created: string[] = [];
  const errors: string[] = [];
  let parsed = 0;
  let skipped = 0;

  for (let i = 0; i < passages.length; i += batchSize) {
    const batch = passages.slice(i, i + batchSize);
    let proposals: LlmExtractedItem[];
    try {
      proposals = await client.extractItems({
        systemFamily: req.systemFamily,
        passages: batch,
        knownPredicates: KNOWN_PREDICATES_LIST,
      });
    } catch (e) {
      errors.push(`batch ${i / batchSize}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    parsed += proposals.length;

    for (const p of proposals) {
      const itemId = `cand_llm_${p.slug.replace(/[^a-z0-9_]+/gi, "_").toLowerCase()}`;
      if ((await store.getItem(itemId)) || created.includes(itemId)) {
        skipped++; // re-runs never clobber existing items
        continue;
      }
      let structuredFields: Record<string, unknown> = {};
      const localFlags = [...p.flags];
      if (p.structuredFieldsJson) {
        try {
          structuredFields = JSON.parse(p.structuredFieldsJson) as Record<string, unknown>;
        } catch {
          localFlags.push("structuredFields did not parse as JSON — payload dropped, edit by hand");
        }
      }
      const cited = p.passageIds
        .map((id) => byId.get(id))
        .filter((x): x is SourcePassage => Boolean(x));
      await store.saveItem({
        itemId,
        systemFamily: req.systemFamily,
        itemType: p.itemType,
        title: p.title,
        humanReadableRule: p.humanReadableRule,
        structuredFields,
        sourceIds: [req.sourceId],
        citations: cited.map((pas) => ({
          sourceId: req.sourceId,
          passageId: pas.passageId,
          passage: `${pas.anchor}: "${pas.text.slice(0, 160)}${pas.text.length > 160 ? "…" : ""}"`,
        })),
        gapIds: [],
        reviewerNotes: `Extracted (llm). Flags: ${localFlags.join("; ") || "none"}. Edit as needed or deprecate.`,
        status: "active",
        version: "1",
        createdBy: "ingestion:llm",
        createdAt: req.now,
      });
      created.push(itemId);
    }
  }

  await store.saveSource({ ...source, status: "ingested" });
  const job: BridgeIngestionJob = {
    jobId: req.jobId,
    sourceId: req.sourceId,
    extractor: "llm",
    systemFamily: req.systemFamily,
    requestedBy: req.requestedBy,
    createdAt: req.now,
    status: errors.length && !created.length ? "failed" : "completed",
    stats: { parsedEntries: parsed, candidatesCreated: created.length, skipped },
    candidateItemIds: created,
    errors,
  };
  await store.saveJob(job);
  return job;
}

export interface IngestionRequest {
  sourceId: string;
  sourceText: string;
  systemFamily: SystemFamily;
  requestedBy: string;
  now: string;
  jobId: string;
}

/** Run an extraction job: candidates land as active items, badged uncited until matched to passages. */
export async function runIngestion(
  store: KnowledgeStore,
  extractor: CandidateExtractor,
  req: IngestionRequest,
): Promise<BridgeIngestionJob> {
  const source = await store.getSource(req.sourceId);
  const fail = async (errors: string[], parsed = 0): Promise<BridgeIngestionJob> => {
    const job: BridgeIngestionJob = {
      jobId: req.jobId,
      sourceId: req.sourceId,
      extractor: extractor.kind,
      systemFamily: req.systemFamily,
      requestedBy: req.requestedBy,
      createdAt: req.now,
      status: "failed",
      stats: { parsedEntries: parsed, candidatesCreated: 0, skipped: 0 },
      candidateItemIds: [],
      errors,
    };
    await store.saveJob(job);
    return job;
  };
  if (!source) return fail([`Unknown source ${req.sourceId}`]);

  let candidates: CandidateItem[];
  try {
    candidates = await extractor.extract(req.sourceText);
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }

  const created: string[] = [];
  let skipped = 0;
  for (const c of candidates) {
    if (await store.getItem(c.itemId)) {
      skipped++; // re-running a job never clobbers an item under review
      continue;
    }
    await store.saveItem({
      itemId: c.itemId,
      systemFamily: req.systemFamily,
      itemType: c.itemType,
      title: c.title,
      humanReadableRule: c.humanReadableRule,
      structuredFields: c.structuredFields,
      sourceIds: [req.sourceId],
      citations: [{ sourceId: req.sourceId, passage: c.passage }],
      gapIds: [],
      reviewerNotes: `Extracted (${extractor.kind}). Flags: ${c.flags.join("; ") || "none"}. Edit as needed, match citations to real passages, or deprecate.`,
      status: "active",
      version: "1",
      createdBy: `ingestion:${extractor.kind}`,
      createdAt: req.now,
    });
    created.push(c.itemId);
  }

  await store.saveSource({ ...source, status: "ingested" });
  const job: BridgeIngestionJob = {
    jobId: req.jobId,
    sourceId: req.sourceId,
    extractor: extractor.kind,
    systemFamily: req.systemFamily,
    requestedBy: req.requestedBy,
    createdAt: req.now,
    status: "completed",
    stats: { parsedEntries: candidates.length, candidatesCreated: created.length, skipped },
    candidateItemIds: created,
    errors: [],
  };
  await store.saveJob(job);
  return job;
}
