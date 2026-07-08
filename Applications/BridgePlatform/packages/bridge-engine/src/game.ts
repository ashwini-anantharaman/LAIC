// Single-writer Game controller, ported from the bridgebot prototype
// (src/game/Game.ts). Owns the seq counter, emits the logic event then the
// action event, then folds. Nothing else emits action events.

import {
  partnerOf,
  type ActionEvent,
  type BidEvent,
  type BidLogicEvent,
  type Bus,
  type Call,
  type Card,
  type PlayEvent,
  type PlayLogicEvent,
  type Seat,
} from "@bridge/events";
import { applyEvent, reconstruct } from "./apply";
import type { Decision } from "./decision";
import type { GameState } from "./state";

// A seat's decision-maker. Decisions may be asynchronous: a package decider
// resolves immediately, a human resolves on click (Phase 5), a remote BEN
// seat resolves over its service connection (Phase 11).
export interface AsyncDecider {
  decideBid(state: GameState, seat: Seat): Promise<Decision<Call>>;
  decidePlay(state: GameState, seat: Seat): Promise<Decision<Card>>;
}

export interface GameHooks {
  /** Called synchronously after each committed action has been folded. */
  afterAction?: (prev: GameState, event: ActionEvent, next: GameState) => void;
  /**
   * May replace a decision before it commits (coach mode / Phase 8's
   * before-commit insertion point). Awaited by step(); ask() bypasses it.
   */
  beforeCommit?: (
    seat: Seat,
    phase: "auction" | "play",
    d: Decision<Call> | Decision<Card>,
  ) => Promise<Decision<Call> | Decision<Card>>;
}

export interface Game {
  getState(): GameState;
  /** Seat whose CONTROLLER acts now (dummy is controlled by declarer in play). */
  actingSeat(): Seat;
  /** Compute a decision for the seat-to-act WITHOUT committing it. */
  ask(): Promise<{ seat: Seat; decision: Decision<Call> | Decision<Card> } | null>;
  /** Commit one action for the seat-to-act (emits logic + action events, folds). */
  step(): Promise<boolean>;
  /**
   * Rewind the last committed action (and its logic event): refolds state,
   * rewinds the seq counter, and cancels any in-flight decision. Returns the
   * seq of the undone logic event (for log rollback), or null if at the start.
   */
  undo(): number | null;
  /** Number of actions committed by this controller (undo depth). */
  historyLength(): number;
  /**
   * Coach edit: redistribute the UNPLAYED cards among the seats mid-game.
   * `remaining` must contain exactly the current remaining card set with each
   * seat's count unchanged (played cards are immutable — they stay with the
   * seat that played them). Rewrites the initial deal and refolds the whole
   * history over it, cancelling any in-flight decision. Throws on violations.
   */
  editDeal(remaining: Record<Seat, Card[]>): void;
  /** The (possibly edited) initial state the history folds over. */
  getInitial(): GameState;
  /** Invalidate in-flight decisions (used on reset/teardown). */
  cancel(): void;
}

