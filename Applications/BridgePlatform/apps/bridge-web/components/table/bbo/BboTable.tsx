// BBO view (2026-07-23 skin): a near 1:1 replica of Bridge Base Online's
// classic desktop table, offered as an OPTIONAL skin behind ?skin=bbo. It
// receives the page's ALREADY-COMPUTED props (state, visibility, legality,
// nameplates) and only changes presentation — the felt, seats, auction and
// bidbox — while every form still posts the same server actions the classic
// table posts. Server-renderable; the interactive plate (swap dropdown) is
// passed in as a node so all roster/swap logic stays in the page.

import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import { callLabel, rankLabel, isVulnerable, VUL_LABEL } from "@bridge/events";
import { resultLabel, type GameState, type ScoreBreakdown } from "@bridge/engine";
import Link from "next/link";
import type { ReactNode } from "react";
import { playCardAction } from "@/app/bridge/table/actions";
import { sortedHand } from "@/components/table/HandRow";
import { BboBidBox } from "./BboBidBox";

// BBO's committed palette (used consistently across the whole skin):
const FELT = "#2E8B2E"; // flat BBO green, no gradient
const BACK_BLUE = "#22499D"; // card backs
const RED = "#CC0000"; // red suits + vulnerable header + Dbl

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const DISPLAY_SUITS: Suit[] = ["S", "H", "C", "D"];
const isRed = (s: Suit) => s === "H" || s === "D";
const SANS = { fontFamily: "Arial, Helvetica, sans-serif" } as const;

/** A BBO card face: white, rounded, rank over suit in the top-left corner. */
function Face({ card }: Readonly<{ card: Card }>) {
  return (
    <span className="relative block aspect-[5/7] w-9 rounded-[4px] border border-neutral-400 bg-white shadow-sm xl:w-11">
      <span
        className="absolute left-0.5 top-0 flex flex-col items-center leading-none"
        style={{ color: isRed(card.suit) ? RED : "#000" }}
      >
        <span className="text-[13px] font-bold tabular-nums xl:text-[15px]">
          {rankLabel(card.rank)}
        </span>
        <span className="text-[12px] xl:text-[14px]">{GLYPH[card.suit]}</span>
      </span>
    </span>
  );
}

/** A BBO card back: solid blue with a thin white inset border. */
function Back() {
  return (
    <span
      aria-hidden
      className="block aspect-[5/7] w-8 rounded-[4px] shadow-sm xl:w-10"
      style={{ background: BACK_BLUE, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.85)" }}
    />
  );
}

/** Overlapping card faces; legal cards post playCardAction, illegal dim. */
function FaceHand({
  hand,
  playable,
  sessionId,
}: Readonly<{ hand: Card[]; playable: Card[] | null; sessionId: string }>) {
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  const cards = sortedHand(hand);
  if (cards.length === 0) return <span className="text-xs text-white/60">—</span>;
  return (
    <div className="flex pt-1 [&>*:not(:first-child)]:-ml-5 xl:[&>*:not(:first-child)]:-ml-6">
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
                className="-translate-y-1 cursor-pointer rounded-[4px] transition-transform hover:-translate-y-3 focus-visible:-translate-y-3"
              >
                <Face card={card} />
              </button>
            </form>
          );
        }
        return (
          <span key={id} className={playable ? "opacity-40" : ""}>
            <Face card={card} />
          </span>
        );
      })}
    </div>
  );
}

/** Fanned card backs — horizontal for N/S, vertical for E/W. */
function Backs({ count, vertical }: Readonly<{ count: number; vertical: boolean }>) {
  const overlap = vertical
    ? "flex-col [&>*:not(:first-child)]:-mt-9 xl:[&>*:not(:first-child)]:-mt-11"
    : "[&>*:not(:first-child)]:-ml-5";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`flex ${overlap}`}>
        {Array.from({ length: Math.min(count, 13) }, (_, i) => (
          <Back key={i} />
        ))}
      </div>
      <span className="text-[10px] text-white/70">{count}</span>
    </div>
  );
}

