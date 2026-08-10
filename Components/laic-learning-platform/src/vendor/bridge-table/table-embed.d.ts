/**
 * @bridge/table-embed
 *
 * The Bridge table as a portable component. One import, one deal, no platform:
 * `<BridgeTable/>` owns a real game through @bridge/engine's pure reducer and
 * draws it with the same PlayTable the app uses. React is the only runtime
 * dependency — no Next, no server, no session.
 *
 *   import { BridgeTable } from "@bridge/table-embed";
 *   <BridgeTable seed={7} humanSeat="S" appearance={{ skin: "claret" }} />
 *
 * Robots are the host's business: pass `decide` and the other three seats play.
 *
 * A TABLE IS NOT THE ONLY SHAPE A LESSON WANTS. Three now, and they are the same
 * deal seen at three altitudes — the same seed, the same engine, the same
 * `decide`:
 *
 *   <BridgeTable/>    play the board out
 *   <BiddingDrill/>   N hands, one call each, BEN's call beside yours
 *   <DealDiagram/>    a deal as a record — look, do not touch
 *
 * The last two are column-shaped on purpose: a tutorial is a strip of prose, and
 * a felt table dropped into one is a table in a corridor.
 */
export { BridgeTable } from "./BridgeTable";
export { BiddingDrill } from "./BiddingDrill";
export { DealDiagram } from "./DealDiagram";
export { createBenDecider } from "./benDecider";
export type { BenDeciderOptions } from "./benDecider";
export type { BridgeTableProps, BridgeDecide, BridgeDecision, } from "./BridgeTable";
export type { BiddingDrillProps, DrillHand, DrillAnswer } from "./BiddingDrill";
export type { DealDiagramProps } from "./DealDiagram";
/**
 * The deal a seed means, so a host can SHOW it without mounting anything —
 * an author picking a board, a summary line, a printed hand record. Hosts were
 * re-implementing the derivation (same PRNG, same S-W-N-E rotation) to do this,
 * and a mirror of a deal is a mirror that can drift.
 */
export { seededDeal } from "@bridge/engine";
export type { Card, Seat, Suit, Call, Vul } from "@bridge/events";
