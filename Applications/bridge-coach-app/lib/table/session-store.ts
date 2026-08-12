// The native table's session store (Part II — Phase A view, Phase B play).
//
// ONE source of truth per mounted table: the server's bootstrap (GET view —
// every POLICY answer, resolved there, never re-derived here) plus the event
// log, folded locally through the vendored LAW kernel. The derived GameState
// is a pure function of (dealt hands, action events ≤ head, optimistic
// tail), which is what makes a page load, a poll, an optimistic tap and a
// resync all produce the same frame.
//
// THE OPTIMISTIC PATH (Phase B): a tap is legality-checked by the kernel and
// applied to the frame IN THE SAME RENDER; the POST carries the caller's
// cursor and answers with the authoritative events, which replace the
// optimistic tail. The engine is deterministic and shared, so the re-fold is
// pixel-identical — no flicker. Three failure shapes, one recovery:
//   (a) HTTP/legality rejection → drop the tail, surface the reason;
//   (b) a seq gap (someone else moved) → catch up from the cursor;
//   (c) headSeq BELOW the cursor (an undo raced us) → full re-bootstrap.
//
// Hidden hands arrive EMPTY (the view masks by visibility), so the fold
// tracks tricks/auction/turn for everyone but only holds cards the viewer
// may see. Crossing a policy boundary — the auction ends (takeover may
// begin), the opening lead (dummy spreads), completion (all face-up) —
// re-asks the server; visibility is never guessed.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
  applyEvent,
  initialState,
  isActionEvent,
  legalCalls,
  legalPlays,
  type ActionEvent,
  type Call,
  type Card,
  type GameEvent,
  type GameState,
  type Seat,
  type Vul,
} from "../vendor/table-kernel/table-kernel";
import { BridgeApiError, bridgeRequest } from "../bridge-api";

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

interface TurnFacts {
  actingSeat: Seat;
  actingIsHuman: boolean;
}

interface StoreState {
  bootstrap: TableBootstrap | null;
  /** Confirmed ACTION events, seq-ascending — the fold's immutable prefix. */
  actions: ActionEvent[];
  confirmedSeq: number;
  /** The tap the server hasn't confirmed yet (at most one in flight). */
  optimistic: ActionEvent | null;
  /** Latest turn facts — the bootstrap's, then every envelope's. */
  turn: TurnFacts | null;
  error: string | null;
  /** A rejected act's reason — the toast's text, cleared by the next tap. */
  actError: string | null;
}

type Msg =
  | { kind: "bootstrap"; bootstrap: TableBootstrap; actions: ActionEvent[] }
  | { kind: "append"; actions: ActionEvent[]; headSeq: number; turn: TurnFacts }
  | { kind: "optimistic"; event: ActionEvent }
  | { kind: "settle"; actions: ActionEvent[]; headSeq: number; turn: TurnFacts }
  | { kind: "reject"; reason: string }
  | { kind: "error"; error: string };

function reduce(state: StoreState, msg: Msg): StoreState {
  switch (msg.kind) {
    case "bootstrap":
      return {
        bootstrap: msg.bootstrap,
        actions: msg.actions,
        confirmedSeq: msg.bootstrap.headSeq,
        optimistic: null,
        turn: {
          actingSeat: msg.bootstrap.actingSeat,
          actingIsHuman: msg.bootstrap.actingIsHuman,
        },
        error: null,
        actError: state.actError,
      };
    case "append": {
      const fresh = msg.actions.filter((e) => e.seq > state.confirmedSeq);
      if (!fresh.length && msg.headSeq === state.confirmedSeq) return state;
      return {
        ...state,
        actions: [...state.actions, ...fresh],
        confirmedSeq: msg.headSeq,
        turn: msg.turn,
        error: null,
      };
    }
    case "optimistic":
      return { ...state, optimistic: msg.event, actError: null };
    case "settle": {
      // The authoritative events REPLACE the optimistic tail — same engine,
      // same order, identical frame.
      const fresh = msg.actions.filter((e) => e.seq > state.confirmedSeq);
      return {
        ...state,
        actions: [...state.actions, ...fresh],
        confirmedSeq: msg.headSeq,
        optimistic: null,
        turn: msg.turn,
        error: null,
      };
    }
    case "reject":
      return { ...state, optimistic: null, actError: msg.reason };
    case "error":
      return { ...state, error: msg.error };
  }
}

