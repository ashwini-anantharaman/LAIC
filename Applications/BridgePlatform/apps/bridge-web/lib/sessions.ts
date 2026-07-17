// Server-side session service + library store singletons (STORE_BACKEND seam).

import { PgLibraryStore, PgSessionStore } from "@bridge/pg-stores";
import { SessionService, type LibraryStore } from "@bridge/sessions";
import { JsonFileLibraryStore, JsonFileSessionStore } from "@bridge/sessions/fileStore";
import { join } from "node:path";
import { dataDir, pgClient, storeBackend } from "./backend";
import { kbStore } from "./kb";

const globalCache = globalThis as unknown as {
  __bridgeSessionService?: SessionService;
  __bridgeLibraryStore?: LibraryStore;
};

export function sessionService(): SessionService {
  globalCache.__bridgeSessionService ??= new SessionService(
    storeBackend() === "postgres"
      ? new PgSessionStore(pgClient())
      : new JsonFileSessionStore(join(process.cwd(), dataDir(), "session-store.json")),
    kbStore(),
  );
  return globalCache.__bridgeSessionService;
}

export function libraryStore(): LibraryStore {
  globalCache.__bridgeLibraryStore ??=
    storeBackend() === "postgres"
      ? new PgLibraryStore(pgClient())
      : new JsonFileLibraryStore(join(process.cwd(), dataDir(), "library-store.json"));
  return globalCache.__bridgeLibraryStore;
}
