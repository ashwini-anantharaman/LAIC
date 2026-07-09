// Server-side singleton knowledge store for the admin area. JSON-file dev
// store seeded with Beginner Natural v0 (mirrors TheNexusPlatform's
// local-store fallback); swaps to the Postgres store when Supabase lands.

import { BEGINNER_NATURAL_V0_SEED, LEVEL2_GAPS, LEVEL2_ITEMS, type KnowledgeStore } from "@bridge/knowledge";
import { JsonFileKnowledgeStore } from "@bridge/knowledge/fileStore";
import { join } from "node:path";

const globalCache = globalThis as unknown as { __bridgeKnowledgeStore?: KnowledgeStore };

export function knowledgeStore(): KnowledgeStore {
  if (!globalCache.__bridgeKnowledgeStore) {
    globalCache.__bridgeKnowledgeStore = new JsonFileKnowledgeStore(
      join(process.cwd(), ".data", "knowledge-store.json"),
      {
        ...BEGINNER_NATURAL_V0_SEED,
        items: [...(BEGINNER_NATURAL_V0_SEED.items ?? []), ...LEVEL2_ITEMS],
        gaps: [...(BEGINNER_NATURAL_V0_SEED.gaps ?? []), ...LEVEL2_GAPS],
      },
    );
  }
  return globalCache.__bridgeKnowledgeStore;
}
