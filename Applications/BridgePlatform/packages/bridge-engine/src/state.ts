// Game state model, ported from the bridgebot prototype (src/game/state.ts).

import type {
  AuctionCall,
  Card,
  Contract,
  Seat,
  Vul,
} from "@bridge/events";

export type GamePhase = "auction" | "play" | "complete";

export interface Trick {
  leader: Seat;
  plays: { seat: Seat; card: Card }[]; // in play order, 0..4
  winner?: Seat;
}

export interface GameState {
  boardRef: string;
  dealer: Seat;
  vul: Vul;
  /** Remaining cards per seat (cards are removed as they're played). */
  hands: Record<Seat, Card[]>;
  auction: AuctionCall[];
  contract: Contract | null;
  phase: GamePhase;
  turn: Seat; // whose action is next
  tricks: Trick[]; // completed + the in-progress trick (last)
  trickCount: { NS: number; EW: number };
}

export function initialState(
  boardRef: string,
  dealer: Seat,
  vul: Vul,
  hands: Record<Seat, Card[]>,
): GameState {
  return {
    boardRef,
    dealer,
    vul,
    hands: {
      N: [...hands.N],
      E: [...hands.E],
      S: [...hands.S],
      W: [...hands.W],
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: dealer,
    tricks: [],
    trickCount: { NS: 0, EW: 0 },
  };
}

export const sideOf = (seat: Seat): "NS" | "EW" =>
  seat === "N" || seat === "S" ? "NS" : "EW";
