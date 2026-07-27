// A rendered playing card (2026-07-16 table rework). Server-renderable,
// CSS-only: white face with rank over suit in the top-left (readable under
// heavy overlap), petrol-backed when face down. Sizes are shared between the
// hand rows and the center trick so overlap math stays in one place.

import type { Card, Suit } from "@bridge/events";
import { rankLabel } from "@bridge/events";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (s: Suit) => s === "H" || s === "D";

export type CardSize = "sm" | "md" | "lg";

// Fluid sizing: every card scales continuously with the window (clamped at
// readable extremes) instead of stepping at breakpoints — this is what keeps
// 13-card rows inside the felt at any width.
const FACE_SIZE: Record<CardSize, string> = {
  sm: "w-[clamp(24px,2.6vw,40px)] text-[clamp(11px,1.15vw,15px)]",
  md: "w-[clamp(30px,3.1vw,48px)] text-[clamp(12px,1.25vw,16px)]",
  lg: "w-[clamp(34px,4vw,64px)] text-[clamp(14px,1.5vw,20px)]",
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
    // Petrol back (reads clearly against the green felt); the light inset ring
    // keeps each card's edge visible under heavy overlap.
    return (
      <span
        aria-hidden
        className={`block aspect-[5/7] rounded-md border border-[#1f3a42] bg-[#3e6f7d] shadow-sm ring-1 ring-inset ring-white/25 ${FACE_SIZE[size]} bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,255,255,0.07)_3px,rgba(255,255,255,0.07)_6px)]`}
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
