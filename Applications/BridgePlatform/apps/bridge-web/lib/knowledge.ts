// Server-side singleton knowledge store for the admin area. JSON-file dev
// store seeded with Beginner Natural v0 (mirrors TheNexusPlatform's
// local-store fallback); swaps to the Postgres store when Supabase lands.

import { BEGINNER_NATURAL_V0_SEED, LEVEL2_GAPS, LEVEL2_ITEMS, NT_TOOLKIT_ITEMS, NT_TOOLKIT_SOURCES, type KnowledgeStore } from "@bridge/knowledge";
import { JsonFileKnowledgeStore } from "@bridge/knowledge/fileStore";
import { PgKnowledgeStore } from "@bridge/pg-stores";
import { join } from "node:path";
import { pgClient, storeBackend, withLazySeed } from "./backend";

const globalCache = globalThis as unknown as { __bridgeKnowledgeStore?: KnowledgeStore };

export function knowledgeStore(): KnowledgeStore {
  if (!globalCache.__bridgeKnowledgeStore) {
    const seed = {
      ...BEGINNER_NATURAL_V0_SEED,
      sources: [...(BEGINNER_NATURAL_V0_SEED.sources ?? []), ...NT_TOOLKIT_SOURCES],
      items: [...(BEGINNER_NATURAL_V0_SEED.items ?? []), ...LEVEL2_ITEMS, ...NT_TOOLKIT_ITEMS],
      gaps: [...(BEGINNER_NATURAL_V0_SEED.gaps ?? []), ...LEVEL2_GAPS],
    };
    if (storeBackend() === "postgres") {
      // Seed the shared DB once, on first use of an empty knowledge base.
      globalCache.__bridgeKnowledgeStore = withLazySeed(
        new PgKnowledgeStore(pgClient()),
        async (store) => {
          if ((await store.listSources()).length > 0) return;
          for (const src of seed.sources ?? []) await store.saveSource(src);
          for (const gap of seed.gaps ?? []) await store.saveGap(gap);
          for (const item of seed.items ?? []) await store.saveItem(item);
        },
      );
    } else {
      globalCache.__bridgeKnowledgeStore = new JsonFileKnowledgeStore(
        join(process.cwd(), ".data", "knowledge-store.json"),
        seed,
      );
    }
  }
  return globalCache.__bridgeKnowledgeStore;
}
