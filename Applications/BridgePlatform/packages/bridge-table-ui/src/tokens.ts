// The Play Table design's palette, metrics and text helpers, lifted from the
// prototype verbatim. Shared by PlayTable and every leaf it composes so the
// tokens have ONE source and stay byte-identical across the family.

import type { Seat, Suit } from "@bridge/events";

export const RED = "#cc0000";
export const GOLD = "#fecd07";
export const GREY = "#d3d3d3";
export const DEALER_TINT = "#f2e2b8";
export const DEALER_RING = "#b8901f";
export const SEAT_BADGE = "#12525e";

export const GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" };
export const STRAINS = ["C", "D", "H", "S", "N"] as const;
export const ORDER: Seat[] = ["W", "N", "E", "S"];
export const DISPLAY: Suit[] = ["S", "H", "C", "D"];
export const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };

export const isRed = (s: string) => s === "H" || s === "D";
export const rankText = (r: number) =>
  (({ 11: "J", 12: "Q", 13: "K", 14: "A" }) as Record<number, string>)[r] ?? String(r);
export const isBid = (c: string) => /^[1-7][CDHSN]$/.test(c);
/** A call as it appears on the felt. "P", not "Pass" (owner, 2026-08-13): the
    auction grid is four narrow columns and the pad is short of width, and a
    player reading an auction reads a shape, not prose. */
export const callText = (c: string) =>
  c === "P" ? "P" : c === "X" ? "X" : c === "XX" ? "XX" : `${c[0]}${GLYPH[c[1] ?? ""] ?? ""}`;
export const callColor = (c: string) => (isBid(c) && isRed(c[1] ?? "") ? RED : "#000");
export const sideOf = (s: Seat) => (s === "N" || s === "S" ? "NS" : "EW");
