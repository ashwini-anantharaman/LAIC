/**
 * Zone 3 — Bridge implementation: self-registration with the platform registry.
 *
 * Importing this module (for side effect) makes "bridge_gameplay" resolvable via
 * openCoachSession(). index.ts imports it so any host that imports @laic/coach
 * gets the bridge domain registered automatically.
 */
import { registerDomain } from "../../../platform/embed/registry.js";
import { BRIDGE_DOMAIN_ID } from "../plugin/constants.js";
import { buildBridgeCoach } from "./buildBridgeCoach.js";
import { LocalDoubleDummyOracle } from "../cardplay/dds/LocalDoubleDummyOracle.js";

registerDomain({
  id: BRIDGE_DOMAIN_ID,
  chatPersona: "an adaptive bridge coach",
  build: (ctx) =>
    buildBridgeCoach({ llm: ctx.llm, oracle: new LocalDoubleDummyOracle() }),
});
