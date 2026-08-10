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
 */
export { BridgeTable } from "./BridgeTable";
export type { BridgeTableProps, BridgeDecide, BridgeDecision, } from "./BridgeTable";
