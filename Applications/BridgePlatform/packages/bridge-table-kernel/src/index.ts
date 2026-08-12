// @bridge/table-kernel — the law layer, one artifact.
//
// What the native table runs LOCALLY: fold events into state, answer "what's
// legal from this seat", score a finished board, speak the vocabulary, and
// resolve skins. Policy (visibility, control overrides, takeover) and
// robots/deciders stay server-side — the kernel deliberately cannot express
// them.
//
// THE ENGINE IS IMPORTED BY DEEP RELATIVE PATH, never its package root: the
// root re-exports ./decide, which value-imports @bridge/kb, whose index
// exports JsonFileKbStore → node:fs — one root import and this bundle stops
// loading in React Native. The law modules below import only each other and
// @bridge/events, verified 2026-08-12; a new engine module joins this list
// only after the same check.

// ── Vocabulary + event schemas (@bridge/events root is pure; mitt bundles) ──
export * from "@bridge/events";

// ── Game law (@bridge/engine, law modules ONLY) ─────────────────────────────
export * from "../../bridge-engine/src/hand";
export * from "../../bridge-engine/src/auction";
export * from "../../bridge-engine/src/state";
export * from "../../bridge-engine/src/apply";
export * from "../../bridge-engine/src/decision";
export {
  scoreBoard,
  resultLabel,
  type ScoreBreakdown,
} from "../../bridge-engine/src/scoring";

// ── Table appearance (client-safe: fileStore is a separate, unexported file) ─
export * from "@bridge/table-config";

// ── Challenge logic + design tokens (pure data/logic, no DOM) ────────────────
export * from "../../bridge-table-ui/src/challengeLogic";
// Named, not `export *`: tokens.ts carries its own `sideOf`, and a namespace
// collision with the engine's makes Rollup silently DROP the export — the law
// layer's sideOf is the one the kernel keeps.
export {
  RED,
  GOLD,
  GREY,
  DEALER_TINT,
  DEALER_RING,
  SEAT_BADGE,
  GLYPH,
  STRAINS,
  ORDER,
  DISPLAY,
  PARTNER,
  isRed,
  rankText,
  isBid,
  callText,
  callColor,
} from "../../bridge-table-ui/src/tokens";
export * from "../../bridge-table-ui/src/challengeTokens";