/** BBO hand diagram: a small white panel, four suit rows of ranks. */
function Diagram({ hand }: Readonly<{ hand: Card[] }>) {
  return (
    <div className="rounded-[3px] border border-neutral-400 bg-white px-2 py-1 text-[13px] leading-tight shadow-sm">
      {DISPLAY_SUITS.map((suit) => {
        const ranks = hand
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank));
        return (
          <div key={suit} className="flex gap-1 whitespace-nowrap" style={{ color: isRed(suit) ? RED : "#000" }}>
            <span className="w-3">{GLYPH[suit]}</span>
            <span className="tabular-nums">{ranks.length ? ranks.join(" ") : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BboTable({
  sessionId,
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
}>) {
  const handFor = (seat: Seat): ReactNode => {
    const hand = state.hands[seat];
    if (!visible[seat]) return <Backs count={hand.length} vertical={seat === "E" || seat === "W"} />;
    const playable = legalNow && state.turn === seat ? legalNow : null;
    // Own hand and any hand I must act from show as tappable faces; other
    // face-up hands (dummy, or all four when watching) show as the diagram.
    if (playable || seat === mySeat) {
      return <FaceHand hand={hand} playable={playable} sessionId={sessionId} />;
    }
    return <Diagram hand={hand} />;
  };

  const contractText = state.contract
    ? `${callLabel(`${state.contract.level}${state.contract.strain}`)}${
        state.contract.doubled === 1 ? " X" : state.contract.doubled === 2 ? " XX" : ""
      } ${state.contract.declarer}`
    : null;

  // Top-left summary: contract + trick counters once past the auction, dealer/
  // vul before the contract is set.
  const summary = (
    <div className="rounded-[3px] border border-neutral-400 bg-white px-2 py-1.5 text-[12px] leading-snug text-black shadow-sm">
      {contractText ? (
        <div className="text-[14px] font-bold">{contractText}</div>
      ) : (
        <div>Dealer {dealer}</div>
      )}
      <div className="text-neutral-600">Vul: {VUL_LABEL[state.vul]}</div>
      {state.phase !== "auction" && (
        <div className="tabular-nums">
          NS: {state.trickCount.NS}&nbsp;&nbsp;EW: {state.trickCount.EW}
        </div>
      )}
    </div>
  );

  // Top-right auction grid: W N E S header, red cell = that side vulnerable.
  const auction = (
    <div className="overflow-hidden rounded-[3px] border border-neutral-400 bg-white text-[12px] text-black shadow-sm">
      <table className="border-collapse text-center tabular-nums">
        <thead>
          <tr>
            {(["W", "N", "E", "S"] as Seat[]).map((s) => {
              const vul = isVulnerable(state.vul, s);
              return (
                <th
                  key={s}
                  className="w-9 border border-neutral-300 px-1 py-0.5 font-bold"
                  style={vul ? { background: RED, color: "#fff" } : { background: "#fff", color: "#000" }}
                >
                  {s}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {auctionRows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-1 text-neutral-400">
                —
              </td>
            </tr>
          )}
          {auctionRows.map((row, i) => (
            <tr key={i}>
              {[0, 1, 2, 3].map((j) => {
                const entry = row[j];
                const rc = entry && (entry.call[1] === "D" || entry.call[1] === "H");
                return (
                  <td key={j} className="border border-neutral-200 px-1 py-0.5">
                    <span style={rc ? { color: RED } : undefined}>
                      {entry ? callLabel(entry.call) : ""}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Center: the live trick during play; the result once the board completes.
  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase === "play" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }
  const center =
    state.phase === "complete" && score ? (
      <div className="rounded-[3px] border border-neutral-400 bg-white px-5 py-3 text-center text-black shadow-md">
        <p className="text-lg font-bold">{resultLabel(score)}</p>
        {score.contract && (
          <p className="mt-0.5 text-sm text-neutral-600">
            {score.declarerScore >= 0 ? "+" : ""}
            {score.declarerScore} for {["N", "S"].includes(score.contract.declarer) ? "NS" : "EW"}
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-500 tabular-nums">
          NS {state.trickCount.NS} · EW {state.trickCount.EW}
        </p>
      </div>
    ) : state.phase === "play" ? (
      <div className="relative mx-auto h-36 w-40 xl:h-44 xl:w-48">
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
          const led = trick && trick.plays[0]?.seat === seat;
          return (
            <div key={seat} className={`absolute ${pos}`}>
              {card ? (
                <span className={led ? "ring-2 ring-[#FFD700] rounded-[4px]" : ""}>
                  <Face card={card} />
                </span>
              ) : (
                <span
                  className={`block aspect-[5/7] w-8 rounded-[4px] border border-dashed xl:w-10 ${
                    seat === state.turn ? "border-[#FFD700]" : "border-white/40"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <div style={SANS}>
      <div
        className="rounded-md border-2 border-[#1c5a1c] p-3 shadow-md sm:p-5 xl:p-6"
        style={{ background: FELT }}
      >
        {/* Top band: summary · North · auction */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="justify-self-start">{summary}</div>
          <div className="flex flex-col items-center gap-1">
            {plate("N")}
            {handFor("N")}
          </div>
          <div className="justify-self-end">{auction}</div>
        </div>

        {/* Middle band: West · center · East */}
        <div className="my-4 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex flex-col items-center gap-1 justify-self-start">
            {plate("W")}
            {handFor("W")}
          </div>
          <div className="flex min-h-40 items-center justify-center">{center}</div>
          <div className="flex flex-col items-center gap-1 justify-self-end">
            {plate("E")}
            {handFor("E")}
          </div>
        </div>

        {/* Bottom band: South */}
        <div className="flex flex-col items-center gap-1">
          {handFor("S")}
          {plate("S")}
        </div>
      </div>

      {/* Prompt line + BBO bidding box, plain BBO style under the table. */}
      <div className="mt-3 flex flex-col items-center gap-2 text-black" style={SANS}>
        {myTurn && callsNow && (
          <>
            <p className="text-sm font-bold">Your call</p>
            <BboBidBox sessionId={sessionId} legal={[...callsNow]} />
          </>
        )}
        {myTurn && legalNow && (
          <p className="text-sm text-neutral-700">
            Your play — click a highlighted card
            {state.turn !== mySeat ? ` (dummy, seat ${state.turn})` : ""}.
          </p>
        )}
        {actingIsHuman && !myTurn && state.phase !== "complete" && (
          <p className="text-sm text-neutral-600">Waiting on the human in seat {actingSeat}.</p>
        )}
        {state.phase === "complete" && (
          <p className="text-sm text-neutral-600">
            Board complete.{" "}
            <Link href="/bridge/table" className="text-[#1034A6] underline-offset-4 hover:underline">
              Play another →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
