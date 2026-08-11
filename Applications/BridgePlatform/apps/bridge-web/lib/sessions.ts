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
  type SessionServiceOptions,
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
import { benSeatDecider } from "./benSeat";
import { challengeBenDecider } from "./challengeBen";
import { kbStore } from "./kb";

/**
 * MODULE-level singletons, deliberately NOT `globalThis` ones.
 *
 * These used to hang off globalThis, which in development outlives hot reload
 * while the classes behind it are replaced. The moment a store or the service
 * gained a method, every page that called it threw "…is not a function" until
 * someone restarted the dev server — the code was right and the running instance
 * was a fossil. Module scope is invalidated exactly when the code changes, which
 * is precisely the lifetime these want.
 *
 * Nothing is lost by the change: the one genuinely expensive resource is the
 * Supabase client, which keeps its own globalThis cache in ./backend, so these
 * are a couple of object allocations over it. The JSON file stores read their
 * file once per module instance and persist on every write, so disk stays the
 * source of truth across a reload.
 */
let sessionServiceInstance: SessionService | undefined;
let libraryStoreInstance: LibraryStore | undefined;
let submissionStoreInstance: SubmissionStore | undefined;
let assignmentStoreInstance: AssignmentStore | undefined;

/**
 * WHICH BEN SITS AT THIS TABLE. The service is one global singleton, so the
 * choice cannot be made when it is constructed — it is made per session, from
 * the stamp the record carries (`record.challenge`, written at createSession).
 *
 *  - ORDINARY TABLE (no stamp): `benSeatDecider()`, exactly as before. It calls
 *    BEN_ENDPOINT and DEGRADES on failure — a pass, or the engine's own
 *    fallback chain — so a table never breaks. Unchanged, byte for byte.
 *
 *  - CHALLENGE BOARD (stamped): `challengeBenDecider({challengeId, boardNo})`.
 *    Every decision goes through the `(challengeId, boardNo, history-hash)`
 *    cache, which is what makes the opposition IDENTICAL for every participant
 *    on an identical line (spec §3, the fairness mechanic), and there is no KB
 *    fallback anywhere — when BEN cannot answer it throws `BenUnavailableError`
 *    and the table renders "BEN is thinking… / retry" rather than quietly
 *    seating the shelved house player in a one-attempt scored board.
 *
 * A practice replay (`challenge.practice`) is stamped too: it is unscored and
 * wears no challenge chrome, but it is still challenge play, so it meets the
 * same cached BEN and never the KB.
 *
 * The stamp is read from the record the service already has in hand — no extra
 * store read, and nothing about an unstamped session changes.
 */
function benDeciderFor(): NonNullable<SessionServiceOptions["benDecider"]> {
  const ordinary = benSeatDecider();
  return (args) => {
    const stamp = args.record.challenge;
    if (!stamp) return ordinary(args);
    return challengeBenDecider({
      challengeId: stamp.challengeId,
      boardNo: stamp.boardNo,
    });
  };
}

export function sessionService(): SessionService {
  sessionServiceInstance ??= new SessionService(
    storeBackend() === "postgres"
      ? new PgSessionStore(pgClient())
      : new JsonFileSessionStore(join(process.cwd(), dataDir(), "session-store.json")),
    kbStore(),
    // BEN can sit at any table; the decider dials BEN_ENDPOINT lazily, so a
    // missing endpoint only errors if a BEN seat actually has to act.
    { benDecider: benDeciderFor() },
  );
  return sessionServiceInstance;
}

export function libraryStore(): LibraryStore {
  libraryStoreInstance ??=
    storeBackend() === "postgres"
      ? new PgLibraryStore(pgClient())
      : new JsonFileLibraryStore(join(process.cwd(), dataDir(), "library-store.json"));
  return libraryStoreInstance;
}

export function submissionStore(): SubmissionStore {
  submissionStoreInstance ??=
    storeBackend() === "postgres"
      ? new PgSubmissionStore(pgClient())
      : new JsonFileSubmissionStore(join(process.cwd(), dataDir(), "submission-store.json"));
  return submissionStoreInstance;
}

export function assignmentStore(): AssignmentStore {
  assignmentStoreInstance ??=
    storeBackend() === "postgres"
      ? new PgAssignmentStore(pgClient())
      : new JsonFileAssignmentStore(join(process.cwd(), dataDir(), "assignment-store.json"));
  return assignmentStoreInstance;
}
