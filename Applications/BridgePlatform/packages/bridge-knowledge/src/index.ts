/**
 * @bridge/knowledge
 *
 * The Bridge Knowledge Base (Bridge plan §12): registered sources, human-
 * readable knowledge items (the source of truth), the gap registry,
 * generation runs that turn active items into validated, immutable
 * BridgeRulePackage versions with full lineage, and trace resolution
 * (rule id -> items -> sources).
 *
 * Persistence goes through the KnowledgeStore seam: in-memory (tests),
 * JSON-file (dev admin UI; server-only import via ./fileStore), Postgres
 * (@bridge/pg-stores — schema in db/migrations).
 */

export * from "./model";
export {
  emptyStoreData,
  InMemoryKnowledgeStore,
  type KnowledgeStore,
  type KnowledgeStoreData,
} from "./store";
export {
  attachTestBoardArtifacts,
  runGeneration,
  type GenerationRequest,
} from "./generate";
export {
  PrototypeRegistryExtractor,
  runIngestion,
  runLlmIngestion,
  type CandidateExtractor,
  type CandidateItem,
  type IngestionRequest,
  type LlmExtractedItem,
  type LlmExtractionClient,
  type LlmIngestionRequest,
} from "./ingest";
export { chunkSourceText } from "./passages";
export { resolveRuleProvenance, type ResolvedRuleProvenance } from "./resolve";
export { LEVEL2_GAPS, LEVEL2_ITEMS } from "./content/level2";
export {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  GAPS as BEGINNER_NATURAL_GAPS,
  ITEMS as BEGINNER_NATURAL_ITEMS,
  SOURCES as BEGINNER_NATURAL_SOURCES,
} from "./content/beginnerNaturalV0";
