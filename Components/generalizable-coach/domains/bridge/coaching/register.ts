/**
 * Zone 3 — Bridge implementation: self-registration with the platform registry.
 *
 * Importing this module (for side effect) makes "bridge_gameplay" resolvable via
 * openCoachSession(). index.ts imports it so any host that imports @laic/coach
 * gets the bridge domain registered automatically.
 */
import { registerDomain } from "../../../platform/embed/registry";
import { BRIDGE_DOMAIN_ID } from "../plugin/constants";
import { buildBridgeCoach } from "./buildBridgeCoach";

// NO ORACLE HERE. This built one unconditionally, which meant a host that merely
// imported @laic/coach for the side effect got a double-dummy solver it never asked
// for — and the wrong answers came back labelled as calculations, the most
// authoritative voice the coach has. Card play from this path is judged by principles
// until a host injects an engine through `createCoachSession({ oracle })`.
registerDomain({
  id: BRIDGE_DOMAIN_ID,
  chatPersona: "an adaptive bridge coach",
  build: (ctx) => buildBridgeCoach({ llm: ctx.llm }),
});
