// A rendered playing card (2026-07-16 table rework). Server-renderable,
// CSS-only: white face with rank over suit in the top-left (readable under
// heavy overlap), petrol-backed when face down. Sizes are shared between the
// hand rows and the center trick so overlap math stays in one place.

import type { Card, Suit } from "@bridge/events";
import { rankLabel } from "@bridge/events";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (s: Suit) => s === "H" || s === "D";

export type CardSize = "sm" | "md" | "lg";

const FACE_SIZE: Record<CardSize, string> = {
  sm: "w-8 text-[13px]",
  md: "w-10 text-[15px] sm:w-11",
  lg: "w-11 text-base sm:w-14 sm:text-lg",
};

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  muted = false,
}: Readonly<{
  card?: Card;
  faceDown?: boolean;
  size?: CardSize;
  /** Legal-move context where THIS card is not playable. */
  muted?: boolean;
}>) {
  if (faceDown || !card) {
    return (
      <span
        aria-hidden
        className={`block aspect-[5/7] rounded-md border border-emerald-950/60 bg-emerald-900 shadow-sm ring-1 ring-inset ring-emerald-700/60 ${FACE_SIZE[size]} bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,255,255,0.06)_3px,rgba(255,255,255,0.06)_6px)]`}
      />
    );
  }
  return (
    <span
      className={`block aspect-[5/7] rounded-md border bg-white shadow-sm ${FACE_SIZE[size]} ${
        muted ? "border-neutral-200 opacity-40" : "border-neutral-300"
      }`}
      aria-label={`${rankLabel(card.rank)}${GLYPH[card.suit]}`}
    >
      <span
        className={`flex flex-col items-center pl-1 pt-0.5 leading-none ${
          red(card.suit) ? "text-[var(--madder)]" : "text-neutral-900"
        }`}
        style={{ width: "fit-content" }}
      >
        <span className="font-semibold tabular-nums">{rankLabel(card.rank)}</span>
        <span className="mt-0.5">{GLYPH[card.suit]}</span>
      </span>
    </span>
  );
}
