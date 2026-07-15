// ONE-OFF: seed the SAYC KB's floor fallback items + Floor pack (cited to
// src_claude — the booklet doesn't document "do something legal anyway").
import { KbService, type KnowledgeItem } from "@bridge/kb";
import { PgKbStore } from "@bridge/pg-stores";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.RUN_SEED_FLOOR)("seed floor (manual)", () => {
  it("creates fallback items and the Floor pack", { timeout: 120_000 }, async () => {
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

    const existing = await store.listItemsForKb(kbId);
    const have = (title: string) => existing.some((i) => i.title === title);
    const base = {
      settings: [],
      sourceReferences: [
        { sourceId: "src_claude", anchor: "platform floor judgment — not from the booklet" },
      ],
      supportedLevels: [],
      status: "approved" as const,
      createdBy: "user_reviewer_rhea",
    };
    const floor: Omit<KnowledgeItem, "itemId" | "version" | "createdAt" | "updatedAt">[] = [
      {
        ...base,
        title: "Auction fallback: pass",
        humanReadableText: "With no agreement that applies, pass.",
        knowledgeType: "fallback_rule",
        phase: "auction",
        payload: { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
      },
      {
        ...base,
        title: "Lead fallback: low from longest",
        humanReadableText: "With no lead agreement that applies, lead low from your longest suit.",
        knowledgeType: "fallback_rule",
        phase: "opening_lead",
        payload: {
          kind: "fallback",
          fallback: { phase: "opening_lead", behavior: "low_from_longest" },
        },
      },
      {
        ...base,
        title: "Play fallback: lowest legal card",
        humanReadableText: "With no technique that applies, play your lowest legal card.",
        knowledgeType: "fallback_rule",
        phase: "declarer_play",
        payload: { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
      },
    ];
    for (const item of floor) {
      if (have(item.title)) continue;
      await service.createItem(kbId, item);
      console.log("created:", item.title);
    }
    const items = await store.listItemsForKb(kbId);
    const ids = (titles: string[]) =>
      items.filter((i) => titles.includes(i.title)).map((i) => i.itemId);
    const packs = await store.listPacksForKb(kbId);
    if (!packs.some((p) => p.name === "Floor (minimal complete)")) {
      // Signals: the booklet's own signal agreement if extracted, else floor.
      let signalIds = items
        .filter((i) => i.knowledgeType === "signal_agreement")
        .map((i) => i.itemId);
      if (!signalIds.length) {
        const none = await service.createItem(kbId, {
          ...base,
          title: "No signals (floor)",
          humanReadableText: "This partnership plays no defensive signals.",
          knowledgeType: "signal_agreement",
          phase: "defense",
          payload: {
            kind: "signals",
            signals: { attitude: "none", count: "none", firstDiscard: "none" },
          },
        });
        signalIds = [none.itemId];
        console.log("created: No signals (floor)");
      }
      await service.savePack({
        kbId,
        name: "Floor (minimal complete)",
        ordinal: 0,
        description: "The minimal complete rung: always has a legal action, however crude.",
        itemIds: [
          ...ids([
            "Auction fallback: pass",
            "Lead fallback: low from longest",
            "Play fallback: lowest legal card",
          ]),
          signalIds[0]!,
        ],
        createdBy: "user_reviewer_rhea",
      });
      console.log("created: Floor pack");
    }
    expect((await store.listPacksForKb(kbId)).length).toBeGreaterThan(0);
  });
});
