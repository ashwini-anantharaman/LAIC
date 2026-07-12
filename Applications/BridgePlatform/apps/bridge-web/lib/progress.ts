// Server-side singleton progress service (Track 1 extractor). Runs AFTER
// event persistence — the async track; the engine's beforeCommit hook stays
// available for future synchronous (before-commit) coaching.

import { PgProgressStore } from "@bridge/pg-stores";
import { ProgressService } from "@bridge/progress";
import { JsonFileProgressStore } from "@bridge/progress/fileStore";
import { pgClient, storeBackend } from "./backend";
import { join } from "node:path";
import { knowledgeStore } from "./knowledge";
import { sessionStoreInstance } from "./sessions";

const globalCache = globalThis as unknown as { __bridgeProgressService?: ProgressService };

export function progressService(): ProgressService {
  if (!globalCache.__bridgeProgressService) {
    const sessions = sessionStoreInstance();
    const kstore = knowledgeStore();
    globalCache.__bridgeProgressService = new ProgressService(
      storeBackend() === "postgres"
        ? new PgProgressStore(pgClient())
        : new JsonFileProgressStore(join(process.cwd(), ".data", "progress-store.json")),
      {
        loadSession: async (id) => {
          const record = await sessions.getSession(id);
          return record ? { record, events: await sessions.getEvents(id) } : null;
        },
        loadPackage: async (ref) =>
          (await kstore.getPackage(ref.packageId, ref.version))?.pkg ?? null,
      },
    );
  }
  return globalCache.__bridgeProgressService;
}

/** Fire the async extractor after a session mutation; never blocks gameplay. */
export async function recomputeSignalsSafe(bridgeSessionId: string): Promise<void> {
  try {
    await progressService().recomputeSession(bridgeSessionId);
  } catch (e) {
    console.error(`[progress] recompute failed for ${bridgeSessionId}:`, e);
  }
}
