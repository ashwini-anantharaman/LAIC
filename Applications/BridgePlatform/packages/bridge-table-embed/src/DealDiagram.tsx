"use client";

// DealDiagram — a deal as a RECORD. Nothing here is a control: no turn, no legal
// set, no decider, no engine loop. "Look at this shape" is a picture, and a
// picture that has to be started is not a picture.
//
// Two shapes, because authors ask for two things:
//
//  · the whole board — @bridge/table-ui's HandViewer, the hand-record view the
//    platform already uses, so a deal printed in a tutorial and a deal opened in
//    the app are the same object. It scales its fixed stage to fit, so this
//    component owns the aspect box rather than making every host know it.
//  · one hand — SeatDiagram, the suit-per-line panel, when the lesson is about a
//    holding and the other three seats are noise.
//
// An authored auction is folded through @bridge/engine's reducer rather than
// listed as strings, so an auction that could not have happened cannot be drawn:
// an illegal call stops the fold, and what is shown is always a legal auction.

import { useMemo } from "react";
import { applyEvent, initialState, legalCalls, seededDeal } from "@bridge/engine";
import type { Call, Card, Seat, Vul } from "@bridge/events";
import { HandViewer, SeatDiagram } from "@bridge/table-ui";
import { embedBox, type EmbedBoxOptions } from "./EmbedRoot";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const VUL_NAME: Record<Vul, string> = { none: "None", ns: "N-S", ew: "E-W", both: "Both" };

/** HandViewer's design stage — the aspect a full board wants. */
const BOARD_ASPECT = 1976 / 1232;

const hcp = (cards: readonly Card[]) => cards.reduce((n, c) => n + Math.max(0, c.rank - 10), 0);

export interface DealDiagramProps extends EmbedBoxOptions {
  /** The deal, derived exactly as <BridgeTable/> derives it. */
  seed?: number;
  /** Or the cards outright. */
  deal?: Record<Seat, Card[]>;
  dealer?: Seat;
  vul?: Vul;
  /** The whole board, or just one seat's hand. */
  show?: "all" | Seat;
  /** What the board card reads. Defaults to the seed. */
  boardLabel?: string | number;
  /** Seat names on the plates. Defaults to North / East / South / West. */
  names?: Partial<Record<Seat, string>>;
  /** An auction to print with the board, from the dealer onward. */
  auction?: readonly Call[];
  /** Gold plate — the seat the lesson is about. */
  highlightSeat?: Seat | null;
  /** Face-down seats show suit dashes. Ignored when showing one hand. */
  hiddenSeats?: readonly Seat[];
}

export function DealDiagram({
  seed = 1,
  deal,
  dealer = "N",
  vul = "none",
  show = "all",
  boardLabel,
  names,
  auction = [],
  highlightSeat = null,
  hiddenSeats = [],
  isolate,
  fontFamily,
}: Readonly<DealDiagramProps>) {
  const hands = useMemo(() => deal ?? seededDeal(seed), [deal, seed]);

  // The auction, folded through the real reducer so it cannot be an impossible one.
  const calls = useMemo(() => {
    let state = initialState("diagram", dealer, vul, hands);
    let seq = 0;
    for (const call of auction) {
      // applyEvent is a pure fold and trusts its event, so legality is checked
      // HERE — otherwise a typo'd auction would be drawn as though it were real.
      if (state.phase !== "auction") break;
      if (!legalCalls(state.auction, state.turn).has(call)) break;
      state = applyEvent(state, {
        category: "bid-event",
        seq: (seq += 1),
        ts: 0,
        boardRef: state.boardRef,
        seat: state.turn,
        call,
        fallback: false,
      });
    }
    return state.auction;
  }, [auction, dealer, vul, hands]);

  if (show !== "all")
    return (
      <SeatDiagram
        cards={hands[show]}
        panelBg="#fff"
        width="100%"
        font={21}
        suitW={19}
        pad="8px 12px"
      />
    );

  const plateNames = {} as Record<Seat, string>;
  for (const seat of SEATS) plateNames[seat] = names?.[seat] ?? SEAT_NAME[seat];
  const visible = {} as Record<Seat, boolean>;
  for (const seat of SEATS) visible[seat] = !hiddenSeats.includes(seat);

  return (
    <div style={{ ...embedBox({ isolate, fontFamily }), width: "100%", aspectRatio: String(BOARD_ASPECT) }}>
      <HandViewer
        boardLabel={boardLabel ?? seed}
        dealer={dealer}
        vul={vul}
        hands={hands}
        names={plateNames}
        visible={visible}
        auction={calls}
        highlightSeat={highlightSeat}
        info={[
          { label: "Dealer", value: SEAT_NAME[dealer] },
          { label: "Vulnerable", value: VUL_NAME[vul] },
        ]}
        result={[
          { label: "N-S points", value: String(hcp(hands.N) + hcp(hands.S)) },
          { label: "E-W points", value: String(hcp(hands.E) + hcp(hands.W)) },
        ]}
      />
    </div>
  );
}
