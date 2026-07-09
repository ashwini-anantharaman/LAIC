// Server-side singleton session service. JSON-file dev store; the injected
// package lookup pins sessions to exact published versions from the
// knowledge store. Dev bootstrap: if no published package exists yet, run a
// generation + publication of the approved seed once (the publish gate still
// validates — this is a convenience, not a bypass).

import type { BridgeRulePackage } from "@bridge/engine";
import { publishPackage, runGeneration, type KnowledgeStore } from "@bridge/knowledge";
import { SessionService } from "@bridge/sessions";
import { JsonFileSessionStore } from "@bridge/sessions/fileStore";
import { join } from "node:path";
import { knowledgeStore } from "./knowledge";

const globalCache = globalThis as unknown as { __bridgeSessionService?: SessionService };

export function sessionService(): SessionService {
  if (!globalCache.__bridgeSessionService) {
    const kstore = knowledgeStore();
    globalCache.__bridgeSessionService = new SessionService({
      store: new JsonFileSessionStore(join(process.cwd(), ".data", "session-store.json")),
      loadPackage: async (ref) => (await kstore.getPackage(ref.packageId, ref.version))?.pkg ?? null,
    });
  }
  return globalCache.__bridgeSessionService;
}

/** Latest published package, auto-publishing the seed once in a fresh dev store. */
export async function latestPublishedPackage(
  packageId: string,
): Promise<BridgeRulePackage> {
  const kstore: KnowledgeStore = knowledgeStore();
  const existing = await kstore.getLatestPublished(packageId);
  if (existing) return existing.pkg;

  const run = await runGeneration(kstore, {
    systemFamily: "natural",
    requestedBy: "dev_bootstrap",
    now: new Date().toISOString(),
    runId: `run_bootstrap_${crypto.randomUUID().slice(0, 8)}`,
  });
  if (run.status !== "completed")
    throw new Error(
      `No published package and dev bootstrap generation failed:\n${run.errors.join("\n")}`,
    );
  const published = await publishPackage(
    kstore,
    run.resultPackageId!,
    run.resultVersion!,
    "dev_bootstrap",
    new Date().toISOString(),
  );
  return published.pkg;
}
