// Server-side KB store/service singletons (STORE_BACKEND seam), plus the
// one seed the platform ships: the registered Claude source — the NAMED
// source for platform-authored judgments (owner sourcing policy 2026-07-12).

import {
  CLAUDE_SOURCE,
  JsonFileKbStore,
  KbService,
  type KbStore,
} from "@bridge/kb";
import { PgKbStore } from "@bridge/pg-stores";
import { join } from "node:path";
import { pgClient, storeBackend } from "./backend";

const globalCache = globalThis as unknown as {
  __bridgeKbStore?: KbStore;
  __bridgeKbService?: KbService;
  __bridgeKbSeeded?: Promise<void>;
};

export function kbStore(): KbStore {
  globalCache.__bridgeKbStore ??=
    storeBackend() === "postgres"
      ? new PgKbStore(pgClient())
      : new JsonFileKbStore(join(process.cwd(), ".data", "kb-store.json"));
  return globalCache.__bridgeKbStore;
}

export function kbService(): KbService {
  globalCache.__bridgeKbService ??= new KbService(kbStore());
  return globalCache.__bridgeKbService;
}

/** Idempotent: ensure the Claude source exists before anything cites it. */
export async function ensureSeeds(): Promise<void> {
  globalCache.__bridgeKbSeeded ??= (async () => {
    const store = kbStore();
    if (!(await store.getSource(CLAUDE_SOURCE.sourceId))) {
      await store.putSource(CLAUDE_SOURCE);
    }
  })();
  return globalCache.__bridgeKbSeeded;
}
