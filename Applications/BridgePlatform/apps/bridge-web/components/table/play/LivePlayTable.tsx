"use client";

// Binds <PlayTable/> to a real session: turns the component's callbacks into
// the existing server actions and refreshes the route afterwards.
//
// Kept separate from PlayTable so the component itself stays presentational —
// that is what lets the demo page mount three of them with no server at all.
//
// It also owns the COACH's client state (phase-2 transplant: his engine, our
// shell). The server hands down `coach` — his looking/think layers as data —
// and this holds which layer is showing and the on-demand hint fetch, deriving
// the lines/actions OUR CoachPanel draws. The panel stays a dumb shell.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Card, Seat } from "@bridge/events";
import { bidAction, playCardAction } from "@/app/bridge/table/actions";
import { PlayTable, type PlayTableProps } from "@bridge/table-ui";
import {
  AUCTION_ADVICE_PENDING,
  coachActions,
  coachLines,
  type CoachAdvice,
  type CoachData,
  type CoachHint,
  type CoachLayer,
} from "./coachContent";

export function LivePlayTable({
  sessionId,
  coach,
  ...rest
}: Readonly<
  { sessionId: string; coach?: CoachData } & Omit<
    PlayTableProps,
    "onCall" | "onPlay" | "coachLines" | "coachActions"
  >
>) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // The coach's layer (which of his three answers is on screen) and the hint
  // fetch. Default to "looking" — the no-authority facts are always safe to show
  // the moment there is a seat, so the panel is never blank while a board runs.
  const [layer, setLayer] = useState<CoachLayer>("looking");
  const [advice, setAdvice] = useState<CoachAdvice>({ kind: "idle" });

  const run = (fn: (fd: FormData) => Promise<void>, fields: Record<string, string>) =>
    start(async () => {
      const fd = new FormData();
      fd.set("sessionId", sessionId);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      await fn(fd);
      router.refresh();
    });

  // "What should I play?" — his advice, on demand. The client sends only a
  // session id; the route resolves the caller's seat and hand server-side.
  async function tell() {
    setLayer("advice");
    if (!coach || coach.phase === "auction") {
      setAdvice(AUCTION_ADVICE_PENDING);
      return;
    }
    setAdvice({ kind: "loading" });
    try {
      const res = await fetch(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as { hint?: CoachHint | null; reason?: string };
      setAdvice(
        body.hint?.best?.length
          ? { kind: "done", hint: body.hint }
          : { kind: "empty", reason: body.reason ?? "no answer" },
      );
    } catch {
      setAdvice({ kind: "empty", reason: "unreachable" });
    }
  }

  const coachProps: Partial<PlayTableProps> = coach
    ? {
        coachLines: coachLines(coach, layer, advice),
        coachActions: coachActions(coach, { onLayer: setLayer, onTell: tell }),
        coachTitle: "Coach",
      }
    : {};

  return (
    <PlayTable
      {...rest}
      {...coachProps}
      // While a call/play is in flight the board is stale, so stop offering
      // controls that would post a second action against it.
      myTurn={rest.myTurn && !pending}
      onCall={(call) => run(bidAction, { call })}
      onPlay={(_seat: Seat, card: Card) => run(playCardAction, { suit: card.suit, rank: String(card.rank) })}
    />
  );
}
