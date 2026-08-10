// "Deal me a board" — the lineup New Play sits down against.
//
// Choosing it means listing the knowledge bases, compiling the first that
// yields a default set, and finding (or creating) that set's house player:
// four sequential database round trips, ~300–700ms, and the answer is the SAME
// every time until someone edits a knowledge base. So it is resolved once and
// cached briefly per player — the board itself is still dealt fresh on every
// tap (a new seed, a new session), only the opponents' identity is reused.
//
// The 60s TTL is the same bargain the context, catalogue and people caches
// already make here: an authored change to a knowledge base shows up in the
// next minute's new boards rather than the next tap's.

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { kbService, kbStore } from "./kb";
import { assertKbAllowed } from "./org";

type Compiled = NonNullable<Awaited<ReturnType<ReturnType<typeof kbService>["liveCompile"]>>>;

export interface QuickPlayLineup {
  kbId: string;
  compiled: Compiled;
  /** The house player every AI seat is dealt from. */
  house: Awaited<ReturnType<typeof import("./arena").ensureHousePlayer>>;
}

const TTL_MS = 60_000;
const store = (
  globalThis as unknown as {
    __bridgeQuickPlayCache?: Map<string, { value: QuickPlayLineup; expires: number }>;
  }
).__bridgeQuickPlayCache ??= new Map();

/**
 * The strongest set that compiles, and its house player — or null when no
 * knowledge base can field a table.
 *
 * The caller MUST still run its own authorization (assertKbAllowed) on the
 * returned kbId: a cached lineup is a performance shortcut, never a permission.
 */
export async function resolveQuickPlayLineup(
  context: NexusBridgeContext,
): Promise<QuickPlayLineup | null> {
  const key = `${context.laicOrgId}:${context.nexusUserId}`;
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { pickDefaultSet, ensureHousePlayer } = await import("./arena");
  const kbs = kbStore();
  for (const kb of (await kbs.listKbs()).filter((k) => !k.archived)) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const pack = pickDefaultSet(compiled);
    if (!pack) continue;
    // Checked here too, so a lineup is never even cached for someone who may
    // not use it; the caller checks again on the way out.
    await assertKbAllowed(context, kb.kbId);
    const house = await ensureHousePlayer(kbs, compiled, pack, context.nexusUserId);
    const value: QuickPlayLineup = { kbId: kb.kbId, compiled, house };
    if (store.size > 100) store.clear();
    store.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
  }
  return null;
}

/** Drop cached lineups — call after anything that changes what compiles. */
export function invalidateQuickPlayLineups(): void {
  store.clear();
}
