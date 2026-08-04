// The table's events, in the shape the coaching engine listens to.
//
// This is the host half of the component's `EventSource` port: the coach never
// learns what a `bid-event` is, and bridge never learns what an `ActivityEvent`
// is. This file is the only place the two vocabularies meet, which is what lets
// the same engine coach a quiz somewhere else.
//
// The session's stream is replayed rather than tailed. A board is a persisted
// list of events with a single writer and a monotonic `seq`, so replaying it
// yields exactly the sequence a live listener would have seen — and it means a
// page load, an undo, and a refresh all produce the same coaching. When the
// coach later runs in the commit path, the same events go through the same
// port; only who calls `subscribe` changes.

import { applyEvent, initialState } from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import { callLabel, isActionEvent, rankLabel } from "@bridge/events";
import type { Card, GameEvent, Seat, Vul } from "@bridge/events";
import type { ActivityEvent, EventSource } from "@laic/coach/core";
import type { PlatformContext } from "@laic/learner-contracts";

import { BRIDGE_DOMAIN_ID } from "./context";

/**
 * The payload of one table action. Bridge vocabulary lives HERE, in the
 * generic envelope's `TAction` slot — that slot is exactly the seam the
 * envelope provides for it.
 */
export interface BridgeTableAction {
  kind: "call" | "card";
  seat: Seat;
  /** A call, e.g. "1S" / "P" / "X". Present when kind === "call". */
  call?: string;
  /** A card in the engine's notation, e.g. "SK" / "HT". See `cardCode`. */
  card?: string;
  /** Prior calls in order, e.g. ["1S", "P"]. */
  auctionSoFar: string[];
  /** The actor's hand at the moment of acting, e.g. "S:KQ874 H:A3 D:K92 C:J54". */
  hand: string;
  /** True when the safe-default fallback produced this (no rule matched). */
  fallback: boolean;
}

/**
 * The generic envelope plus tenancy.
 *
 * `ActivityEvent` does not carry a `PlatformContext` yet. It should — every
 * event, note and observation needs the scope a future out-of-process coach
 * would filter queries by, and adding it later means touching every call site
 * AND every stored record. Until that lands in the component, this host-side
 * extension keeps the field real and typed rather than smuggled through a cast.
 */
export type TableActivityEvent = ActivityEvent<BridgeTableAction> & {
  context: PlatformContext;
};

/** One event, paired with the state as it was BEFORE the action. */
export interface TableTurn {
  event: TableActivityEvent;
  /** The position the actor faced — what any verdict has to be computed against. */
  stateBefore: GameState;
}

const SUIT_ORDER = ["S", "H", "D", "C"] as const;

/**
 * A card in the coaching engine's notation: suit letter, then rank as a
 * LETTER — "DK", "HT", "C7".
 *
 * NOT `cardId()` from @bridge/events, which emits a numeric rank ("D13").
 * The engine's card parsers index into "23456789TJQKA", so a numeric rank
 * resolves to -1 and every downstream judgement is computed on a card the
 * evaluator could not read. Using `cardId` here silently produced garbage
 * card-play verdicts — the visible symptom was a note reading "13♦".
 */
const RANK_CODE: Record<number, string> = { 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" };
export function cardCode(card: Card): string {
  return `${card.suit}${RANK_CODE[card.rank] ?? String(card.rank)}`;
}

/** "S:KQ874 H:A3 D:K92 C:J54" — the component's bridge domain uses this form. */
function renderHand(cards: readonly Card[]): string {
  return SUIT_ORDER.map((suit) => {
    const ranks = cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => rankLabel(c.rank))
      .join("");
    return `${suit}:${ranks || "-"}`;
  }).join(" ");
}

/**
 * Replay a board into coaching turns.
 *
 * Only ACTION events become activity events. Logic events are the robots'
 * decision traces — advisory, never state-changing, and (owner decision
 * 2026-08-01) not the coach's material: the strip is the coach's surface and
 * only the coach's.
 */
export function tableTurns({
  record,
  vul,
  dealtHands,
  platform,
}: {
  record: { sessionId: string; board: { name: string; dealer: Seat }; events: readonly GameEvent[] };
  /** The board's vulnerability — it gates rules, so a wrong value is a wrong verdict. */
  vul: Vul;
  /** Hands AS DEALT — during play `state.hands` has been emptied by the tricks. */
  dealtHands: Record<Seat, Card[]>;
  platform: PlatformContext;
}): TableTurn[] {
  let state = initialState(record.board.name, record.board.dealer, vul, dealtHands);
  const turns: TableTurn[] = [];

  for (const event of record.events) {
    if (!isActionEvent(event)) continue;
    const stateBefore = state;
    const isCall = event.category === "bid-event";
    const action: BridgeTableAction = {
      kind: isCall ? "call" : "card",
      seat: event.seat,
      ...(isCall
        ? { call: event.call }
        : { card: cardCode(event.card) }),
      auctionSoFar: stateBefore.auction.map((c) => c.call),
      hand: renderHand(stateBefore.hands[event.seat] ?? []),
      fallback: event.fallback,
    };
    turns.push({
      stateBefore,
      event: {
        eventId: `${record.sessionId}:${event.seq}`,
        domainId: BRIDGE_DOMAIN_ID,
        eventType: isCall ? "bid_made" : "card_played",
        timestamp: new Date(event.ts).toISOString(),
        sessionId: record.sessionId,
        actorId: event.seat,
        action,
        context: platform,
      },
    });
    state = applyEvent(state, event);
  }
  return turns;
}

/**
 * The component's `EventSource`, backed by an already-replayed board.
 *
 * Push, not pull, because that is the port: the coach subscribes and is handed
 * events. Here they all arrive during `subscribe`, which is what a replay is.
 * Swapping this for a live source later changes this file and nothing else.
 */
export function tableEventSource(turns: readonly TableTurn[]): EventSource {
  return {
    subscribe(handler) {
      for (const turn of turns) handler(turn.event, turn.stateBefore);
      return () => {};
    },
  };
}

/** Human-readable label for what the actor did — for note phrasing. */
export function actionLabel(action: BridgeTableAction): string {
  return action.kind === "call" ? callLabel(action.call ?? "") : (action.card ?? "");
}
