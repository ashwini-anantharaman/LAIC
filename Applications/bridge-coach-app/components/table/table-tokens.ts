// bridge-table-ui/src/tokens.ts, ported verbatim (owner direction 2026-08-12:
// the native table is the web table pasted and rewired — same constants, same
// names). Plus one RN-only helper: a skin's gradient token rendered flat.

import type { Seat } from "../../lib/vendor/table-kernel/table-kernel";

export const RED = "#cc0000";
export const GOLD = "#fecd07";
export const GREY = "#d3d3d3";
export const DEALER_TINT = "#f2e2b8";
export const DEALER_RING = "#b8901f";
export const SEAT_BADGE = "#12525e";

export const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
export const STRAINS = ["C", "D", "H", "S", "N"] as const;
export const ORDER: Seat[] = ["W", "N", "E", "S"];
export const DISPLAY = ["S", "H", "C", "D"] as const;
export const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };

export const isRed = (s: string) => s === "H" || s === "D";

export function rankText(rank: number): string {
  return rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : rank === 14 ? "A" : String(rank);
}

export function callText(call: string): string {
  if (call === "P") return "Pass";
  if (call === "X") return "X";
  if (call === "XX") return "XX";
  return `${call[0]}${GLYPH[call[1] ?? ""] ?? ""}`;
}

export function callColor(call: string): string {
  const isBid = call !== "P" && call !== "X" && call !== "XX";
  return isBid && isRed(call[1] ?? "") ? RED : "#000";
}

/**
 * The last hex in a skin token — RN paints no CSS gradients, so a gradient
 * felt renders at its own BASE colour (the token's fallback layer, listed
 * last by construction in table-skins.json). A plain colour passes through.
 */
export function flatColor(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  const hexes = token.match(/#[0-9a-fA-F]{3,8}/g);
  return hexes && hexes.length ? hexes[hexes.length - 1]! : token;
}
