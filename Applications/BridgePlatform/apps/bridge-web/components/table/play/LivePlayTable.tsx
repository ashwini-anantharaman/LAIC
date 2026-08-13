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
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import type { ActionEvent, Call, Card, Seat } from "@bridge/events";
import { applyEvent, type GameState } from "@bridge/engine";
import { TRICK_PAUSE_MS, type TrickPause } from "@bridge/table-config";
import { TrickHoldProvider } from "../trickHold";
import { bidAction, playCardAction } from "@/app/bridge/table/actions";
import NextLink from "next/link";
import { PlayTable, TableHostProvider, type PlayTableProps } from "@bridge/table-ui";

/** The board as <PlayTable/> wants it: the engine's state minus what it never draws. */
type TableState = PlayTableProps["state"];
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
  trickPause = "tap",
  ...rest
}: Readonly<
  { sessionId: string; coach?: CoachData; trickPause?: TrickPause } & Omit<
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

  /**
   * THE BOARD YOU SEE, WHICH IS AHEAD OF THE ONE THE SERVER HAS CONFIRMED.
   *
   * Every action here is a server action followed by `router.refresh()`, so
   * until this existed a tap did nothing at all for one round trip and then the
   * whole table changed at once: your card vanished from your hand, appeared in
   * the middle, and the row re-centred, in the frame the new HTML landed. On a
   * deployed table that gap is real latency, and it is the jitter — the table
   * lurching a beat after you touch it (owner, 2026-08-12).
   *
   * The fix is not to animate that frame; it is to stop waiting for it. The
   * engine's reducer is PURE and lives in a package the client already has, so
   * the same function the server folds the event with runs here the moment you
   * tap. The card leaves your hand and lands in the trick immediately — which
   * is also what gives the hand's FLIP and the trick's deal-in something to
   * animate — and the server's answer replaces this a round trip later, by
   * which time it agrees, plus whatever the robots did next.
   *
   * React drops the optimistic value when the transition settles, so the server
   * stays authoritative: a rejected play (a race with another actor, a stale
   * board) corrects itself on the refresh rather than sticking.
   */
  const [view, apply] = useOptimistic(rest.state, (state: TableState, event: ActionEvent) =>
    // The reducer is typed on the engine's GameState, which carries a
    // `boardRef` that <PlayTable/>'s presentational prop type omits — the
    // component draws a board, it does not need to know which board. The
    // reducer only ever SPREADS that field through, so seeding it and handing
    // the result back is lossless for every field the table actually reads
    // (state's own value wins when the server did send one).
    applyEvent({ boardRef: "", ...state } as GameState, event) as TableState,
  );

  /** Event metadata the reducer does not read — the server stamps the real ones. */
  const localMeta = { seq: 0, ts: 0, boardRef: "" } as const;

  const run = (
    fn: (fd: FormData) => Promise<void>,
    fields: Record<string, string>,
    local?: ActionEvent,
  ) =>
    start(async () => {
      // Inside the transition, before the await: this is the frame the tap gets.
      if (local) apply(local);
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

  /**
   * THE FINISHED TRICK WAITS. The fourth card lands and the felt holds it —
   * for a tap by default, or for a beat if the player asked for one.
   *
   * `released` is keyed by which trick, not a boolean, so letting one go cannot
   * accidentally let the next one go too: a new trick has a new key and starts
   * held again. The key is the trick COUNT, which is stable while the finished
   * trick sits there — the engine only opens the next trick when a card is
   * played into it.
   *
   * The phase is deliberately not part of the test. On the thirteenth trick the
   * board goes `complete` in the same event, and the owner asked to see that
   * last card land before the result appears.
   */
  const lastTrick = view.tricks[view.tricks.length - 1];
  const trickKey = view.tricks.length;
  const trickDone = !!lastTrick && lastTrick.plays.length === 4;
  const [released, setReleased] = useState(0);
  // A board with nobody sitting at it is being WATCHED, and 13 taps to watch a
  // board is a chore, so an unseated table always runs on the beat.
  const seated = rest.mySeat != null;
  const holdMs = TRICK_PAUSE_MS[trickPause];
  const waitsForTap = seated && holdMs == null;
  const holding = trickDone && released !== trickKey;
  const release = useMemo(() => () => setReleased(trickKey), [trickKey]);

  // The timed pause, and the watcher's. Cleared if the trick moves on first.
  useEffect(() => {
    if (!holding || waitsForTap) return;
    const t = setTimeout(release, holdMs ?? 900);
    return () => clearTimeout(t);
  }, [holding, waitsForTap, holdMs, release]);

  const coachProps: Partial<PlayTableProps> = coach
    ? {
        coachLines: coachLines(coach, layer, advice),
        coachActions: coachActions(coach, { onLayer: setLayer, onTell: tell }),
        coachTitle: "Coach",
      }
    : {};

  // The table family is framework-free; THIS app is the Next host, so it hands
  // the leaves its Link and its router. Without this they fall back to plain
  // <a> + location, which is right for an embed and wrong here.
  return (
    <TableHostProvider
      LinkComponent={NextLink}
      navigate={(href, { replace }) =>
        replace ? router.replace(href, { scroll: false }) : router.push(href)
      }
    >
    <TrickHoldProvider value={{ holding, release }}>
    {/* `display: contents` — the wrapper catches the tap that lets a finished
        trick go WITHOUT becoming a box. <PlayTable/> measures its own container
        to size the felt, so a real div here would be the thing it measured.
        Clicks still bubble through a contents box, which is all this needs;
        and while the trick is held the hand is inert, so a tap that lands on a
        card releases the trick instead of playing into it. */}
    <div style={{ display: "contents" }} onClick={holding ? release : undefined}>
    <PlayTable
      {...rest}
      {...coachProps}
      state={view}
      // Let go = gathered. The centre empties the moment you release it rather
      // than lingering until the next card happens to be played.
      trickCleared={trickDone && !holding}
      trickWaiting={holding && waitsForTap}
      // While a call/play is in flight the board is stale, so stop offering
      // controls that would post a second action against it. The optimistic
      // board has already moved the turn on, which disarms the cards on its
      // own; this also covers the auction and the gap before it commits.
      // A held trick freezes the hand: the winner may be YOU, and leading to
      // the next trick before seeing who took this one is exactly what the
      // hold exists to prevent.
      myTurn={rest.myTurn && !pending && !holding}
      onCall={(call) =>
        run(bidAction, { call }, { ...localMeta, category: "bid-event", seat: rest.mySeat!, call: call as Call, fallback: false })
      }
      onPlay={(seat: Seat, card: Card) =>
        run(
          playCardAction,
          { suit: card.suit, rank: String(card.rank) },
          { ...localMeta, category: "play-event", seat, card, fallback: false },
        )
      }
    />
    </div>
    </TrickHoldProvider>
    </TableHostProvider>
  );
}
