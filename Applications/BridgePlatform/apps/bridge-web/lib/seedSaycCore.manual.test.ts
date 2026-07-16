// ONE-OFF: after extraction, build the SAYC core pack (extends Floor) and a
// validated full-booklet player, with a self-play report.
import {
  KbService,
  newId,
  playerIsValid,
  validatePlayerStatic,
  type KbPlayer,
} from "@bridge/kb";
import { simulateSelfPlay } from "@bridge/engine";
import { PgKbStore } from "@bridge/pg-stores";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.RUN_SEED_SAYC_CORE)("seed SAYC core (manual)", () => {
  it("creates the core pack and a validated player", { timeout: 600_000 }, async () => {
    const env = Object.fromEntries(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = new PgKbStore(db);
    const service = new KbService(store);
    const kbId = "kb_mrldk80k001";

    const items = await store.listItemsForKb(kbId);
    const packs = await store.listPacksForKb(kbId);
    const floor = packs.find((p) => p.name === "Floor (minimal complete)");
    expect(floor).toBeTruthy();

    let core = packs.find((p) => p.name === "SAYC core (full booklet)");
    if (!core) {
      const floorIds = new Set(floor!.itemIds);
      core = await service.savePack({
        kbId,
        name: "SAYC core (full booklet)",
        description:
          "Everything extracted from the ACBL SAYC System Booklet, on top of the floor.",
        ordinal: 1,
        extendsPackId: floor!.packId,
        itemIds: items
          .filter((i) => i.status !== "deprecated" && !floorIds.has(i.itemId))
          .map((i) => i.itemId),
        createdBy: "user_reviewer_rhea",
      });
      console.log("created pack:", core.packId, core.itemIds.length, "items");
    }

    const compiled = (await service.liveCompile(kbId))!;
    const players = await store.listPlayersForKb(kbId);
    if (!players.some((p) => p.name === "SAYC — full booklet")) {
      const now = new Date().toISOString();
      const player: KbPlayer = {
        playerId: newId("pl"),
        kbId,
        name: "SAYC — full booklet",
        description: "Plays the whole extracted booklet (floor + core).",
        enabledPackIds: [core.packId],
        settingOverrides: {},
        decisionPolicyId: "first_match",
        fallbackPolicyId: "standard",
        validationStatus: "draft",
        ownerType: "system",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const report = validatePlayerStatic(compiled, player);
      const simulation = await simulateSelfPlay({
        compiled,
        player: {
          enabledPackIds: player.enabledPackIds,
          settingOverrides: {},
          decisionPolicyId: "first_match",
        },
        deals: 24,
        seed: 20260715,
      });
      const valid = playerIsValid(report);
      await store.putPlayer({
        ...player,
        validationStatus: valid ? "valid" : "invalid",
        validationReport: { ...report, simulation },
      });
      console.log(
        "player:",
        valid ? "VALID" : "INVALID",
        "| static misses:",
        report.static.filter((r) => !r.ok).map((r) => r.categoryId).join(",") || "none",
        "| conflicts:",
        report.conflicts.length,
        "| sim:",
        `${simulation.completed}/${simulation.deals} deals, ${simulation.engineFloorEvents} floor events`,
      );
    }
    expect((await store.listPlayersForKb(kbId)).length).toBeGreaterThan(0);
  });
});
