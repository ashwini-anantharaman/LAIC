// The classic NESW cross hand diagram — the notation fellows read fluently.
// Server-rendered, compact, used by the library viewer and entry cards.

import type { Card, Seat, Suit } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import type { ReactNode } from "react";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (s: Suit) => s === "H" || s === "D";

function SeatHand({ hand, label }: Readonly<{ hand: Card[]; label: string }>) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      {SUITS.map((suit) => {
        const ranks = hand
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank))
          .join(" "); // thin space — keeps "10 4" from reading as "104"
        return (
          <p key={suit} className="whitespace-nowrap font-mono text-xs leading-snug">
            <span className={red(suit) ? "text-[var(--madder)]" : ""}>{GLYPH[suit]}</span>{" "}
            {ranks || <span className="text-neutral-300">—</span>}
          </p>
        );
      })}
    </div>
  );
}

export function HandDiagram({
  hands,
  center,
}: Readonly<{
  hands: Record<Seat, Card[]>;
  /** Optional center content (board number, dealer/vul). */
  center?: ReactNode;
}>) {
  return (
    <div className="grid w-fit grid-cols-3 items-center gap-x-6 gap-y-2">
      <div />
      <SeatHand hand={hands.N} label="North" />
      <div />
      <SeatHand hand={hands.W} label="West" />
      <div className="flex min-h-16 min-w-16 items-center justify-center rounded border border-neutral-200 bg-[var(--card)] p-2 text-center text-[10px] uppercase tracking-wide text-neutral-500">
        {center ?? ""}
      </div>
      <SeatHand hand={hands.E} label="East" />
      <div />
      <SeatHand hand={hands.S} label="South" />
      <div />
    </div>
  );
}
