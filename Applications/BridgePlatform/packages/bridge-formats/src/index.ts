/**
 * @bridge/formats
 *
 * Board I/O ported from the bridgebot prototype: the normalized GameContext
 * shape, BBO LIN parsing, PBN parse/write (full round-trip: deal + auction +
 * play), and seeded random dealing. Constraint-aware dealing builds on this
 * in @bridge/dealer (Phase 6).
 */

export * from "./context";
export { parseLin, type LinBoard, type LinParseResult } from "./lin";
export { linFromBbo, parseBbo, type BboLinResult } from "./bbo";
export { parseLinToContexts } from "./linAdapter";
export { parsePbn } from "./pbn";
export { randomContext } from "./random";
export { toLin, toPbn } from "./write";