// `primedActions` adopts a previously recorded history as this controller's
// own (restored sessions / shared boards): state is refolded from them, they
// become undoable, and the seq counter continues after them. They are NOT
// re-emitted on the bus — the caller imports the original events into its log.
export function createGame(
  bus: Bus,
  deciders: Record<Seat, AsyncDecider>,
  initialArg: GameState,
  hooks: GameHooks = {},
  primedActions: ActionEvent[] = [],
): Game {
  let initial = initialArg;
  let state = primedActions.length ? reconstruct(initial, primedActions) : initial;
  let seq = primedActions.length ? primedActions[primedActions.length - 1]!.seq + 1 : 0;
  let generation = 0;
  // Actions committed by (or adopted into) THIS controller — undo rewinds
  // these, never a context's pre-recorded prefix inside `initial`.
  const history: { logicSeq: number; action: ActionEvent }[] = primedActions.map((a) => ({
    logicSeq: a.seq - 1, // controller emits logic then action as consecutive seqs
    action: a,
  }));
  const base = () => ({ seq: seq++, ts: Date.now(), boardRef: state.boardRef });

  // During play the dummy's cards are played by the declarer's controller.
  const controllerFor = (seat: Seat): Seat => {
    if (state.phase === "play" && state.contract && seat === partnerOf(state.contract.declarer))
      return state.contract.declarer;
    return seat;
  };

  const commitBid = (seat: Seat, d: Decision<Call>) => {
    const logicSeq = seq;
    const logic: BidLogicEvent = {
      ...base(),
      category: "bid-logic-event",
      seat,
      candidates: d.candidates,
      chosen: d.action,
      fallback: d.fallback,
      trace: d.trace,
      citedSettings: d.citedSettings,
      facts: d.facts,
      reason: d.reason,
      rejected: d.rejected,
    };
    bus.emit("bid-logic-event", logic);
    const action: BidEvent = { ...base(), category: "bid-event", seat, call: d.action, fallback: d.fallback };
    bus.emit("bid-event", action);
    history.push({ logicSeq, action });
    const prev = state;
    state = applyEvent(state, action);
    hooks.afterAction?.(prev, action, state);
  };

  const commitPlay = (seat: Seat, d: Decision<Card>) => {
    const logicSeq = seq;
    const logic: PlayLogicEvent = {
      ...base(),
      category: "play-logic-event",
      seat,
      candidates: d.candidates,
      chosen: d.action,
      fallback: d.fallback,
      trace: d.trace,
      citedSettings: d.citedSettings,
      facts: d.facts,
      reason: d.reason,
      rejected: d.rejected,
    };
    bus.emit("play-logic-event", logic);
    const action: PlayEvent = { ...base(), category: "play-event", seat, card: d.action, fallback: d.fallback };
    bus.emit("play-event", action);
    history.push({ logicSeq, action });
    const prev = state;
    state = applyEvent(state, action);
    hooks.afterAction?.(prev, action, state);
  };

  return {
    getState: () => state,
    actingSeat: () => controllerFor(state.turn),
    ask: async () => {
      const seat = state.turn;
      const controller = deciders[controllerFor(seat)];
      if (state.phase === "auction") return { seat, decision: await controller.decideBid(state, seat) };
      if (state.phase === "play") return { seat, decision: await controller.decidePlay(state, seat) };
      return null;
    },
    step: async () => {
      const gen = generation;
      const seat = state.turn;
      const controller = deciders[controllerFor(seat)];
      if (state.phase === "auction") {
        let d = await controller.decideBid(state, seat);
        if (gen !== generation) return false; // cancelled while waiting
        if (hooks.beforeCommit) {
          d = (await hooks.beforeCommit(seat, "auction", d)) as Decision<Call>;
          if (gen !== generation) return false;
        }
        commitBid(seat, d);
        return true;
      }
      if (state.phase === "play") {
        let d = await controller.decidePlay(state, seat);
        if (gen !== generation) return false;
        if (hooks.beforeCommit) {
          d = (await hooks.beforeCommit(seat, "play", d)) as Decision<Card>;
          if (gen !== generation) return false;
        }
        commitPlay(seat, d);
        return true;
      }
      return false;
    },
    undo: () => {
      const last = history.pop();
      if (!last) return null;
      generation++; // discard any in-flight decision against the old state
      seq = last.logicSeq; // redone decisions reuse the freed seq range
      state = reconstruct(initial, history.map((h) => h.action));
      return last.logicSeq;
    },
    historyLength: () => history.length,
    editDeal: (remaining) => {
      const key = (c: Card) => `${c.suit}${c.rank}`;
      const seats: Seat[] = ["N", "E", "S", "W"];
      // Per-seat counts must be preserved (turn order / trick structure).
      for (const seat of seats)
        if (remaining[seat].length !== state.hands[seat].length)
          throw new Error(
            `${seat} must keep exactly ${state.hands[seat].length} cards (got ${remaining[seat].length}).`,
          );
      // Same card multiset as the current remaining cards (no invented cards).
      const now = seats.flatMap((s) => state.hands[s].map(key)).sort();
      const next = seats.flatMap((s) => remaining[s].map(key)).sort();
      if (new Set(next).size !== next.length) throw new Error("Duplicate card in the edited deal.");
      if (now.join() !== next.join())
        throw new Error("Edited hands must redistribute exactly the unplayed cards.");
      // New initial = edited remaining + each seat's already-played cards.
      const playedBy: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
      for (const h of history)
        if (h.action.category === "play-event") playedBy[h.action.seat].push(h.action.card);
      const hands = {} as Record<Seat, Card[]>;
      for (const seat of seats) hands[seat] = [...remaining[seat], ...playedBy[seat]];
      initial = { ...initial, hands };
      generation++; // pending decisions saw the old hands
      state = reconstruct(initial, history.map((h) => h.action));
    },
    getInitial: () => initial,
    cancel: () => {
      generation++;
    },
  };
}
