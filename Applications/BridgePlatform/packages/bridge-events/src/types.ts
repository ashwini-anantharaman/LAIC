// Event schema, ported from the bridgebot prototype (src/events/types.ts).
// Four in-memory categories: action events are state-changing; logic events
// carry the full decision trace and never mutate state. The additional
// production categories from Bridge plan §9.1 (session / progress_signal /
// configuration / knowledge_package) are persistence-layer envelope concerns
// and land with the Phase 4 event store.

import type { BindsTo, SettingValue } from "@bridge/config";
import type { Call, Card, Seat } from "./vocabulary";

export type EventCategory =
  | "bid-event"
  | "bid-logic-event"
  | "play-event"
  | "play-logic-event";

/** A config setting the player consulted, projected from the registry + resolved value. */
export interface CitedSetting {
  key: string;
  label: string;
  value: SettingValue;
  binds_to: BindsTo;
  module: string;
  /** Whether this setting's condition was satisfied within the rule that cited it. */
  matched: boolean;
}

/**
 * One rule considered in the ordered chain (matched or skipped), for
 * full-trace provenance. `ruleId` resolves through the published rule package
 * to a human-readable knowledge item and its cited sources (Phase 3).
 */
export interface RuleEval {
  ruleId: string;
  matched: boolean;
  settingsConsulted: CitedSetting[];
  reason: string;
}

/** Numeric facts the deliberation used (attribution honesty). */
export interface Facts {
  hcp?: number;
  shape?: [number, number, number, number];
  [k: string]: unknown;
}

export interface RejectedAction {
  action: string; // rendered label (call or card)
  why: string;
}

export interface EventBase {
  seq: number; // monotonic, stamped by the Game controller (single writer)
  ts: number; // epoch millis at emit
  boardRef: string;
  category: EventCategory;
}

// --- Action events (state-changing) ---------------------------------------

export interface BidEvent extends EventBase {
  category: "bid-event";
  seat: Seat;
  call: Call;
  /** True when produced by the fixed safe-default fallback (no rule matched). */
  fallback: boolean;
}

export interface PlayEvent extends EventBase {
  category: "play-event";
  seat: Seat;
  card: Card;
  fallback: boolean;
}

// --- Logic events (advisory trace; never mutate state) --------------------

interface LogicBase extends EventBase {
  seat: Seat;
  fallback: boolean;
  trace: RuleEval[];
  citedSettings: CitedSetting[];
  facts: Facts;
  reason: string;
  rejected: RejectedAction[];
}

export interface BidLogicEvent extends LogicBase {
  category: "bid-logic-event";
  candidates: Call[];
  chosen: Call;
}

export interface PlayLogicEvent extends LogicBase {
  category: "play-logic-event";
  candidates: Card[];
  chosen: Card;
}

export type GameEvent = BidEvent | PlayEvent | BidLogicEvent | PlayLogicEvent;
export type ActionEvent = BidEvent | PlayEvent;
export type LogicEvent = BidLogicEvent | PlayLogicEvent;

export const isActionEvent = (e: GameEvent): e is ActionEvent =>
  e.category === "bid-event" || e.category === "play-event";
export const isLogicEvent = (e: GameEvent): e is LogicEvent =>
  e.category === "bid-logic-event" || e.category === "play-logic-event";

export const CATEGORIES: EventCategory[] = [
  "bid-event",
  "bid-logic-event",
  "play-event",
  "play-logic-event",
];