/** How often a live board asks "did anything happen?". */
const POLL_MS = 2_500;

export interface TableSession {
  bootstrap: TableBootstrap | null;
  /** The folded frame (confirmed ⊕ optimistic) — null until bootstrap lands. */
  state: GameState | null;
  /** 13 minus plays — how many card backs a hidden seat shows. */
  remainingCount: (seat: Seat) => number;
  /** May the viewer act RIGHT NOW (their turn, nothing in flight)? */
  myTurn: boolean;
  /** The seat whose action is next — under a takeover, the declarer's chair. */
  actingSeat: Seat | null;
  /** Legal moves for the acting seat, when it's the viewer's. */
  legalCallSet: Set<Call>;
  legalPlayList: Card[];
  /** A tap is on its way to the server. */
  pending: boolean;
  /** Why the last tap was refused — cleared by the next one. */
  actError: string | null;
  error: string | null;
  /** Make a call or play a card — optimistic, legality-checked locally. */
  act: (action: { call?: Call; card?: Card }) => Promise<void>;
  /** Full re-bootstrap: policy boundaries, gaps, undo races, foregrounds. */
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
    optimistic: null,
    turn: null,
    error: null,
    actError: null,
  });
  const busy = useRef(false);
  const live = useRef(true);
  const storeRef = useRef(store);
  storeRef.current = store;

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
        dispatch({
          kind: "error",
          error: e instanceof Error ? e.message : "Couldn't load the board.",
        });
    } finally {
      busy.current = false;
    }
  }, [token, programId, sessionId]);

  /** Fold an envelope in; re-bootstrap when a POLICY boundary was crossed
   *  (auction ended → takeover may begin; first play → dummy spreads;
   *  completion → everything face-up) or the log SHRANK (an undo raced). */
  const applyEnvelope = useCallback(
    async (env: Envelope, via: "poll" | "settle") => {
      const s = storeRef.current;
      if (env.headSeq < s.confirmedSeq) {
        await resync();
        return;
      }
      const fresh = env.events.filter(isActionEvent);
      const turn = { actingSeat: env.actingSeat, actingIsHuman: env.actingIsHuman };
      if (via === "settle") {
        dispatch({ kind: "settle", actions: fresh, headSeq: env.headSeq, turn });
      } else {
        if (!fresh.length) return;
        dispatch({ kind: "append", actions: fresh, headSeq: env.headSeq, turn });
      }
      // Boundary detection runs on the WIRE facts, not the fold: an auction
      // that just closed or a board that just completed changes visibility
      // and (maybe) the takeover — the server owns both answers.
      const before = s.bootstrap;
      const crossed =
        !!before &&
        ((env.state.phase !== "auction" && before.state.phase === "auction") ||
          (env.complete && !before.playedOut) ||
          fresh.some(
            (e) => e.category === "play-event" && !s.actions.some((a) => a.category === "play-event"),
          ));
      if (crossed) await resync();
    },
    [resync],
  );

  const poll = useCallback(async () => {
    const s = storeRef.current;
    if (!token || busy.current || !s.bootstrap || s.optimistic) return;
    try {
      const env = await bridgeRequest<Envelope>(
        `/api/bridge/sessions/${encodeURIComponent(sessionId)}/events?since=${s.confirmedSeq}`,
        { token, programId },
      );
      if (!live.current) return;
      await applyEnvelope(env, "poll");
    } catch {
      // A missed poll costs nothing — the next one catches up.
    }
  }, [token, programId, sessionId, applyEnvelope]);

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

  // The pure fold: dealt hands + confirmed actions (+ the optimistic tap).
  const state = useMemo(() => {
    const b = store.bootstrap;
    if (!b) return null;
    let s = initialState(b.board.name, b.board.dealer, b.board.vul, b.dealtHands);
    for (const event of store.actions) s = applyEvent(s, event);
    if (store.optimistic) s = applyEvent(s, store.optimistic);
    return s;
  }, [store.bootstrap, store.actions, store.optimistic]);

  // WHOSE TURN, from the wire's facts + the bootstrap's identity. Under a
  // takeover the acting seat is the declarer's chair, which the server said
  // is the viewer's to play (myTurn at bootstrap; re-asked at every
  // boundary). Anything in flight suspends the controls.
  const b = store.bootstrap;
  const turn = store.turn;
  const myTurn =
    !!b &&
    !!turn &&
    !store.optimistic &&
    !b.boardOver &&
    turn.actingIsHuman &&
    (turn.actingSeat === b.mySeat || (b.takeover && turn.actingSeat === b.declaringSeat));

  const legalCallSet = useMemo(() => {
    if (!state || !myTurn || state.phase !== "auction") return new Set<Call>();
    return legalCalls(state.auction, state.turn);
  }, [state, myTurn]);

  const legalPlayList = useMemo(() => {
    if (!state || !myTurn || state.phase !== "play") return [];
    return legalPlays(state, state.turn);
  }, [state, myTurn]);

  const act = useCallback(
    async (action: { call?: Call; card?: Card }) => {
      const s = storeRef.current;
      const frame = state;
      if (!token || !s.bootstrap || !frame || s.optimistic) return;

      // Kernel legality FIRST — an illegal tap never travels.
      if (action.call !== undefined) {
        if (!legalCalls(frame.auction, frame.turn).has(action.call)) {
          dispatch({ kind: "reject", reason: "That call isn't legal here." });
          return;
        }
      } else if (action.card) {
        const ok = legalPlays(frame, frame.turn).some(
          (c) => c.suit === action.card!.suit && c.rank === action.card!.rank,
        );
        if (!ok) {
          dispatch({ kind: "reject", reason: "That card can't be played now." });
          return;
        }
      } else {
        return;
      }

      // The optimistic event: same frame, this render. Seq is provisional —
      // the fold never reads it; the settle replaces the whole tail.
      const optimistic = (
        action.call !== undefined
          ? {
              seq: s.confirmedSeq + 1,
              ts: 0,
              boardRef: frame.boardRef,
              category: "bid-event" as const,
              seat: frame.turn,
              call: action.call,
              fallback: false,
            }
          : {
              seq: s.confirmedSeq + 1,
              ts: 0,
              boardRef: frame.boardRef,
              category: "play-event" as const,
              seat: frame.turn,
              card: action.card!,
              fallback: false,
            }
      ) as ActionEvent;
      dispatch({ kind: "optimistic", event: optimistic });

      try {
        const env = await bridgeRequest<Envelope>(
          `/api/bridge/sessions/${encodeURIComponent(sessionId)}/actions`,
          {
            token,
            programId,
            method: "POST",
            body: { ...action, sinceSeq: s.confirmedSeq },
          },
        );
        if (!live.current) return;
        await applyEnvelope(env, "settle");
      } catch (e) {
        if (!live.current) return;
        dispatch({
          kind: "reject",
          reason:
            e instanceof BridgeApiError ? e.message : "That didn't reach the table — try again.",
        });
        // The server may have moved without us (our POST lost a race) —
        // catch up so the dropped tail doesn't leave a stale frame.
        await poll();
      }
    },
    [token, programId, sessionId, state, applyEnvelope, poll],
  );

  const remainingCount = useCallback(
    (seat: Seat) =>
      13 -
      storeRef.current.actions.filter((e) => e.category === "play-event" && e.seat === seat)
        .length -
      (storeRef.current.optimistic?.category === "play-event" &&
      storeRef.current.optimistic.seat === seat
        ? 1
        : 0),
    [store.actions, store.optimistic],
  );

  return {
    bootstrap: b,
    state,
    remainingCount,
    myTurn,
    actingSeat: turn?.actingSeat ?? null,
    legalCallSet,
    legalPlayList,
    pending: !!store.optimistic,
    actError: store.actError,
    error: store.error,
    act,
    resync,
  };
}
