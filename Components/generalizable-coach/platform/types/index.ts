/**
 * Zone 2 — Domain Contracts barrel.
 *
 * Everything downstream (platform core + domain plugins) imports contracts
 * from here. The platform core (Zone 1) must never import anything
 * Bridge-specific; it depends only on these interfaces.
 */
export * from "./events";
export * from "./evaluation";
export * from "./knowledge";
export * from "./coach";
export * from "./plugin";
