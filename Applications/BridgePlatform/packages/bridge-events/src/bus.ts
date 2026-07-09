import mitt, { type Emitter } from "mitt";
import type {
  BidEvent,
  BidLogicEvent,
  PlayEvent,
  PlayLogicEvent,
} from "./types";

// One typed channel per category, ported from the prototype. The Game
// controller is the sole emitter of action events; anything may listen
// (UI panels, persistence subscriber in Phase 4, progress extractor in
// Phase 8, coach observer in Phase 12).
export type BusEvents = {
  "bid-event": BidEvent;
  "bid-logic-event": BidLogicEvent;
  "play-event": PlayEvent;
  "play-logic-event": PlayLogicEvent;
};

export type Bus = Emitter<BusEvents>;

export const createBus = (): Bus => mitt<BusEvents>();
