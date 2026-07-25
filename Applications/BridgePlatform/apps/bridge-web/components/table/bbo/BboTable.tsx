// BBO view (2026-07-25): a Bridge Base Online table skin behind ?skin=bbo.
// The felt is FLUID — it grows and shrinks with the window (container-query
// units) — but every part whose CONTENT changes has RESERVED space so the
// layout never jumps:
//   - the bid box container is a reserved width, so clicking a level (which
//     swaps the numbers for that level's strains) never resizes it;
//   - the central auction box has a reserved height, so it doesn't grow or
//     shift the side hands as bidding rounds accumulate (it scrolls if a very
//     long auction overflows);
//   - each seat column is a reserved width, so a hand flipping between
//     card-backs, the suit diagram and face cards doesn't move its neighbours.
// The auction shows in the central box OR as a call bubble at each seat (a
// toggle). Hidden hands are teal card-back slivers; your & dummy hands are
// face cards; a revealed side hand is BBO's vertical suit diagram (clickable
// when you play it as declarer). Every control posts the same server actions
// the classic table posts.

import type { AuctionCall, Call, Card, Seat, Suit } from "@bridge/events";
import { callLabel, rankLabel, isVulnerable, VUL_LABEL } from "@bridge/events";
import { resultLabel, type GameState, type ScoreBreakdown } from "@bridge/engine";
import Link from "next/link";
import type { ReactNode } from "react";
import { playCardAction } from "@/app/bridge/table/actions";
import { sortedHand } from "@/components/table/HandRow";
import { BboBidBox } from "./BboBidBox";

// The committed BBO palette (sampled from the reference screenshot):
const FELT = "#217A21";
const BACK_TEAL = "#2F6F7A";
const RED = "#CC0000";
const PANEL = "#CDDCE0";
const CHIP = "#E2EAEA";
const KHAKI = "#CFCB96";

// Fluid geometry — cqw tracks the felt's width so everything scales with the
// window; the clamps keep it legible at the extremes. Reserved dimensions
// (the ones that must NOT follow content) are called out below.
const COL = "clamp(120px, 20cqw, 172px)"; // a seat column / name-plate width
const CARD_W = "clamp(30px, 5.2cqw, 48px)"; // a face card in a hand
const CARD_SM = "clamp(26px, 4.2cqw, 40px)"; // a face card in the trick
const AUCTION_W = "clamp(224px, 40cqw, 330px)";
const AUCTION_H = "clamp(118px, 20cqw, 176px)"; // RESERVED — constant across rounds
const CENTER_H = "clamp(140px, 22cqw, 200px)"; // RESERVED — keeps W/E from moving
const BID_W = "clamp(360px, 80cqw, 540px)"; // RESERVED — constant across clicks
const TRICK = "clamp(150px, 24cqw, 210px)";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (s: Suit) => s === "H" || s === "D";
const SANS = { fontFamily: "Arial, Helvetica, sans-serif" } as const;

const callChipText = (call: Call) => (call === "P" ? "Pass" : callLabel(call));
const callIsRed = (call: Call) => call[1] === "D" || call[1] === "H";

/** A BBO card face, sized fluidly by `w` (a CSS length). */
function Face({ card, w }: Readonly<{ card: Card; w: string }>) {
  return (
    <span
      className="relative block border border-neutral-500 bg-white first:rounded-l-[4px] last:rounded-r-[4px]"
      style={{ width: w, aspectRatio: "2 / 3" }}
    >
      <span
        className="absolute left-[7%] top-[2%] flex flex-col items-center leading-none"
        style={{ color: isRed(card.suit) ? RED : "#000" }}
      >
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: `calc(${w} * 0.5)` }}
        >
          {rankLabel(card.rank)}
        </span>
        <span style={{ fontSize: `calc(${w} * 0.44)` }}>{GLYPH[card.suit]}</span>
      </span>
    </span>
  );
}

