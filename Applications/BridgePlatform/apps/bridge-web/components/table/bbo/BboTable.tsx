// BBO view (2026-07-23 skin, rebuilt against a real BBO web-client screenshot):
// a near 1:1 replica of Bridge Base Online's table, offered as an OPTIONAL
// skin behind ?skin=bbo. The load-bearing BBO traits, in order:
//   - the AUCTION lives in a big pale panel in the CENTER of the felt while
//     bidding (giant W N E S header, calls as grey chips);
//   - ALL four hands are horizontal blocks — hidden hands are teal
//     striped-sliver blocks with a white outline (no vertical stacks);
//   - face-up hands (yours, dummy, watching) are large ADJACENT card faces,
//     rank over suit, grouped ♠ ♥ ♣ ♦;
//   - the name bar sits UNDER each hand (grey, teal seat badge; gold = to act);
//   - your bid box is a khaki strip above your hand: green Pass + only the
//     LEGAL level numbers, then the strains (two-click, like BBO's default).
// It receives the page's already-computed props and only changes presentation
// — every form still posts the same server actions the classic table posts.

import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
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

/** A BBO card face: white, rank over suit in the top-left, adjacent layout. */
function Face({ card, big }: Readonly<{ card: Card; big: boolean }>) {
  return (
    <span
      className={`relative block border border-neutral-500 bg-white ${
        big ? "h-[86px] w-[46px] xl:h-[96px] xl:w-[52px]" : "h-[58px] w-[32px] xl:w-[36px]"
      } first:rounded-l-[4px] last:rounded-r-[4px]`}
    >
      <span
        className="absolute left-1 top-0.5 flex flex-col items-center leading-none"
        style={{ color: isRed(card.suit) ? RED : "#000" }}
      >
        <span className={`${big ? "text-[22px]" : "text-[15px]"} font-bold tabular-nums`}>
          {rankLabel(card.rank)}
        </span>
        <span className={big ? "text-[20px]" : "text-[13px]"}>{GLYPH[card.suit]}</span>
      </span>
    </span>
  );
}

/** Face-up hand: adjacent big card faces (BBO style — no overlap), grouped
 *  ♠ ♥ ♣ ♦. Legal cards post playCardAction; illegal dim while playing. */
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

/** Hidden hand, BBO style: one horizontal block of teal card-back slivers
 *  separated by thin white lines, with a white outline. */
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
          className="block h-[60px] w-[13px] xl:h-[68px] xl:w-[15px]"
          style={{
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
  // A hand block: the horizontal hand with its name bar UNDERNEATH (BBO).
  const seatBlock = (seat: Seat) => {
    const hand = state.hands[seat];
    const playable = legalNow && state.turn === seat ? legalNow : null;
    const body = visible[seat] ? (
      <FaceHand
        hand={hand}
        playable={playable}
        sessionId={sessionId}
        big={seat === mySeat || seat === "S"}
      />
    ) : (
      <Backs count={hand.length} />
    );
    return (
      <div className="flex w-fit max-w-full flex-col items-stretch gap-0.5">
        {body}
        {plate(seat)}
      </div>
    );
  };

  const contractText = state.contract
    ? `${callLabel(`${state.contract.level}${state.contract.strain}`)}${
        state.contract.doubled === 1 ? " X" : state.contract.doubled === 2 ? " XX" : ""
      } ${state.contract.declarer}`
    : null;

  // Top-left summary: dealer/vul during the auction; contract + trick
  // counters once the contract is set (BBO's corner tally).
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

  // The centrepiece during bidding: BBO's big pale auction panel — giant
  // W N E S header (red letter = that side vulnerable), calls as grey chips.
  const auctionPanel = (
    <div
      className="min-w-[248px] max-w-[340px] rounded-[4px] px-3 pb-3 shadow-lg"
      style={{ background: PANEL }}
    >
      <div className="grid grid-cols-4 rounded-t-[4px] bg-white px-1 text-center">
        {(["W", "N", "E", "S"] as Seat[]).map((s) => (
          <span
            key={s}
            className="py-0.5 text-[26px] font-bold leading-tight"
            style={{ color: isVulnerable(state.vul, s) ? RED : "#000" }}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="mt-1 space-y-1">
        {auctionRows.length === 0 && (
          <div className="py-2 text-center text-[13px] text-neutral-500">
            {dealer} deals
          </div>
        )}
        {auctionRows.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-1 text-center">
            {[0, 1, 2, 3].map((j) => {
              const entry = row[j];
              if (!entry) return <span key={j} />;
              const rc = entry.call[1] === "D" || entry.call[1] === "H";
              return (
                <span
                  key={j}
                  className="rounded-[3px] py-0.5 text-[19px] font-medium leading-tight"
                  style={{ background: CHIP, color: rc ? RED : "#000" }}
                >
                  {entry.call === "P" ? "Pass" : callLabel(entry.call)}
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
    <div className="relative mx-auto h-44 w-44 xl:h-52 xl:w-52">
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
                className={`block h-[58px] w-[32px] rounded-[4px] border border-dashed xl:w-[36px] ${
                  seat === state.turn ? "border-[#FFC933]" : "border-white/40"
                }`}
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

  const center =
    state.phase === "auction"
      ? auctionPanel
      : state.phase === "complete"
        ? resultPanel
        : trickArea;

  return (
    <div style={SANS}>
      <div
        className="relative flex min-h-[560px] flex-col justify-between rounded-lg px-4 pb-3 pt-4 shadow-md sm:px-6 xl:min-h-[620px]"
        style={{ background: FELT }}
      >
        {/* Dealer/vul → contract/tricks tally, pinned top-left like BBO. */}
        <div className="absolute left-3 top-3">{summary}</div>

        {/* North */}
        <div className="flex justify-center">{seatBlock("N")}</div>

        {/* West · center · East — every hand horizontal, like BBO. */}
        <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">{seatBlock("W")}</div>
          <div className="flex items-center justify-center">{center}</div>
          <div className="justify-self-end">{seatBlock("E")}</div>
        </div>

        {/* South: the khaki bid strip sits directly above your hand (BBO). */}
        <div className="flex flex-col items-center gap-2">
          {myTurn && callsNow && (
            <div
              className="w-fit max-w-full rounded-[4px] px-3 py-2.5 shadow-md"
              style={{ background: KHAKI }}
            >
              <BboBidBox sessionId={sessionId} legal={[...callsNow]} />
            </div>
          )}
          {seatBlock("S")}
        </div>
      </div>

      {/* Prompt line under the table, plain BBO tone. */}
      <div className="mt-2 flex flex-col items-center gap-1 text-black" style={SANS}>
        {myTurn && legalNow && (
          <p className="text-sm text-neutral-700">
            Your play — click a card
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
