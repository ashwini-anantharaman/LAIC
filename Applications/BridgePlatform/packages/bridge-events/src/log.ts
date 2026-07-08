import type { Bus } from "./bus";
import { CATEGORIES, type EventCategory, type GameEvent } from "./types";
import type { Seat } from "./vocabulary";

// Append-only event log, ported from the prototype. Subscribes to every bus
// channel and records events in arrival order (== `seq` order, since the
// controller is the single synchronous writer). State reconstruction lives in
// @bridge/engine as `reconstruct(events)` to keep this module game-free.
// Durable persistence (Postgres bridge_events) subscribes the same way in
// Phase 4.

export interface EventLog {
  append(e: GameEvent): void;
  getAll(): readonly GameEvent[];
  filter<C extends EventCategory>(c: C): Extract<GameEvent, { category: C }>[];
  bySeat(seat: Seat): GameEvent[];
  clear(): void;
  /**
   * Remove every event with seq >= fromSeq (used by undo, which rewinds the
   * controller's seq counter so redone decisions reuse the freed range —
   * keeping the replay invariant intact).
   */
  rollback(fromSeq: number): void;
  /** Called with the event on append; with no argument on bulk changes (rollback). */
  subscribe(fn: (e?: GameEvent) => void): () => void;
  /** Serialize the full log to JSON. */
  export(): string;
  /** Replace the log contents from exported JSON. */
  import(json: string): void;
  /** Detach bus subscriptions (call on teardown). */
  dispose(): void;
}

export function createEventLog(bus: Bus): EventLog {
  let events: GameEvent[] = [];
  const listeners = new Set<(e?: GameEvent) => void>();

  const record = (e: GameEvent) => {
    events.push(e);
    for (const fn of listeners) fn(e);
  };

  // Wire every category so the log is a faithful mirror of the bus.
  const offs = CATEGORIES.map((c) =>
    ((): (() => void) => {
      const handler = (e: unknown) => record(e as GameEvent);
      bus.on(c, handler as never);
      return () => bus.off(c, handler as never);
    })(),
  );

  return {
    append: record,
    getAll: () => events,
    filter: <C extends EventCategory>(c: C) =>
      events.filter((e) => e.category === c) as Extract<GameEvent, { category: C }>[],
    bySeat: (seat) => events.filter((e) => "seat" in e && e.seat === seat),
    clear: () => {
      events = [];
    },
    rollback: (fromSeq) => {
      events = events.filter((e) => e.seq < fromSeq);
      for (const fn of listeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    export: () => JSON.stringify(events, null, 2),
    import: (json) => {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error("Event log JSON must be an array.");
      events = parsed as GameEvent[];
    },
    dispose: () => {
      for (const off of offs) off();
      listeners.clear();
    },
  };
}
