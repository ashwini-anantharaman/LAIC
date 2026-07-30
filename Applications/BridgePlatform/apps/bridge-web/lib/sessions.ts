// Server-side session service + library store singletons (STORE_BACKEND seam).

import {
  PgAssignmentStore,
  PgLibraryStore,
  PgSessionStore,
  PgSubmissionStore,
} from "@bridge/pg-stores";
import {
  SessionService,
  type AssignmentStore,
  type LibraryStore,
  type SubmissionStore,
} from "@bridge/sessions";
import {
  JsonFileAssignmentStore,
  JsonFileLibraryStore,
  JsonFileSessionStore,
  JsonFileSubmissionStore,
} from "@bridge/sessions/fileStore";
import { join } from "node:path";
import { dataDir, pgClient, storeBackend } from "./backend";
import { kbStore } from "./kb";

const globalCache = globalThis as unknown as {
  __bridgeSessionService?: SessionService;
  __bridgeLibraryStore?: LibraryStore;
  __bridgeSubmissionStore?: SubmissionStore;
  __bridgeAssignmentStore?: AssignmentStore;
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

export function submissionStore(): SubmissionStore {
  globalCache.__bridgeSubmissionStore ??=
    storeBackend() === "postgres"
      ? new PgSubmissionStore(pgClient())
      : new JsonFileSubmissionStore(join(process.cwd(), dataDir(), "submission-store.json"));
  return globalCache.__bridgeSubmissionStore;
}

export function assignmentStore(): AssignmentStore {
  globalCache.__bridgeAssignmentStore ??=
    storeBackend() === "postgres"
      ? new PgAssignmentStore(pgClient())
      : new JsonFileAssignmentStore(join(process.cwd(), dataDir(), "assignment-store.json"));
  return globalCache.__bridgeAssignmentStore;
}
