import { beforeEach, describe, expect, it } from "vitest";

import { isActionEvent, isLogicEvent, type Seat } from "@bridge/events";
import { FIXTURE_EDGES, FIXTURE_ITEMS, fixturePacks, InMemoryKbStore, KbService } from "@bridge/kb";

import { DD_SEAT_LABEL } from "./ddSeat";
import { InMemorySessionStore, SessionService, type SeatConfig } from "./index";

const NOW = "2026-08-15T10:00:00.000Z";

let kbStore: InMemoryKbStore;
let kbService: KbService;
let service: SessionService;
let kbId: string;

const dd: SeatConfig = { kind: "dd", label: DD_SEAT_LABEL };
const allDd: Record<Seat, SeatConfig> = { N: dd, E: dd, S: dd, W: dd };

beforeEach(async () => {
  kbStore = new InMemoryKbStore();
  kbService = new KbService(kbStore, { now: () => NOW });
  const kb = await kbService.createKb({ name: "SAYC", systemLabel: "SAYC", createdBy: "u" });
  kbId = kb.kbId;
  for (const item of FIXTURE_ITEMS) {
    await kbStore.putItem(item);
    await kbStore.addMembership({ kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await kbStore.putEdge(edge);
  for (const pack of fixturePacks(kbId)) await kbStore.putPack(pack);
  await kbService.recompile(kbId);
  service = new SessionService(new InMemorySessionStore(), kbStore, { now: () => NOW });
});

describe("the double dummy seat", () => {
  it("plays a whole board with no decider injected at all", async () => {
    // The point of the seat: unlike BEN it needs no endpoint, no key and no
    // service, so a table of four solvers runs start to finish right here.
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allDd,
      seed: 4,
      createdBy: "u_rhea",
    });

    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }
    expect(view.state.phase).toBe("complete");
    expect(view.record.status).toBe("completed");

    // Thirteen tricks, every card accounted for.
    expect(view.state.trickCount.NS + view.state.trickCount.EW).toBe(13);
    const logic = view.record.events.filter(isLogicEvent);
    const actions = view.record.events.filter(isActionEvent);
    expect(logic.length).toBe(actions.length); // every action carries its trace
  });

  it("says which brain made each decision — solver for cards, knowledge base for bids", async () => {
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allDd,
      seed: 4,
      createdBy: "u_rhea",
    });
    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }

    const logic = view.record.events.filter(isLogicEvent);
    const plays = logic.filter((e) => e.category === "play-logic-event");
    const bids = logic.filter((e) => e.category === "bid-logic-event");
    expect(plays.length).toBe(52);
    expect(bids.length).toBeGreaterThan(0);

    // Cards come from the solver, and every one of them is an exact answer —
    // DDS has no horizon, so there is no hedging to report.
    expect(plays.every((e) => e.reason.startsWith("Double dummy"))).toBe(true);
    expect(plays.every((e) => /takes \d+ tricks? from here/.test(e.reason))).toBe(true);
    // Nothing fell back to the knowledge base for a card.
    expect(plays.some((e) => e.fallback)).toBe(false);
    // ...and the auction is NOT the solver: it comes from the knowledge base,
    // which is the whole reason a peeking engine is acceptable here.
    expect(bids.every((e) => e.reason.startsWith("Double dummy"))).toBe(false);
  });

  it("never plays an illegal card", async () => {
    // Following suit is the engine's law, not the solver's, so this is the
    // check that the two agree on every single card of a deal.
    const compiled = (await kbService.liveCompile(kbId))!;
    for (const seed of [5, 7, 9, 14]) {
      const record = await service.createSession({
        kbId,
        compiled,
        seats: allDd,
        seed,
        createdBy: "u_rhea",
      });
      let view = await service.view(record.sessionId);
      let guard = 0;
      // step() applies each card through the engine, which rejects an illegal
      // one — reaching `complete` at all is the assertion.
      while (view.state.phase !== "complete" && guard++ < 400) {
        view = await service.step(record.sessionId);
      }
      expect(view.state.phase, `seed ${seed}`).toBe("complete");
    }
  }, 60_000);

  it("answers fast enough to be worth having", async () => {
    // The entire reason this seat exists. BEN takes 20-45s per card; a whole
    // board here should take a fraction of that.
    const compiled = (await kbService.liveCompile(kbId))!;
    const record = await service.createSession({
      kbId,
      compiled,
      seats: allDd,
      seed: 15,
      createdBy: "u_rhea",
    });
    const started = performance.now();
    let view = await service.view(record.sessionId);
    let guard = 0;
    while (view.state.phase !== "complete" && guard++ < 400) {
      view = await service.step(record.sessionId);
    }
    const elapsed = performance.now() - started;
    expect(view.state.phase).toBe("complete");
    // Generous — this is a floor against a latency regression, not a benchmark.
    expect(elapsed).toBeLessThan(20_000);
  }, 60_000);
});
