// Server-side session service singleton (STORE_BACKEND seam).

import { PgSessionStore } from "@bridge/pg-stores";
import { SessionService } from "@bridge/sessions";
import { JsonFileSessionStore } from "@bridge/sessions/fileStore";
import { join } from "node:path";
import { pgClient, storeBackend } from "./backend";
import { kbStore } from "./kb";

const globalCache = globalThis as unknown as { __bridgeSessionService?: SessionService };

export function sessionService(): SessionService {
  globalCache.__bridgeSessionService ??= new SessionService(
    storeBackend() === "postgres"
      ? new PgSessionStore(pgClient())
      : new JsonFileSessionStore(join(process.cwd(), ".data", "session-store.json")),
    kbStore(),
  );
  return globalCache.__bridgeSessionService;
}