/** Face-up hand: adjacent faces. Legal cards post playCardAction. */
function FaceHand({
  hand,
  playable,
  sessionId,
}: Readonly<{ hand: Card[]; playable: Card[] | null; sessionId: string }>) {
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  const cards = sortedHand(hand);
  if (cards.length === 0) return <span className="text-xs text-white/60">—</span>;
  return (
    <div className="flex rounded-[4px] shadow-md [&>*:not(:first-child)]:-ml-px">
      {cards.map((card) => {
        const id = `${card.suit}${card.rank}`;
        if (playable && legal.has(id)) {
          return (
            <form key={id} action={playCardAction} className="contents">
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="suit" value={card.suit} />
              <input type="hidden" name="rank" value={card.rank} />
              <button
                type="submit"
                aria-label={`Play ${rankLabel(card.rank)}${GLYPH[card.suit]}`}
                className="cursor-pointer transition-transform hover:-translate-y-2 focus-visible:-translate-y-2"
              >
                <Face card={card} w={CARD_W} />
              </button>
            </form>
          );
        }
        return (
          <span key={id} className={playable ? "opacity-40" : ""}>
            <Face card={card} w={CARD_W} />
          </span>
        );
      })}
    </div>
  );
}

/** BBO vertical hand diagram: four suit rows, a RESERVED column width. Clickable
 *  ranks when this is the hand you must play (declarer on dummy). */
