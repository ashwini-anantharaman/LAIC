// BBO view (2026-07-23 skin, rebuilt against a real BBO web-client screenshot):
// a near 1:1 replica of Bridge Base Online's table, offered as an OPTIONAL
// skin behind ?skin=bbo. The load-bearing BBO traits:
//   - the auction is shown either in a central pale panel (giant W N E S header,
//     grey call chips) OR as a small call bubble beside each player — a toggle,
//     like BBO. Default: the central box;
//   - ALL four hands are horizontal blocks — hidden hands are teal
//     striped-sliver blocks with a white outline; face-up hands are large
//     adjacent card faces, rank over suit, grouped ♠ ♥ ♣ ♦;
//   - the name bar sits UNDER each hand (grey, teal seat badge; gold = to act);
//   - the bid box is a fixed-size khaki strip above your hand — always present
//     during the auction (disabled off-turn), never resizing.
// It receives the page's already-computed props and only changes presentation
// — every form still posts the same server actions the classic table posts.
//
// SIZING (2026-07-24): the bid box and auction box are fixed / barely-scaling
// (tight clamps that stay put on desktop and only shrink enough to fit a phone),
// per fellow feedback that the controls should not shrink and grow. Cards still
// scale, but gently.

import type { AuctionCall, Call, Card, Seat, Suit } from "@bridge/events";
import { callLabel, rankLabel, isVulnerable, VUL_LABEL } from "@bridge/events";
import { resultLabel, type GameState, type ScoreBreakdown } from "@bridge/engine";
import Link from "next/link";
import type { ReactNode } from "react";
import { playCardAction } from "@/app/bridge/table/actions";
import { sortedHand } from "@/components/table/HandRow";
import { BboBidBox } from "./BboBidBox";

// The committed BBO palette (sampled from the reference screenshot):
const FELT = "#217A21"; // flat green
const BACK_TEAL = "#2F6F7A"; // hidden-hand sliver blocks
const RED = "#CC0000"; // red suits + vulnerable seat letters
const PANEL = "#CDDCE0"; // auction panel
const CHIP = "#E2EAEA"; // auction call chips
const KHAKI = "#CFCB96"; // bid-box strip

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (s: Suit) => s === "H" || s === "D";
const SANS = { fontFamily: "Arial, Helvetica, sans-serif" } as const;

const callChipText = (call: Call) => (call === "P" ? "Pass" : callLabel(call));
const callIsRed = (call: Call) => call[1] === "D" || call[1] === "H";

/** A BBO card face. Scales gently (tight clamp) so the table stays stable. */
function Face({ card, big }: Readonly<{ card: Card; big: boolean }>) {
  const w = big ? "clamp(38px, 3.4cqw, 54px)" : "clamp(28px, 2.6cqw, 40px)";
  return (
    <span
      className="relative block border border-neutral-500 bg-white first:rounded-l-[4px] last:rounded-r-[4px]"
      style={{ width: w, aspectRatio: big ? "6 / 11" : "6 / 10.6" }}
    >
      <span
        className="absolute left-[8%] top-[2%] flex flex-col items-center leading-none"
        style={{ color: isRed(card.suit) ? RED : "#000" }}
      >
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: big ? "clamp(17px, 1.7cqw, 26px)" : "clamp(13px, 1.3cqw, 19px)" }}
        >
          {rankLabel(card.rank)}
        </span>
        <span style={{ fontSize: big ? "clamp(15px, 1.5cqw, 23px)" : "clamp(12px, 1.2cqw, 17px)" }}>
          {GLYPH[card.suit]}
        </span>
      </span>
    </span>
  );
}

/** Face-up hand: adjacent big card faces (BBO style — no overlap). */
function FaceHand({
  hand,
  playable,
  sessionId,
  big,
}: Readonly<{ hand: Card[]; playable: Card[] | null; sessionId: string; big: boolean }>) {
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
                <Face card={card} big={big} />
              </button>
            </form>
          );
        }
        return (
          <span key={id} className={playable ? "opacity-40" : ""}>
            <Face card={card} big={big} />
          </span>
        );
      })}
    </div>
  );
}

