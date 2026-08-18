import type { LibraryKind } from "@bridge/sessions";

/**
 * Display nouns for library kinds (owner wording rename, 2026-08). The library
 * entity historically called a "deal" (a bare card distribution) is now shown
 * as a PACK; the entity historically called a "play" (a recorded board) is now
 * shown as a DEAL. The stored `kind` discriminators are unchanged — only the
 * words we render move — so prod data reads correctly without a migration.
 */
export const LIBRARY_KIND_LABEL: Record<LibraryKind, string> = {
  deal: "pack",
  board: "board",
  table: "table",
  play: "deal",
  drill: "drill",
  puzzle: "puzzle",
  challenge: "challenge",
};

/** Map a stored kind discriminator to its display noun (falls back to itself). */
export function libraryKindLabel(kind: string): string {
  return (LIBRARY_KIND_LABEL as Record<string, string>)[kind] ?? kind;
}