function Diagram({
  hand,
  playable,
  sessionId,
}: Readonly<{ hand: Card[]; playable: Card[] | null; sessionId: string }>) {
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  return (
    <div
      className="rounded-[4px] border border-neutral-400 bg-white px-2 py-1.5 shadow-md"
      style={{ width: COL, fontSize: "clamp(13px, 2cqw, 17px)" }}
    >
      {(["S", "H", "C", "D"] as Suit[]).map((suit) => {
        const cs = hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank);
        return (
          <div
            key={suit}
            className="flex items-baseline gap-1 whitespace-nowrap leading-tight"
            style={{ color: isRed(suit) ? RED : "#000" }}
          >
            <span className="w-[1.1em] flex-none">{GLYPH[suit]}</span>
            <span className="flex flex-wrap gap-x-1 tabular-nums">
              {cs.length === 0 ? (
                <span className="text-neutral-400">—</span>
              ) : (
                cs.map((card) => {
                  const id = `${card.suit}${card.rank}`;
                  if (playable && legal.has(id)) {
                    return (
                      <form key={id} action={playCardAction} className="contents">
                        <input type="hidden" name="sessionId" value={sessionId} />
                        <input type="hidden" name="suit" value={card.suit} />
                        <input type="hidden" name="rank" value={card.rank} />
                        <button
                          type="submit"
                          aria-label={`Play ${rankLabel(card.rank)}${GLYPH[card.suit]}`}
                          className="rounded bg-emerald-100 px-0.5 font-bold hover:bg-emerald-200"
                        >
                          {rankLabel(card.rank)}
                        </button>
                      </form>
                    );
                  }
                  return <span key={id}>{rankLabel(card.rank)}</span>;
                })
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Hidden hand: a block of teal card-back slivers (scales fluidly). */
function Backs({ count }: Readonly<{ count: number }>) {
  const n = Math.min(count, 13);
  return (
    <div
      className="flex overflow-hidden rounded-[3px] shadow-md"
      style={{ border: "2px solid rgba(255,255,255,.9)" }}
      title={`${count} cards`}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="block"
          style={{
            width: "clamp(8px, 1.3cqw, 12px)",
            height: "clamp(52px, 8cqw, 76px)",
            background: BACK_TEAL,
            borderLeft: i > 0 ? "1.5px solid rgba(255,255,255,.9)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function BboTable({
  sessionId,
  lobbyHref = "/bridge/table",
  auctionDisplay = "box",
  auctionToggleHref,
  state,
  score,
  visible,
  legalNow,
  callsNow,
  myTurn,
  mySeat,
  dummy,
  actingSeat,
  actingIsHuman,
  dealer,
  auctionRows,
  plate,
}: Readonly<{
  sessionId: string;
  state: GameState;
  score: ScoreBreakdown | null;
  visible: Record<Seat, boolean>;
  legalNow: Card[] | null;
  callsNow: string[] | null;
  myTurn: boolean;
  mySeat: Seat | undefined;
  dummy: Seat | null;
  actingSeat: Seat;
  actingIsHuman: boolean;
  dealer: Seat;
  auctionRows: readonly (readonly (AuctionCall | null)[])[];
  plate: (seat: Seat) => ReactNode;
  lobbyHref?: string;
  auctionDisplay?: "box" | "seats";
  auctionToggleHref?: string;
}>) {
  const seatsMode = auctionDisplay === "seats";
  const inAuction = state.phase === "auction";

  const lastCallBySeat: Partial<Record<Seat, Call>> = {};
  for (const a of state.auction) lastCallBySeat[a.seat] = a.call;

  const callBubble = (seat: Seat) => {
    if (!seatsMode || !inAuction) return null;
    const call = lastCallBySeat[seat];
    return (
      <div
        className="flex items-center justify-center rounded-[4px] font-bold shadow"
        style={{
          background: call ? "#fff" : "rgba(255,255,255,.35)",
          color: call && callIsRed(call) ? RED : "#000",
          fontSize: "clamp(13px, 2cqw, 16px)",
          width: "clamp(44px, 8cqw, 60px)",
          height: "clamp(22px, 3.4cqw, 28px)",
        }}
      >
        {call ? callChipText(call) : "—"}
      </div>
    );
  };

  const handBody = (seat: Seat, side: boolean) => {
    const hand = state.hands[seat];
    const playable = legalNow && state.turn === seat ? legalNow : null;
    if (!visible[seat]) return <Backs count={hand.length} />;
    // Side hands render as the diagram (reserved width) — never a wide face row.
    if (side) return <Diagram hand={hand} playable={playable} sessionId={sessionId} />;
    return <FaceHand hand={hand} playable={playable} sessionId={sessionId} />;
  };

  const contractText = state.contract
    ? `${callLabel(`${state.contract.level}${state.contract.strain}`)}${
        state.contract.doubled === 1 ? " X" : state.contract.doubled === 2 ? " XX" : ""
      } ${state.contract.declarer}`
    : null;

  const summary = (
    <div className="rounded-[3px] border border-neutral-400 bg-white px-2 py-1.5 text-[13px] leading-snug text-black shadow-sm">
      {contractText ? (
        <div className="text-[16px] font-bold">{contractText}</div>
      ) : (
        <div className="text-[14px] font-bold">Dealer {dealer}</div>
      )}
      <div className="text-neutral-600">Vul: {VUL_LABEL[state.vul]}</div>
      {state.phase !== "auction" && (
        <div className="text-[14px] font-bold tabular-nums">
          NS: {state.trickCount.NS}&nbsp;&nbsp;EW: {state.trickCount.EW}
        </div>
      )}
    </div>
  );

  // Central auction box: fluid WIDTH, RESERVED HEIGHT (scrolls if a long
  // auction overflows) so it never grows or moves the side hands.
  const auctionPanel = (
    <div
      className="flex flex-col overflow-hidden rounded-[4px] shadow-lg"
      style={{ background: PANEL, width: AUCTION_W, height: AUCTION_H }}
    >
      <div className="grid flex-none grid-cols-4 rounded-t-[4px] bg-white px-1 text-center">
        {(["W", "N", "E", "S"] as Seat[]).map((s) => (
          <span
            key={s}
            className="py-0.5 font-bold leading-tight"
            style={{
              color: isVulnerable(state.vul, s) ? RED : "#000",
              fontSize: "clamp(17px, 3cqw, 24px)",
            }}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1">
        {auctionRows.length === 0 && (
          <div className="py-2 text-center text-[15px] text-neutral-500">{dealer} deals</div>
        )}
        {auctionRows.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-1 text-center">
            {[0, 1, 2, 3].map((j) => {
              const entry = row[j];
              if (!entry) return <span key={j} />;
              return (
                <span
                  key={j}
                  className="rounded-[3px] py-0.5 font-medium leading-tight"
                  style={{
                    background: CHIP,
                    color: callIsRed(entry.call) ? RED : "#000",
                    fontSize: "clamp(13px, 2.2cqw, 17px)",
                  }}
                >
                  {callChipText(entry.call)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase === "play" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }
  const trickArea = (
    <div className="relative" style={{ width: TRICK, height: TRICK }}>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
        const pos =
          seat === "N"
            ? "left-1/2 top-0 -translate-x-1/2"
            : seat === "S"
              ? "bottom-0 left-1/2 -translate-x-1/2"
              : seat === "W"
                ? "left-0 top-1/2 -translate-y-1/2"
                : "right-0 top-1/2 -translate-y-1/2";
        const card = trickCards[seat];
        return (
          <div key={seat} className={`absolute ${pos}`}>
            {card ? (
              <Face card={card} w={CARD_SM} />
            ) : (
              <span
                className={`block rounded-[4px] border border-dashed ${
                  seat === state.turn ? "border-[#FFC933]" : "border-white/40"
                }`}
                style={{ width: CARD_SM, aspectRatio: "2 / 3" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const resultPanel = score && (
    <div className="rounded-[4px] border border-neutral-400 bg-white px-6 py-4 text-center text-black shadow-lg">
      <p className="text-2xl font-bold">{resultLabel(score)}</p>
      {score.contract && (
        <p className="mt-0.5 text-base text-neutral-600">
          {score.declarerScore >= 0 ? "+" : ""}
          {score.declarerScore} for {["N", "S"].includes(score.contract.declarer) ? "NS" : "EW"}
        </p>
      )}
      <p className="mt-1 text-sm tabular-nums text-neutral-500">
        NS {state.trickCount.NS} · EW {state.trickCount.EW}
      </p>
    </div>
  );

  const center =
    state.phase === "complete"
      ? resultPanel
      : state.phase === "play"
        ? trickArea
        : seatsMode
          ? null
          : auctionPanel;

  const sideColumn = (seat: Seat) => (
    <div className="flex flex-none flex-col items-center gap-1" style={{ width: COL }}>
      {callBubble(seat)}
      {handBody(seat, true)}
      <div style={{ width: COL }}>{plate(seat)}</div>
    </div>
  );
  const centerColumn = (seat: Seat) => (
    <div className="flex flex-col items-center gap-1">
      {callBubble(seat)}
      {handBody(seat, false)}
      <div style={{ width: COL }}>{plate(seat)}</div>
    </div>
  );

  // Bid strip: RESERVED width so the number of legal calls (and clicking a
  // level) never resizes it; the buttons centre within.
  const bidStrip = inAuction ? (
    <div
      className="flex justify-center rounded-[4px] px-3 py-2.5 shadow-md"
      style={{ background: KHAKI, width: BID_W }}
    >
      <BboBidBox sessionId={sessionId} legal={callsNow ?? []} active={!!myTurn} />
    </div>
  ) : null;

  return (
    // Fluid felt: fills its column up to a comfortable max, centred; cqw units
    // inside track this width so the whole table scales with the window.
    <div style={{ ...SANS, containerType: "inline-size" }}>
      <div
        className="relative mx-auto flex flex-col justify-between rounded-lg shadow-md"
        style={{
          background: FELT,
          width: "100%",
          maxWidth: 900,
          minHeight: "clamp(520px, 78cqw, 680px)",
          padding: "clamp(14px, 2cqw, 22px) clamp(12px, 2.2cqw, 24px) clamp(10px, 1.6cqw, 18px)",
        }}
      >
        {/* Dealer/vul → contract/tricks tally, pinned top-left. */}
        <div className="absolute left-3 top-3">{summary}</div>

        {/* Auction-display toggle, pinned top-right. */}
        {auctionToggleHref && (
          <Link
            href={auctionToggleHref}
            className="absolute right-3 top-3 rounded-[4px] border border-white/40 bg-black/20 px-2 py-1 text-[12px] font-medium text-white/90 hover:bg-black/30"
            title={
              seatsMode
                ? "Show the auction in the centre box"
                : "Show each player's last call at their seat"
            }
          >
            bids: {seatsMode ? "at seats" : "centre"}
          </Link>
        )}

        {/* North */}
        <div className="flex justify-center">{centerColumn("N")}</div>

        {/* West · reserved-height centre · East */}
        <div
          className="my-3 flex items-center justify-between gap-2"
          style={{ height: CENTER_H }}
        >
          {sideColumn("W")}
          <div className="flex flex-1 items-center justify-center">{center}</div>
          {sideColumn("E")}
        </div>

        {/* South: the reserved-width bid strip sits above your hand. */}
        <div className="flex flex-col items-center gap-2">
          {bidStrip}
          {centerColumn("S")}
        </div>
      </div>

      {/* Prompt line under the table. */}
      <div className="mt-2 flex flex-col items-center gap-1 text-black" style={SANS}>
        {inAuction && !myTurn && actingIsHuman && (
          <p className="text-sm text-neutral-600">Waiting on the human in seat {actingSeat}.</p>
        )}
        {inAuction && !myTurn && !actingIsHuman && (
          <p className="text-sm text-neutral-600">Waiting on {actingSeat} to bid…</p>
        )}
        {myTurn && legalNow && (
          <p className="text-sm text-neutral-700">
            Your play — click a card
            {state.turn !== mySeat ? ` (dummy, seat ${state.turn})` : ""}.
          </p>
        )}
        {actingIsHuman && !myTurn && state.phase === "play" && (
          <p className="text-sm text-neutral-600">Waiting on the human in seat {actingSeat}.</p>
        )}
        {state.phase === "complete" && (
          <p className="text-sm text-neutral-600">
            Board complete.{" "}
            <Link href={lobbyHref} className="text-[#1034A6] underline-offset-4 hover:underline">
              Play another →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
