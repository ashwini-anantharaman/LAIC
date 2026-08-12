// The native table's session store (Part II Phase A).
//
// ONE source of truth per mounted table: the server's bootstrap (GET view —
// every POLICY answer, resolved there, never re-derived here) plus the event
// log, folded locally through the vendored LAW kernel. The derived GameState
// is a pure function of (dealt hands, action events ≤ head), which is what
// makes a page load, a poll and a resync all produce the same frame.
//
// Hidden hands arrive EMPTY (the view masks by visibility), so the fold
// tracks tricks/auction/turn for everyone but only holds cards the viewer may
// see; a hidden seat's remaining count is 13 minus its plays. When new events
// cross a visibility boundary (the opening lead spreads dummy; completion
// opens everything), the store refetches the bootstrap — visibility is the
// server's answer, refreshed, never guessed.
//
// Phase A is VIEW-ONLY: a light poll keeps a live board honest while someone
// else (a web tab, the robots stepped from elsewhere) moves it. Acting,
// stepping and undo land in phases B–C on this same store.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
  applyEvent,
  initialState,
  isActionEvent,
  type ActionEvent,
  type Card,
  type GameEvent,
  type GameState,
  type Seat,
  type Vul,
} from "../vendor/table-kernel/table-kernel";
import { bridgeRequest } from "../bridge-api";

// ── Wire shapes (what the T0 routes serialize) ──────────────────────────────

export type TableControl = Record<string, boolean>;

export interface TableBootstrap {
  session: { sessionId: string; status: string; kbId: string; strictBen: boolean };
  board: { name: string; number: string; dealer: Seat; vul: Vul };
  headSeq: number;
  state: GameState;
  dealtHands: Record<Seat, Card[]>;
  actingSeat: Seat;
  actingIsHuman: boolean;
  playedOut: boolean;
  biddingOnly: boolean;
  auctionWasTheBoard: boolean;
  boardOver: boolean;
  mySeat: Seat | null;
  dummy: Seat | null;
  takeover: boolean;
  declaringSeat: Seat | null;
  myTurn: boolean;
  canSeeAllHands: boolean;
  showAll: boolean;
  visible: Record<Seat, boolean>;
  control: TableControl;
  appearance: unknown;
  seats: Record<Seat, { name: string; strip: string; human: boolean; tag: string }>;
  seatNames: Record<Seat, string>;
  roster: { playerId: string; name: string; validationStatus: string }[];
  challenge: {
    challengeId: string;
    boardNo: number;
    biddingOnly: boolean;
    subtitle: string;
    done: boolean;
    onward: { label: string; href: string; note?: string };
  } | null;
}

interface Envelope {
  events: GameEvent[];
  headSeq: number;
  status: string;
  state: GameState;
  actingSeat: Seat;
  actingIsHuman: boolean;
  complete: boolean;
}

// ── The store ────────────────────────────────────────────────────────────────

interface StoreState {
  bootstrap: TableBootstrap | null;
  /** Confirmed ACTION events, seq-ascending — the fold's input. */
  actions: ActionEvent[];
  confirmedSeq: number;
  error: string | null;
}

type Msg =
  | { kind: "bootstrap"; bootstrap: TableBootstrap; actions: ActionEvent[] }
  | { kind: "append"; actions: ActionEvent[]; headSeq: number }
  | { kind: "error"; error: string };

function reduce(state: StoreState, msg: Msg): StoreState {
  switch (msg.kind) {
    case "bootstrap":
      return {
        bootstrap: msg.bootstrap,
        actions: msg.actions,
        confirmedSeq: msg.bootstrap.headSeq,
        error: null,
      };
    case "append": {
      // The confirmed prefix is immutable — only genuinely-new events append.
      const fresh = msg.actions.filter((e) => e.seq > state.confirmedSeq);
      if (!fresh.length && msg.headSeq === state.confirmedSeq) return state;
      return {
        ...state,
        actions: [...state.actions, ...fresh],
        confirmedSeq: msg.headSeq,
        error: null,
      };
    }
    case "error":
      return { ...state, error: msg.error };
  }
}

