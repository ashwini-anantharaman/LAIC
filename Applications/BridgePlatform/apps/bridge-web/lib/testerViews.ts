// Server-side tester-views store singleton (STORE_BACKEND seam) + a fail-open
// list helper. The component tester is a hidden harness; a store hiccup must
// degrade to "no saved views", never take the page down.

import { PgTesterViewStore } from "@bridge/pg-stores";
import { InMemoryTesterViewStore, type TesterView, type TesterViewStore } from "@bridge/tester-views";
import { JsonFileTesterViewStore } from "@bridge/tester-views/fileStore";
import { join } from "node:path";
import { dataDir, pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as { __bridgeTesterViewStore?: TesterViewStore };

export function testerViewStore(): TesterViewStore {
  if (!globalCache.__bridgeTesterViewStore) {
    globalCache.__bridgeTesterViewStore =
      storeBackend() === "postgres"
        ? new PgTesterViewStore(pgClient())
        : new JsonFileTesterViewStore(join(process.cwd(), dataDir(), "tester-views-store.json"));
  }
  return globalCache.__bridgeTesterViewStore;
}

/** Never throws: an unreachable store yields an empty list. */
export async function listTesterViews(): Promise<TesterView[]> {
  try {
    return await testerViewStore().list();
  } catch (error) {
    console.error("tester-views store unreadable — serving no saved views", error);
    return [];
  }
}

/** Reset for tests / a clean in-memory backend. */
export function _resetTesterViewStore(store?: TesterViewStore): void {
  globalCache.__bridgeTesterViewStore = store ?? new InMemoryTesterViewStore();
}
