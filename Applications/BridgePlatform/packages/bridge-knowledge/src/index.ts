/**
 * @bridge/knowledge
 *
 * The Bridge Knowledge Base (Bridge plan §12): registered sources, human-
 * readable knowledge items (the reviewed source of truth), the gap registry,
 * generation runs that turn approved items into validated BridgeRulePackage
 * versions with full lineage, immutable publication, and trace resolution
 * (rule id -> items -> sources).
 *
 * Persistence goes through the KnowledgeStore seam: in-memory (tests),
 * JSON-file (dev admin UI; server-only import via ./fileStore), Postgres
 * (when Supabase credentials land — schema in db/migrations).
 */

export * from "./model";
export {
  emptyStoreData,
  InMemoryKnowledgeStore,
  type KnowledgeStore,
  type KnowledgeStoreData,
} from "./store";
export { publishPackage, runGeneration, type GenerationRequest } from "./generate";
export { resolveRuleProvenance, type ResolvedRuleProvenance } from "./resolve";
export {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  GAPS as BEGINNER_NATURAL_GAPS,
  ITEMS as BEGINNER_NATURAL_ITEMS,
  SOURCES as BEGINNER_NATURAL_SOURCES,
} from "./content/beginnerNaturalV0";
