// Challenge chrome tokens - the palette, glyphs and inks the challenge family
// shares, lifted from the validated canvases in docs/design/challenges
// (Challenge Table.dc.html, Challenge Page.dc.html). ONE source, so the strip,
// the overlay, the leaderboard, the scorecard and the board squares cannot
// drift apart.
//
// This file is 7-bit ASCII on purpose: every glyph is a \u escape, exactly as
// the canvases author them, so nothing invisible is ever smuggled into a
// bundle by a copy/paste.

/** The challenge accent (canvas prop `accent`, default #0d707c). */
export const CHALLENGE_ACCENT = "#0d707c";

/** Score inks: better than the field, worse, flat. */
export const POS = "#1c8a5a";
export const NEG = "#c0392b";
export const NEU = "#8b9a93";

/** BEN's slate - the benchmark is never dressed as a rival. */
export const SLATE = "#55636f";

/** Sheet / page inks. */
export const INK = "#17211d";
export const INK_STRONG = "#22302a";
export const INK_MUTED = "#8b9a93";
export const INK_FAINT = "#9aa8a1";
export const HAIRLINE = "#eef2ef";

/** The dark band the challenge strip sits in, above the table's top toolbar. */
export const STRIP_BG = "#0e1a1c";

/** The UI font every challenge surface uses (the canvases' stack, verbatim). */
export const UI_FONT =
  "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Glyphs, as escapes. */
export const GLYPH_CLOSE = "\u2715"; // close
export const GLYPH_EDITOR = "\u25C6"; // filled diamond - "set the boards"
export const GLYPH_COMPARE = "\u21C4"; // two arrows - compare
export const GLYPH_ENDASH = "\u2013"; // BEN's unranked rank cell
export const GLYPH_EMDASH = "\u2014";
export const GLYPH_ARROW = "\u2192"; // onward - the next board
export const MIDDOT = "\u00B7";

/** How a figure reads: better than the field, worse, or flat. */
export type ChallengeTone = "pos" | "neg" | "neutral";

/** The ink for a tone. */
export function toneColor(tone: ChallengeTone | undefined): string {
  return tone === "pos" ? POS : tone === "neg" ? NEG : NEU;
}

/**
 * The tone of a bare number - sign only. Modes whose neutral band is not zero
 * (matchpoints sits at 50%) pass an explicit `tone` instead; this is the
 * fallback for IMPs and total points.
 */
export function toneOf(value: number | undefined): ChallengeTone {
  if (value == null || !Number.isFinite(value)) return "neutral";
  return value > 0 ? "pos" : value < 0 ? "neg" : "neutral";
}
