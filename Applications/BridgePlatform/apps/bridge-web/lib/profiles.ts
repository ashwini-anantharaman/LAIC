// Server-side singleton profile service (identity layer: user table
// preferences, org profiles, coach affiliations).

import { PgProfileStore } from "@bridge/pg-stores";
import { ProfileService } from "@bridge/profiles";
import { JsonFileProfileStore } from "@bridge/profiles/fileStore";
import { join } from "node:path";
import { pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as { __bridgeProfileService?: ProfileService };

export function profileService(): ProfileService {
  globalCache.__bridgeProfileService ??= new ProfileService(
    storeBackend() === "postgres"
      ? new PgProfileStore(pgClient())
      : new JsonFileProfileStore(join(process.cwd(), ".data", "profile-store.json")),
  );
  return globalCache.__bridgeProfileService;
}
