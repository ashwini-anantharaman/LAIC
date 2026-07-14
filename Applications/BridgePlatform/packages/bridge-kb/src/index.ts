/**
 * @bridge/kb — the Knowledge Rework data model (spec §1–§3 shapes).
 *
 * Owns: the knowledge language (typed auction contexts, hand conditions,
 * actions, setting specs), the KB/item/edge/pack/player/suggestion/source
 * model, the compiled-artifact shape, capability categories, and the store
 * seam (memory + JSON file; Postgres lives in @bridge/pg-stores).
 *
 * Content-free: no convention content ships in code. Knowledge enters via
 * extraction from uploaded sources or fellow authoring, always cited —
 * `src_claude` is the named source when no external source exists.
 */

export * from "./language";
export * from "./model";
export * from "./compiled";
export * from "./capabilities";
export * from "./store";
export { JsonFileKbStore } from "./fileStore";
export { fnv1a, hashValue, newId, stableStringify } from "./ids";
export { compileKb, type CompileInput, type CompileResult } from "./compile";
export { KbService, type KbServiceOptions } from "./service";
export { playerIsValid, validatePlayerStatic } from "./validatePlayer";
export { FIXTURE_EDGES, FIXTURE_ITEMS, fixturePacks } from "./fixture";
export { chunkDocument, looksLikeHeading, type ChunkedSection, type ChunkResult } from "./passages";
export {
  materializeExtraction,
  runExtraction,
  type ExtractedEdge,
  type ExtractedItem,
  type ExtractionSection,
  type ExtractorOutput,
  type MaterializedSection,
  type RunExtractionOptions,
  type SectionExtractor,
} from "./extraction";
