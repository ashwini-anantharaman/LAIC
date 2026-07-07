/**
 * Zone 3 — Bridge implementation: domain-specific event payload and state.
 * These plug into the generic ActivityEvent<TAction> envelope.
 */

export type Seat = "N" | "E" | "S" | "W";

/** The payload of a "bid_made" event. */
export interface BridgeBidAction {
  /** e.g., "1S", "1NT", "P" (pass), "2H" */
  bid: string;
  position: Seat;
  /** e.g., "S:KQ874 H:A3 D:K92 C:J54" */
  hand: string;
  /** prior calls in order, e.g., ["1S", "P"] */
  auctionSoFar: string[];
}

export interface BridgeGameState {
  dealId: string;
  dealer: string;
  vulnerability: string;
  hands: { [position: string]: string };
  auctionSoFar: string[];
  currentPhase: "bidding" | "play";
}
