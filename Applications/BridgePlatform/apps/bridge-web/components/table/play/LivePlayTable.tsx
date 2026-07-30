"use client";

// Binds <PlayTable/> to a real session: turns the component's callbacks into
// the existing server actions and refreshes the route afterwards.
//
// Kept separate from PlayTable so the component itself stays presentational —
// that is what lets the demo page mount three of them with no server at all.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Card, Seat } from "@bridge/events";
import { bidAction, newDealAction, playCardAction } from "@/app/bridge/table/actions";
import { PlayTable, type PlayTableProps } from "./PlayTable";

export function LivePlayTable({
  sessionId,
  ...rest
}: Readonly<{ sessionId: string } & Omit<PlayTableProps, "onCall" | "onPlay" | "onNewDeal">>) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: (fd: FormData) => Promise<void>, fields: Record<string, string>) =>
    start(async () => {
      const fd = new FormData();
      fd.set("sessionId", sessionId);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      await fn(fd);
      router.refresh();
    });

  return (
    <PlayTable
      {...rest}
      // While a call/play is in flight the board is stale, so stop offering
      // controls that would post a second action against it.
      myTurn={rest.myTurn && !pending}
      onCall={(call) => run(bidAction, { call })}
      onPlay={(_seat: Seat, card: Card) => run(playCardAction, { suit: card.suit, rank: String(card.rank) })}
      onNewDeal={() => run(newDealAction, {})}
    />
  );
}
