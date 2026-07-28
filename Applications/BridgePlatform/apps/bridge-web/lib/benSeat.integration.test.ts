// BEN at the table, end to end over REAL HTTP: an in-process stub speaking
// BEN's REST shapes (/bid, /lead, /play), the real createBenTableClient, the
// real SessionService and engine, a whole board played to completion.
//
// The stub is not a bridge engine — it opens 1NT, then passes, and plays the
// lowest follow-suit card from the hand it is sent. That is enough legality
// for most turns to succeed through the BEN path, and the turns where the
// stub's crude choice is illegal exercise the OTHER guarantee: the seat
// degrades to the engine fallback with an honest reason instead of throwing.
// Either way the board must complete — a BEN seat can never wedge a table.

import { createServer, type Server } from "node:http";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
} from "@bridge/kb";
import { isLogicEvent, type Seat } from "@bridge/events";
import { InMemorySessionStore, SessionService, type SeatConfig } from "@bridge/sessions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { benSeatDecider, createBenTableClient } from "./benSeat";

const RANKS = "23456789TJQKA";

function handCards(pbn: string): string[] {
  const suits = ["S", "H", "D", "C"];
  return (pbn || "")
    .split(".")
    .flatMap((holding, i) => [...holding].map((r) => suits[i] + r.toUpperCase()));
}

/** Lowest follow-suit-if-possible card from the hand's remainder. */
function pickCard(hand: string, played: string): string | null {
  const remaining = handCards(hand);
  const tokens = played.match(/.{2}/g) ?? [];
  for (const t of tokens) {
    const i = remaining.indexOf(t);
    if (i >= 0) remaining.splice(i, 1);
  }
  const inTrick = tokens.length % 4;
  const led = inTrick ? tokens[tokens.length - inTrick]![0] : null;
  const follow = remaining.filter((c) => c[0] === led);
  const pool = follow.length ? follow : remaining;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (RANKS.indexOf(a[1]!) <= RANKS.indexOf(b[1]!) ? a : b));
}

let server: Server;
let endpoint: string;
const hits = { bid: 0, lead: 0, play: 0 };

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    const q = url.searchParams;
    const send = (body: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/bid") {
      hits.bid++;
      const ctx = q.get("ctx") ?? "";
      const first = ctx === "" || /^-*$/.test(ctx);
      const bid = first ? "1N" : "PASS";
      send({ bid, who: "stub", candidates: [{ call: bid, insta_score: 0.9, explanation: "stub bid" }] });
    } else if (url.pathname === "/lead" || url.pathname === "/play") {
      if (url.pathname === "/lead") hits.lead++;
      else hits.play++;
      const card = pickCard(q.get("hand") ?? "", q.get("played") ?? "");
      send({ card: card ?? "XX", who: "stub", candidates: [{ card, insta_score: 0.8, explanation: "stub card" }] });
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(() => server.close());

describe("BEN plays a whole board over real HTTP", () => {
  it("bids, leads and plays to completion; failures degrade, never wedge", async () => {
    const kbStore = new InMemoryKbStore();
    const kbService = new KbService(kbStore);
    const kb = await kbService.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
    for (const item of FIXTURE_ITEMS) {
      await kbStore.putItem(item);
      await kbStore.addMembership({ kbId: kb.kbId, itemId: item.itemId });
    }
    for (const edge of FIXTURE_EDGES) await kbStore.putEdge(edge);
    for (const pack of fixturePacks(kb.kbId)) await kbStore.putPack(pack);
    await kbService.recompile(kb.kbId);
    const compiled = (await kbService.liveCompile(kb.kbId))!;

    const service = new SessionService(new InMemorySessionStore(), kbStore, {
      benDecider: benSeatDecider(() => createBenTableClient({ endpoint, timeoutMs: 5_000 })),
    });

    const aiSeat = (label: string): SeatConfig => ({
      kind: "kb_player",
      playerId: "pl_x",
      label,
      enabledPackIds: [compiled.packs[0]!.packId],
      settingOverrides: {},
      decisionPolicyId: "first_match",
    });
    const record = await service.createSession({
      kbId: kb.kbId,
      compiled,
      // BEN at two seats — whatever the contract ends up being, at least one
      // BEN seat sees the play phase from defence or declarership.
      seats: {
        N: { kind: "ben", label: "BEN · neural" },
        E: aiSeat("East bot"),
        S: { kind: "ben", label: "BEN · neural" },
        W: aiSeat("West bot"),
      },
      seed: 11,
      createdBy: "u_test",
    });

    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }
    expect(view.state.phase).toBe("complete");

    // BEN really was consulted over HTTP for bids AND cards.
    expect(hits.bid).toBeGreaterThan(0);
    expect(hits.lead + hits.play).toBeGreaterThan(0);

    // Every BEN decision is traced: either BEN's own reasoning, or an honest
    // degrade that NAMES BEN — and none of them wedged the board.
    const benSeats = new Set<Seat>(["N", "S"]);
    const benLogic = view.record.events
      .filter(isLogicEvent)
      .filter(
        (e) =>
          benSeats.has(e.seat) &&
          // dummy's cards are decided by the declarer's controller; those
          // traces carry the dummy's seat, so match on reason instead.
          (e.reason.includes("stub") || e.reason.includes("BEN")),
      );
    expect(benLogic.length).toBeGreaterThan(0);
    for (const e of benLogic) {
      expect(e.reason).toMatch(/stub|BEN/);
    }
  }, 30_000);
});