/** BBO hand diagram: white panel, four suit rows — a revealed side hand. */
function Diagram({ hand }: Readonly<{ hand: Card[] }>) {
  return (
    <div
      className="rounded-[3px] border border-neutral-400 bg-white px-2 py-1 leading-tight shadow-md"
      style={{ fontSize: "clamp(13px, 1.3cqw, 17px)" }}
    >
      {(["S", "H", "C", "D"] as Suit[]).map((suit) => {
        const ranks = hand
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank));
        return (
          <div
            key={suit}
            className="flex gap-1 whitespace-nowrap"
            style={{ color: isRed(suit) ? RED : "#000" }}
          >
            <span className="w-[1.1em]">{GLYPH[suit]}</span>
            <span className="tabular-nums tracking-tight">
              {ranks.length ? ranks.join(" ") : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Hidden hand: one horizontal block of teal card-back slivers. */
function Backs({ count }: Readonly<{ count: number }>) {
  return (
    <div
      className="flex overflow-hidden rounded-[3px] shadow-md"
      style={{ border: "2px solid rgba(255,255,255,.9)" }}
      title={`${count} cards`}
    >
      {Array.from({ length: Math.min(count, 13) }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="block"
          style={{
            width: "clamp(10px, 1.2cqw, 16px)",
            height: "clamp(52px, 5.6cqw, 78px)",
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
  /** Where "Play another" goes — the mobile shell passes /m/play. */
  lobbyHref?: string;
  /** Where to show the auction: the central box, or a bubble by each seat. */
  auctionDisplay?: "box" | "seats";
  /** Href that flips auctionDisplay (rendered as the corner toggle). */
  auctionToggleHref?: string;
}>) {
  const seatsMode = auctionDisplay === "seats";
  const inAuction = state.phase === "auction";

  // Each seat's most recent call — for the seat-bubble display mode.
  const lastCallBySeat: Partial<Record<Seat, Call>> = {};
  for (const a of state.auction) lastCallBySeat[a.seat] = a.call;

  const callBubble = (seat: Seat) => {
    const call = lastCallBySeat[seat];
    if (!seatsMode || !inAuction) return null;
    return (
      <div
        className="rounded-[4px] px-2 py-0.5 text-center font-bold shadow"
        style={{
          background: call ? "#fff" : "rgba(255,255,255,.35)",
          color: call && callIsRed(call) ? RED : "#000",
          fontSize: 15,
          minWidth: 40,
          minHeight: 22,
          lineHeight: "16px",
        }}
      >
        {call ? callChipText(call) : "—"}
      </div>
    );
  };

  // A hand block: the horizontal hand with (in seats mode) its call bubble
  // above and its name bar under (BBO).
  const seatBlock = (seat: Seat) => {
    const hand = state.hands[seat];
    const playable = legalNow && state.turn === seat ? legalNow : null;
    const side = seat === "E" || seat === "W";
    const body = !visible[seat] ? (
      <Backs count={hand.length} />
    ) : side && !playable ? (
      <Diagram hand={hand} />
    ) : (
      <FaceHand
        hand={hand}
        playable={playable}
        sessionId={sessionId}
        big={seat === mySeat || seat === "S"}
      />
    );
    return (
      <div className="flex w-fit max-w-full flex-col items-center gap-0.5">
        {callBubble(seat)}
        <div className="flex w-full flex-col items-stretch gap-0.5">
          {body}
          {plate(seat)}
        </div>
      </div>
    );
  };

  const contractText = state.contract
    ? `${callLabel(`${state.contract.level}${state.contract.strain}`)}${
        state.contract.doubled === 1 ? " X" : state.contract.doubled === 2 ? " XX" : ""
      } ${state.contract.declarer}`
    : null;

  // Top-left summary: dealer/vul during the auction; contract + trick tally after.
  const summary = (
    <div className="rounded-[3px] border border-neutral-400 bg-white px-2 py-1.5 text-[12px] leading-snug text-black shadow-sm">
      {contractText ? (
        <div className="text-[15px] font-bold">{contractText}</div>
      ) : (
        <div className="text-[13px] font-bold">Dealer {dealer}</div>
      )}
      <div className="text-neutral-600">Vul: {VUL_LABEL[state.vul]}</div>
      {state.phase !== "auction" && (
        <div className="text-[13px] font-bold tabular-nums">
          NS: {state.trickCount.NS}&nbsp;&nbsp;EW: {state.trickCount.EW}
        </div>
      )}
    </div>
  );

  // The central auction box (box mode). Barely-scaling: fixed fonts, a tight
  // width clamp that is 320px on desktop and only shrinks to fit a phone.
  const auctionPanel = (
    <div
      className="rounded-[4px] px-3 pb-3 shadow-lg"
      style={{ background: PANEL, width: "clamp(236px, 40cqw, 320px)" }}
    >
      <div className="grid grid-cols-4 rounded-t-[4px] bg-white px-1 text-center">
        {(["W", "N", "E", "S"] as Seat[]).map((s) => (
          <span
            key={s}
            className="py-0.5 text-[22px] font-bold leading-tight"
            style={{ color: isVulnerable(state.vul, s) ? RED : "#000" }}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="mt-1 space-y-1">
        {auctionRows.length === 0 && (
          <div className="py-2 text-center text-[14px] text-neutral-500">{dealer} deals</div>
        )}
        {auctionRows.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-1 text-center">
            {[0, 1, 2, 3].map((j) => {
              const entry = row[j];
              if (!entry) return <span key={j} />;
              return (
                <span
                  key={j}
                  className="rounded-[3px] py-0.5 text-[16px] font-medium leading-tight"
                  style={{ background: CHIP, color: callIsRed(entry.call) ? RED : "#000" }}
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

  // Center during play: the live trick, four faces toward their seats.
  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase === "play" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }
  const trickArea = (
    <div
      className="relative mx-auto"
      style={{ width: "clamp(170px, 22cqw, 250px)", height: "clamp(170px, 22cqw, 250px)" }}
    >
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
              <Face card={card} big={false} />
            ) : (
              <span
                className={`block rounded-[4px] border border-dashed ${
                  seat === state.turn ? "border-[#FFC933]" : "border-white/40"
                }`}
                style={{ width: "clamp(28px, 2.6cqw, 40px)", aspectRatio: "6 / 10.6" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const resultPanel = score && (
    <div className="rounded-[4px] border border-neutral-400 bg-white px-6 py-4 text-center text-black shadow-lg">
      <p className="text-xl font-bold">{resultLabel(score)}</p>
      {score.contract && (
        <p className="mt-0.5 text-sm text-neutral-600">
          {score.declarerScore >= 0 ? "+" : ""}
          {score.declarerScore} for {["N", "S"].includes(score.contract.declarer) ? "NS" : "EW"}
        </p>
      )}
      <p className="mt-1 text-xs tabular-nums text-neutral-500">
        NS {state.trickCount.NS} · EW {state.trickCount.EW}
      </p>
    </div>
  );

  // What sits in the middle. In seats mode during the auction the middle is
  // clear (the calls live at each seat) — keep a fixed spacer so the felt
  // doesn't collapse.
  const center =
    state.phase === "complete"
      ? resultPanel
      : state.phase === "play"
        ? trickArea
        : seatsMode
          ? <div style={{ height: "clamp(120px, 18cqw, 200px)" }} aria-hidden />
          : auctionPanel;

  // The bid box wrapper: fixed height so it never shifts the felt, and always
  // present during the auction (disabled off-turn) so the options stay visible.
  const bidStrip = inAuction ? (
    <div
      className="rounded-[4px] px-3 py-2.5 shadow-md"
      style={{ background: KHAKI }}
    >
      <BboBidBox sessionId={sessionId} legal={callsNow ?? []} active={!!myTurn} />
    </div>
  ) : null;

  return (
    // containerType makes cqw units track THIS element's width.
    <div style={{ ...SANS, containerType: "inline-size" }}>
      <div
        className="relative flex flex-col justify-between rounded-lg shadow-md"
        style={{
          background: FELT,
          minHeight: "clamp(520px, 60cqw, 700px)",
          padding: "clamp(14px, 2cqw, 24px) clamp(12px, 2.2cqw, 26px) clamp(10px, 1.6cqw, 18px)",
        }}
      >
        {/* Dealer/vul → contract/tricks tally, pinned top-left like BBO. */}
        <div className="absolute left-3 top-3">{summary}</div>

        {/* Auction-display toggle, pinned top-right. */}
        {auctionToggleHref && (
          <Link
            href={auctionToggleHref}
            className="absolute right-3 top-3 rounded-[4px] border border-white/40 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-black/30"
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
        <div className="flex justify-center">{seatBlock("N")}</div>

        {/* West · center · East — every hand horizontal, like BBO. */}
        <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-[clamp(4px,1cqw,14px)]">
          <div className="justify-self-start">{seatBlock("W")}</div>
          <div className="flex items-center justify-center">{center}</div>
          <div className="justify-self-end">{seatBlock("E")}</div>
        </div>

        {/* South: the fixed bid strip sits directly above your hand (BBO). */}
        <div className="flex flex-col items-center gap-2">
          {bidStrip}
          {seatBlock("S")}
        </div>
      </div>

      {/* Prompt line under the table, plain BBO tone. */}
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
