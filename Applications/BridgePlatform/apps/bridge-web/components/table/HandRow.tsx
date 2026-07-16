// A seat's hand (2026-07-16 table rework). North/South render as overlapping
// card rows; East/West render as a back stack when hidden and as compact
// suit rows when visible (13 stacked card faces don't fit a side column, and
// suit rows are what a fellow reads fastest). Legal cards are live buttons.

import type { Card, Hand, Suit } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import type { ReactNode } from "react";
import { playCardAction } from "@/app/bridge/table/actions";
import { PlayingCard, type CardSize } from "./PlayingCard";

// Alternating-color display order, ♠ ♥ ♣ ♦ (matches the reference table).
const DISPLAY_SUITS: Suit[] = ["S", "H", "C", "D"];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (s: Suit) => s === "H" || s === "D";

export function sortedHand(hand: Hand): Card[] {
  return DISPLAY_SUITS.flatMap((suit) =>
    hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank),
  );
}

function cardForm(
  card: Card,
  sessionId: string,
  children: ReactNode,
  className: string,
) {
  return (
    <form key={`${card.suit}${card.rank}`} action={playCardAction} className="contents">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="suit" value={card.suit} />
      <input type="hidden" name="rank" value={card.rank} />
      <button type="submit" className={className} aria-label={`Play ${rankLabel(card.rank)}${GLYPH[card.suit]}`}>
        {children}
      </button>
    </form>
  );
}

/** Compact suit rows for visible side hands (East/West, incl. dummy). */
function SuitRows({
  hand,
  playable,
  sessionId,
}: Readonly<{ hand: Hand; playable: Card[] | null; sessionId: string }>) {
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  return (
    <div className="w-24 space-y-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 shadow-sm">
      {DISPLAY_SUITS.map((suit) => {
        const cards = hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank);
        return (
          <p key={suit} className="flex flex-wrap items-center gap-x-1 text-sm leading-tight">
            <span className={red(suit) ? "text-[var(--madder)]" : "text-neutral-900"}>
              {GLYPH[suit]}
            </span>
            {cards.map((card) => {
              const id = `${card.suit}${card.rank}`;
              const label = (
                <span
                  className={`font-medium tabular-nums ${red(suit) ? "text-[var(--madder)]" : ""}`}
                >
                  {rankLabel(card.rank)}
                </span>
              );
              if (playable && legal.has(id)) {
                return cardForm(
                  card,
                  sessionId,
                  label,
                  "rounded border border-emerald-400 bg-emerald-50 px-1 leading-tight hover:bg-emerald-100",
                );
              }
              return (
                <span key={id} className={playable ? "opacity-35" : ""}>
                  {label}
                </span>
              );
            })}
            {cards.length === 0 && <span className="text-neutral-300">—</span>}
          </p>
        );
      })}
    </div>
  );
}

export function HandRow({
  hand,
  hidden,
  playable,
  sessionId,
  size = "md",
  vertical = false,
}: Readonly<{
  hand: Hand;
  hidden: boolean;
  /** Legal cards for this seat right now (null = not this seat's turn). */
  playable: Card[] | null;
  sessionId: string;
  size?: CardSize;
  vertical?: boolean;
}>) {
  // ---- hidden hands: a stack of backs + count -----------------------------
  if (hidden) {
    const backs = Math.min(hand.length, 13);
    if (vertical) {
      return (
        <div className="flex flex-col items-center">
          <div className="flex flex-col [&>*:not(:first-child)]:-mt-8">
            {Array.from({ length: backs }, (_, i) => (
              <PlayingCard key={i} faceDown size="sm" />
            ))}
          </div>
          <span className="mt-1 text-[10px] text-neutral-400">{hand.length}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="flex [&>*:not(:first-child)]:-ml-6">
          {Array.from({ length: backs }, (_, i) => (
            <PlayingCard key={i} faceDown size="sm" />
          ))}
        </div>
        <span className="text-[10px] text-neutral-400">{hand.length}</span>
      </div>
    );
  }

  // ---- visible side hands: compact suit rows ------------------------------
  if (vertical) {
    return <SuitRows hand={hand} playable={playable} sessionId={sessionId} />;
  }

  // ---- visible N/S hands: the overlapping card row -------------------------
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  const cards = sortedHand(hand);
  return (
    <div className="flex pt-2 [&>*:not(:first-child)]:-ml-6 sm:[&>*:not(:first-child)]:-ml-7">
      {cards.map((card) => {
        const id = `${card.suit}${card.rank}`;
        if (playable && legal.has(id)) {
          return cardForm(
            card,
            sessionId,
            <PlayingCard card={card} size={size} />,
            "-translate-y-1.5 cursor-pointer rounded-md transition-transform hover:-translate-y-3 focus-visible:-translate-y-3",
          );
        }
        return <PlayingCard key={id} card={card} size={size} muted={playable !== null} />;
      })}
      {cards.length === 0 && <span className="text-xs text-neutral-300">—</span>}
    </div>
  );
}