/** How often a live board asks "did anything happen?" while view-only. */
const POLL_MS = 2_500;

export interface TableSession {
  bootstrap: TableBootstrap | null;
  /** The folded frame — null until the bootstrap lands. */
  state: GameState | null;
  /** 13 minus plays — how many card backs a hidden seat shows. */
  remainingCount: (seat: Seat) => number;
  error: string | null;
  /** Full re-bootstrap: visibility boundaries, gaps, foregrounds. */
  resync: () => Promise<void>;
}

export function useTableSession(
  token: string | null,
  programId: string,
  sessionId: string,
): TableSession {
  const [store, dispatch] = useReducer(reduce, {
    bootstrap: null,
    actions: [],
    confirmedSeq: -1,
    error: null,
  });
  const busy = useRef(false);
  const live = useRef(true);

  const resync = useCallback(async () => {
    if (!token || busy.current) return;
    busy.current = true;
    try {
      const bootstrap = await bridgeRequest<TableBootstrap>(
        `/api/bridge/sessions/${encodeURIComponent(sessionId)}/view`,
        { token, programId },
      );
      const env = await bridgeRequest<Envelope>(
        `/api/bridge/sessions/${encodeURIComponent(sessionId)}/events`,
        { token, programId },
      );
      if (!live.current) return;
      dispatch({
        kind: "bootstrap",
        bootstrap,
        actions: env.events.filter(isActionEvent).sort((a, b) => a.seq - b.seq),
      });
    } catch (e) {
      if (live.current)
        dispatch({ kind: "error", error: e instanceof Error ? e.message : "Couldn't load the board." });
    } finally {
      busy.current = false;
    }
  }, [token, programId, sessionId]);

  /** Catch up past the cursor; re-bootstrap when a boundary was crossed. */
  const poll = useCallback(async () => {
    if (!token || busy.current || !store.bootstrap) return;
    try {
      const env = await bridgeRequest<Envelope>(
        `/api/bridge/sessions/${encodeURIComponent(sessionId)}/events?since=${store.confirmedSeq}`,
        { token, programId },
      );
      if (!live.current) return;
      // The log SHRANK (an undo elsewhere): the fold's prefix is no longer
      // true — rebuild from scratch.
      if (env.headSeq < store.confirmedSeq) {
        await resync();
        return;
      }
      const fresh = env.events.filter(isActionEvent);
      if (!fresh.length) return;
      // Visibility boundaries live server-side: the opening lead spreads
      // dummy, completion opens every hand. Cross one → ask again.
      const hadPlay = store.actions.some((e) => e.category === "play-event");
      const gainsPlay = fresh.some((e) => e.category === "play-event");
      const completes = env.complete && !store.bootstrap.playedOut;
      if ((gainsPlay && !hadPlay) || completes) {
        await resync();
        return;
      }
      dispatch({ kind: "append", actions: fresh, headSeq: env.headSeq });
    } catch {
      // A missed poll costs nothing — the next one catches up.
    }
  }, [token, programId, sessionId, store.bootstrap, store.confirmedSeq, store.actions, resync]);

  useEffect(() => {
    live.current = true;
    void resync();
    return () => {
      live.current = false;
    };
  }, [resync]);

  useEffect(() => {
    if (!store.bootstrap || store.bootstrap.boardOver) return;
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [store.bootstrap, poll]);

  // The pure fold: dealt hands + confirmed action events → the frame.
  const state = useMemo(() => {
    const b = store.bootstrap;
    if (!b) return null;
    let s = initialState(b.board.name, b.board.dealer, b.board.vul, b.dealtHands);
    for (const event of store.actions) s = applyEvent(s, event);
    return s;
  }, [store.bootstrap, store.actions]);

  const remainingCount = useCallback(
    (seat: Seat) =>
      13 - store.actions.filter((e) => e.category === "play-event" && e.seat === seat).length,
    [store.actions],
  );

  return { bootstrap: store.bootstrap, state, remainingCount, error: store.error, resync };
}
