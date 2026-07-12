// Server-side singleton session service. The injected package lookup pins
// sessions to exact generated versions from the knowledge store. Dev
// bootstrap: if no package version exists yet, run one generation of the
// seed content.

import type { BridgeRulePackage } from "@bridge/engine";
import { runGeneration, type KnowledgeStore } from "@bridge/knowledge";
import { PgSessionStore } from "@bridge/pg-stores";
import { SessionService, type SessionStore } from "@bridge/sessions";
import { JsonFileSessionStore } from "@bridge/sessions/fileStore";
import { pgClient, storeBackend } from "./backend";
import { join } from "node:path";
import { knowledgeStore } from "./knowledge";

const globalCache = globalThis as unknown as {
  __bridgeSessionService?: SessionService;
  __bridgeSessionStore?: SessionStore;
};

/** Internal store handle (progress extraction bypasses tenant checks by design). */
export function sessionStoreInstance(): SessionStore {
  if (!globalCache.__bridgeSessionStore) {
    globalCache.__bridgeSessionStore =
      storeBackend() === "postgres"
        ? new PgSessionStore(pgClient())
        : new JsonFileSessionStore(join(process.cwd(), ".data", "session-store.json"));
  }
  return globalCache.__bridgeSessionStore;
}

export function sessionService(): SessionService {
  if (!globalCache.__bridgeSessionService) {
    const kstore = knowledgeStore();
    globalCache.__bridgeSessionService = new SessionService({
      store: sessionStoreInstance(),
      loadPackage: async (ref) => (await kstore.getPackage(ref.packageId, ref.version))?.pkg ?? null,
    });
  }
  return globalCache.__bridgeSessionService;
}

/** Latest package version, generating the seed once in a fresh dev store. */
export async function latestPackage(packageId: string): Promise<BridgeRulePackage> {
  const kstore: KnowledgeStore = knowledgeStore();
  const existing = await kstore.getLatest(packageId);
  if (existing) return existing.pkg;

  const run = await runGeneration(kstore, {
    systemFamily: "natural",
    requestedBy: "dev_bootstrap",
    now: new Date().toISOString(),
    runId: `run_bootstrap_${crypto.randomUUID().slice(0, 8)}`,
  });
  if (run.status !== "completed")
    throw new Error(
      `No package version and dev bootstrap generation failed:\n${run.errors.join("\n")}`,
    );
  return (await kstore.getPackage(run.resultPackageId!, run.resultVersion!))!.pkg;
}
