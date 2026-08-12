"use client";

// BridgeTable — a playable bridge table as ONE self-contained component.
//
// This is the embeddable face of the table family. PlayTable is presentational:
// it draws a board and calls back. The Bridge app supplies the missing half —
// the rules, the turn order, the robots — from its server. That is exactly what
// made the table un-embeddable: not the component, but everything around it.
//
// So this owns that half locally. It holds one GameState, folds human actions
// through @bridge/engine's pure reducer (the same game law the platform runs),
// and asks the host's `decide` for the seats the learner is not sitting in.
// There is no server, no session, no fetch and no framework: only React, and a
// deal.
//
// WHAT THE HOST CONFIGURES: the deal (cards, or a seed), the dealer, the
// vulnerability, which seat the learner sits, whether the other hands are face
// up, the skin and layout, and who plays the robots. Everything else the table
// already knew how to do.
//
// WITHOUT `decide` the robots simply do not move — deliberate, and honest: a
// table that invented its own opponents would teach the wrong bridge. A host
// that wants BEN passes a decide() that calls it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEvent,
  initialState,
  legalCalls,
  legalPlays,
  resultLabel,
  scoreBoard,
  seededDeal,
  type GameState,
} from "@bridge/engine";
import type { Call, Card, Seat, Vul } from "@bridge/events";
import { resolveSkin, type AppearanceOverrides, type TableAppearance } from "@bridge/table-config";
import { PlayTable } from "@bridge/table-ui";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

/** What a host's robot answers with — a call in the auction, a card in play. */
export interface BridgeDecision {
  call?: Call;
  card?: Card;
}

/** Asked for one seat's action. Any transport: BEN over HTTP, a script, a bot. */
export type BridgeDecide = (
  state: GameState,
  seat: Seat,
) => Promise<BridgeDecision | null> | BridgeDecision | null;

export interface BridgeTableProps {
  /** The deal. Give cards outright, or a seed to derive them deterministically. */
  deal?: Record<Seat, Card[]>;
  seed?: number;
  dealer?: Seat;
  vul?: Vul;
  /** The seat the learner sits. Default South. */
  humanSeat?: Seat;
  /** Face up: the learner's hand always; the dummy once play starts. */
  showAllHands?: boolean;
  /**
   * Skin name, the layout knobs, and the five colour overrides — the platform's
   * own appearance vocabulary, so a look configured there reads the same here.
   */
  appearance?: Partial<Omit<TableAppearance, "overrides">> & {
    overrides?: AppearanceOverrides;
  };
  /** The other three seats. Omitted, they wait. */
  decide?: BridgeDecide;
  /** Milliseconds to pause before a robot acts, so a board can be followed. */
  robotDelayMs?: number;
  showCoach?: boolean;
  coachShare?: number;
  /** Fires once, when the last trick has resolved. */
  onComplete?: (state: GameState) => void;
  /**
   * Fires on EVERY position, the first included. A wrapper needs this when the
   * board it is running ends somewhere other than the last trick — a
   * bidding-only challenge board is over the moment the auction closes, and
   * `onComplete` would never fire at all there.
   */
  onState?: (state: GameState) => void;
}

