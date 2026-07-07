/**
 * Zone 2 — Domain Contracts barrel.
 *
 * Everything downstream (platform core + domain plugins) imports contracts
 * from here. The platform core (Zone 1) must never import anything
 * Bridge-specific; it depends only on these interfaces.
 */
export * from "./events.js";
export * from "./evaluation.js";
export * from "./knowledge.js";
export * from "./coach.js";
export * from "./plugin.js";
