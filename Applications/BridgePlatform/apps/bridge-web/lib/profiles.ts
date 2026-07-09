// Server-side singleton profile service; system profile seeded from the
// latest published package on first use.

import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { ProfileService } from "@bridge/profiles";
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
    globalCache.__bridgeProfileService = service;
  }
  return globalCache.__bridgeProfileService;
}
