// Server-side singleton profile service; system profile seeded from the
// latest published package on first use.

import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { ProfileService, type TeachingScopeRecord } from "@bridge/profiles";
import type { EvaluatorFilterSpec } from "@bridge/dealer";
import { knowledgeStore } from "./knowledge";
import { JsonFileProfileStore } from "@bridge/profiles/fileStore";
import { join } from "node:path";
import { latestPublishedPackage } from "./sessions";

const globalCache = globalThis as unknown as { __bridgeProfileService?: ProfileService };

export async function profileService(): Promise<ProfileService> {
  if (!globalCache.__bridgeProfileService) {
    const service = new ProfileService(
      new JsonFileProfileStore(join(process.cwd(), ".data", "profile-store.json")),
    );
    const pkg = await latestPublishedPackage(BEGINNER_NATURAL_PACKAGE_ID);
    await service.ensureSystemProfile(
      { packageId: pkg.packageId, version: pkg.version },
      pkg.settings,
    );
    // Seed system teaching scopes from the fellow-SUGGESTED knowledge items.
    // These are defaults, not truth: coaches customize into their own records.
    const kstore = knowledgeStore();
    for (const itemId of ["ki_bn_scope_level1", "ki_bn2_scope_level2"]) {
      const item = await kstore.getItem(itemId);
      if (item?.status !== "approved") continue;
      const scope = item.structuredFields.scope as {
        scopeId: string;
        evaluatorFilter: EvaluatorFilterSpec;
        targetConceptIds?: string[];
      };
      const seed: Omit<TeachingScopeRecord, "ownerType" | "createdAt" | "updatedAt"> = {
        teachingScopeId: `ts_system_${scope.scopeId}`,
        name: item.title.replace("SUGGESTED ", "").replace(" scope", ""),
        description:
          "Fellow-suggested default — no objective level exists. Customize to encode your own judgment.",
        derivedFromItemId: itemId,
        evaluatorFilter: scope.evaluatorFilter,
        targetConceptIds: scope.targetConceptIds ?? [],
      };
      await service.ensureSystemScope(seed);
    }
    globalCache.__bridgeProfileService = service;
  }
  return globalCache.__bridgeProfileService;
}
