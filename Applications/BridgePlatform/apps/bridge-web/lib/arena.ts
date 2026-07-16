// Play Arena provisioning (2026-07-16 fellows UI rework). Fellows shouldn't
// hand-assemble a player before checking behavior: each ladder rung gets an
// auto-provisioned "house player" on demand, created once and then editable
// like any other player. Compiled packs carry their full extends chain, so a
// house player enables exactly one rung pack.

import {
  playerIsValid,
  validatePlayerStatic,
  type CompiledKb,
  type CompiledPack,
  type KbPlayer,
  type KbStore,
} from "@bridge/kb";
import { newId } from "@bridge/kb";

export const HOUSE_PREFIX = "House · ";

export function housePlayerName(pack: CompiledPack): string {
  return `${HOUSE_PREFIX}${pack.name}`;
}

/** Find-or-create the house player for a ladder rung (idempotent by name). */
export async function ensureHousePlayer(
  store: KbStore,
  compiled: CompiledKb,
  pack: CompiledPack,
  createdBy: string,
): Promise<KbPlayer> {
  const name = housePlayerName(pack);
  const existing = (await store.listPlayersForKb(compiled.kbId)).find((p) => p.name === name);
  if (existing) return existing;

  const now = new Date().toISOString();
  const player: KbPlayer = {
    playerId: newId("pl"),
    kbId: compiled.kbId,
    name,
    description: `Auto-provisioned by the Play Arena for the “${pack.name}” rung. Edit freely — the arena reuses it by name.`,
    levelId: pack.levelId,
    enabledPackIds: [pack.packId],
    settingOverrides: {},
    decisionPolicyId: "first_match",
    fallbackPolicyId: "standard",
    validationStatus: "draft",
    ownerType: "system",
    ownerId: createdBy,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const report = validatePlayerStatic(compiled, player);
  const saved: KbPlayer = {
    ...player,
    validationStatus: playerIsValid(report) ? "valid" : "invalid",
    validationReport: report,
  };
  await store.putPlayer(saved);
  return saved;
}

/** Ladder rungs, lowest ordinal first (the arena's difficulty menu). */
export function ladderRungs(compiled: CompiledKb): CompiledPack[] {
  return [...compiled.packs].sort((a, b) => a.ordinal - b.ordinal);
}