export function BridgeTable({
  deal,
  seed = 1,
  dealer = "N",
  vul = "none",
  humanSeat = "S",
  showAllHands = false,
  appearance,
  decide,
  robotDelayMs = 350,
  showCoach = false,
  coachShare,
  onComplete,
  onState,
}: Readonly<BridgeTableProps>) {
  const hands = useMemo(() => deal ?? seededDeal(seed), [deal, seed]);

  const [state, setState] = useState<GameState>(() =>
    initialState("embed", dealer, vul, hands),
  );
  // A new deal is a new board, not a mutation of this one.
  const dealKey = `${dealer}:${vul}:${seed}:${hands.N.length}:${hands.N[0]?.suit ?? ""}${hands.N[0]?.rank ?? ""}`;
  const lastKey = useRef(dealKey);
  useEffect(() => {
    if (lastKey.current === dealKey) return;
    lastKey.current = dealKey;
    seq.current = 0;
    setState(initialState("embed", dealer, vul, hands));
  }, [dealKey, dealer, vul, hands]);

  const seq = useRef(0);
  const commitCall = useCallback((seat: Seat, call: Call) => {
    setState((s) =>
      applyEvent(s, {
        category: "bid-event",
        seq: (seq.current += 1),
        ts: Date.now(),
        boardRef: s.boardRef,
        seat,
        call,
        fallback: false,
      }),
    );
  }, []);
  const commitPlay = useCallback((seat: Seat, card: Card) => {
    setState((s) =>
      applyEvent(s, {
        category: "play-event",
        seq: (seq.current += 1),
        ts: Date.now(),
        boardRef: s.boardRef,
        seat,
        card,
        fallback: false,
      }),
    );
  }, []);

  const declarer = state.contract?.declarer ?? null;
  const dummy = declarer && state.phase !== "auction" ? PARTNER[declarer] : null;

  /**
   * THE LEARNER NEVER SITS OUT.
   *
   * Bridge law gives dummy's cards to the declarer, so a learner whose partner
   * wins the contract is, by the book, a spectator for thirteen tricks: the
   * engine already routes dummy's cards to the declarer's controller, and that
   * controller is a robot. Correct, and useless to someone here to practise.
   *
   * So when the auction leaves the learner as dummy they change places with
   * their partner and declare the contract themselves — one seat over, both
   * hands theirs to play, which is the position the declarer was always going
   * to be in. Nothing about the DEAL moves; only who is holding the cards.
   *
   * This can only ever fire in play (`dummy` is null until the contract is
   * settled), so the auction is always bid from the seat the learner was dealt.
   */
  const playSeat = dummy === humanSeat && declarer ? declarer : humanSeat;
  const swappedWithPartner = playSeat !== humanSeat;

  /** The learner plays their own seat — and the dummy, when they are declarer. */
  const humanControls = useCallback(
    (seat: Seat) =>
      seat === playSeat || (seat === dummy && declarer === playSeat),
    [playSeat, dummy, declarer],
  );
  const myTurn = state.phase !== "complete" && humanControls(state.turn);

  // ── robots ────────────────────────────────────────────────────────────────
  // One in flight at a time, and every answer is checked against the position
  // it arrives into: an async decider can always land on a board that moved.
  const busy = useRef(false);
  useEffect(() => {
    if (!decide || myTurn || state.phase === "complete" || busy.current) return;
    const seat = state.turn;
    const asked = state;
    busy.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, robotDelayMs));
        if (cancelled) return;
        const answer = await decide(asked, seat);
        if (cancelled || !answer) return;
        setState((s) => {
          // The board moved under the answer — drop it rather than force it.
          if (s !== asked && s.turn !== seat) return s;
          if (answer.call && s.phase === "auction") {
            if (!legalCalls(s.auction, seat).has(answer.call)) return s;
            return applyEvent(s, {
              category: "bid-event",
              seq: (seq.current += 1),
              ts: Date.now(),
              boardRef: s.boardRef,
              seat,
              call: answer.call,
              fallback: false,
            });
          }
          if (answer.card && s.phase === "play") {
            const legal = legalPlays(s, seat);
            const ok = legal.some(
              (c) => c.suit === answer.card!.suit && c.rank === answer.card!.rank,
            );
            if (!ok) return s;
            return applyEvent(s, {
              category: "play-event",
              seq: (seq.current += 1),
              ts: Date.now(),
              boardRef: s.boardRef,
              seat,
              card: answer.card,
              fallback: false,
            });
          }
          return s;
        });
      } finally {
        busy.current = false;
      }
    };
    void run();
    return () => {
      cancelled = true;
      busy.current = false;
    };
  }, [decide, myTurn, state, robotDelayMs]);

  // The position, every time it moves. Held in a ref so a host that passes an
  // inline arrow does not re-fire the effect on its own re-renders.
  const stateSink = useRef(onState);
  stateSink.current = onState;
  useEffect(() => {
    stateSink.current?.(state);
  }, [state]);

  const done = useRef(false);
  useEffect(() => {
    if (state.phase !== "complete" || done.current) return;
    done.current = true;
    onComplete?.(state);
  }, [state, onComplete]);

  // ── what the table draws ──────────────────────────────────────────────────
  const look = useMemo(() => {
    const tokens = resolveSkin(appearance?.skin ?? "bbo", appearance?.overrides);
    return {
      ...tokens,
      handLayout: appearance?.handLayout ?? "row",
      bidPad: appearance?.bidPad ?? "grid",
      centreFrame: appearance?.centreFrame ?? false,
      fanSpread: appearance?.fanSpread ?? 56,
      fanRadius: appearance?.fanRadius ?? 0,
    };
  }, [appearance]);

  const visible = useMemo(() => {
    const out = {} as Record<Seat, boolean>;
    for (const seat of SEATS)
      out[seat] = showAllHands || seat === playSeat || seat === dummy;
    return out;
  }, [showAllHands, playSeat, dummy]);

  const seats = useMemo(() => {
    const out = {} as Record<Seat, { name: string; tag?: string; human?: boolean }>;
    for (const seat of SEATS)
      out[seat] = {
        // "You" follows the cards, not the chair. After a swap the seat the
        // learner was dealt is the dummy across the table, and it takes that
        // seat's own name — the learner is playing from the other one now, and
        // two seats both labelled "You" would say nothing about who acts.
        name: seat === playSeat ? "You" : SEAT_NAME[seat],
        // A swap must not be silent: the learner bid this auction from the
        // other chair, so the seat they left is marked as theirs rather than
        // just appearing to be somebody else's hand.
        tag:
          seat === dummy
            ? swappedWithPartner && seat === humanSeat
              ? "your seat · dummy"
              : "dummy"
            : undefined,
        human: seat === playSeat,
      };
    return out;
  }, [playSeat, dummy, swappedWithPartner, humanSeat]);

  const score = state.phase === "complete" ? scoreBoard(state) : null;

  return (
    <PlayTable
      state={state}
      seats={seats}
      visible={visible}
      mySeat={humanSeat}
      myTurn={myTurn}
      legalCalls={
        state.phase === "auction" && myTurn ? [...legalCalls(state.auction, state.turn)] : []
      }
      legalPlays={state.phase === "play" && myTurn ? legalPlays(state, state.turn) : []}
      appearance={look}
      showCoach={showCoach}
      {...(coachShare === undefined ? {} : { coachShare })}
      resultLine={score ? resultLabel(score) : ""}
      resultScore={
        score ? `${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}` : ""
      }
      onCall={(call) => {
        if (myTurn) commitCall(state.turn, call as Call);
      }}
      onPlay={(_seat, card) => {
        if (myTurn) commitPlay(state.turn, card);
      }}
    />
  );
}
