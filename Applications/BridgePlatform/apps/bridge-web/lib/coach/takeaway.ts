// The end-of-board takeaway — what this board should leave behind.
//
// Everything else the coach does is pre-decision: the scaffold, the hints,
// the tell. This is the post-decision half, built when the board is OVER:
// a verdict chip per learner call, the one moment that mattered, and a single
// line to remember. Deterministic and serializable — the LLM phrasing of the
// line lives behind its own on-demand route (takeaway-line), never here.
//
// THE VERDICT STACK (owner decision 2026-08-13, the takeaway design review):
//   · the KB JUDGES — a call is right or wrong only against the partnership's
//     own agreements, so the verdict comes from `bridgeVerdicts` (the KB
//     decider in ask mode), and where the rulebook is silent the call goes
//     UNMARKED. Note this is a different surface from live advice, where the
//     KB is off the authority list (assessors/panel.ts, owner 2026-08-04):
//     that decision was about coaching prose mid-board; this one is a
//     post-board comparison against the learner's own system, which is the
//     one thing only the KB can say.
//   · DDS COSTS — the double-dummy solver quantifies what the disagreement
//     was worth on this layout. It never judges: a bid that happens to make
//     is not thereby right.
//   · BEN COMMENTS — fetched by the card on demand (ben-tell?at=), never
//     computed here.
//
// AUCTION ONLY, deliberately. Card-play verdicts exist but are a sparser
// signal (the solver's coverage plus named principles); the play section can
// join a later pass rather than diluting this one.

import { applyEvent, initialState } from "@bridge/engine";
import { callLabel, isActionEvent, partnerOf } from "@bridge/events";
import type { Call, Card, GameEvent, Seat, Vul } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { SeatConfig } from "@bridge/sessions";
import type { GameState } from "@bridge/engine";
import type { Severity } from "@laic/coach/core";
import type { LiveCardPlayState } from "@laic/coach/domains/bridge";

import { scoreEveryCard } from "./ddsOracle";
import { Relative, relative } from "./position";
import { bridgeVerdicts, partnershipSystem, type CallVerdict } from "./verdicts";

/** One learner call, judged — a chip on the takeaway card and a mark in the
 *  history's bidding diagram. No `verdict` means the system was SILENT there,
 *  and a silent system draws nothing (never a grey "unknown"). */
export interface TakeawayChip {
  /** The history row this chip points at — looking.ts's "call-{auctionIndex}". */
  eventId: string;
  auctionIndex: number;
  /** Engine code — "3S", "P". */
  call: string;
  /** Table label — "3♠", "Pass". */
  label: string;
  verdict?: "correct" | "acceptable" | "incorrect";
  severity?: Severity;
  /** What the system would have called, as a label. */
  systemCall?: string;
  /** The rule it would have acted on — the citation. */
  ruleLabel?: string;
}

/** The one decision the card dwells on. */
export interface TakeawayMoment {
  eventId: string;
  auctionIndex: number;
  /** A disagreement is the moment by right; a clean board celebrates its
   *  best call instead — positive reinforcement is half the value. */
  kind: "disagreement" | "endorsement";
  /** The position in one line — "Partner opened 3♥, then East passed." */
  setting: string;
  learnerCall: string;
  systemCall: string;
  ruleLabel: string;
  /** What the layout says, from the solver — zero to two lines. Facts about
   *  THIS deal, phrased as consequence, never as the verdict. */
  ddLines: string[];
  /** The event-qa label for "Ask about this" — "You bid 3♠". */
  askLabel: string;
}

/** The whole card, as data. Serializable — it crosses server → client. */
export interface BoardTakeaway {
  boardName: string;
  chips: TakeawayChip[];
  /** Chips carrying a verdict. The card only exists when this is > 0. */
  judged: number;
  moment: TakeawayMoment;
  /** The deterministic "one thing to remember" — what the card shows if the
   *  model's line never arrives. Built from the citation, so it cannot be
   *  wrong, only plain. */
  fallbackLine: string;
}

const SEATS = ["N", "E", "S", "W"] as const;
const seatAfter = (from: Seat, n: number): Seat =>
  SEATS[(SEATS.indexOf(from as (typeof SEATS)[number]) + n) % 4]!;

/** "S:AK4 H:Q2 D:- C:9" — the notation the solver's parser reads. */
function renderHand(cards: readonly Card[]): string {
  return (["S", "H", "D", "C"] as const)
    .map((suit) => {
      const ranks = cards
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => "..23456789TJQKA"[c.rank])
        .join("");
      return `${suit}:${ranks || "-"}`;
    })
    .join(" ");
}

const RANK_CODE: Record<number, string> = { 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" };
const cardCode = (card: Card): string => `${card.suit}${RANK_CODE[card.rank] ?? String(card.rank)}`;

/** A contract bid — the only calls the solver can price. */
const isBid = (call: string): boolean => /^[1-7][SHDCN]$/.test(call);

/**
 * Tricks the declaring side takes double-dummy in `strain`, full deal, best
 * play both sides. `undefined` where the deal cannot be read — the cost line
 * is then simply absent, same discipline as every other abstaining authority.
 */
async function ddTricks(
  dealtHands: Record<Seat, Card[]>,
  strain: string,
  declarer: Seat,
): Promise<number | undefined> {
  if (SEATS.some((s) => (dealtHands[s] ?? []).length !== 13)) return undefined;
  const leader = seatAfter(declarer, 1);
  const hands = Object.fromEntries(
    SEATS.map((s) => [s, renderHand(dealtHands[s] ?? [])]),
  ) as LiveCardPlayState["hands"];
  const trump = (strain === "N" ? "NT" : strain) as LiveCardPlayState["trump"];
  const state: LiveCardPlayState = {
    contract: `7${strain === "N" ? "NT" : strain}`,
    trump,
    declarer,
    learnerSeat: declarer,
    role: "declarer",
    dummySeat: partnerOf(declarer),
    hands,
    playFromSeat: leader,
    toLead: true,
    trickSoFar: [],
    legalCards: (dealtHands[leader] ?? []).map(cardCode),
    tricksPlayed: 0,
  };
  const scores = await scoreEveryCard(state);
  if (!scores?.length) return undefined;
  // The solver scores the side ON LEAD — the defenders. Declarer's side gets
  // the rest.
  return 13 - Math.max(...scores.map((s) => s.tricks));
}

/**
 * Who would declare `strain` for the learner's side: the first of the
 * partnership to have named it in the auction so far, else the learner —
 * the bid under discussion would have been the naming.
 */
function declarerFor(auction: readonly { seat: Seat; call: string }[], me: Seat, strain: string): Seat {
  const side = new Set<Seat>([me, partnerOf(me)]);
  for (const a of auction) {
    if (side.has(a.seat) && isBid(a.call) && a.call[1] === strain) return a.seat;
  }
  return me;
}

/** The cost line for one bid — "3♠ takes 7 tricks double-dummy — it needs 9." */
async function ddLine(
  dealtHands: Record<Seat, Card[]>,
  auction: readonly { seat: Seat; call: string }[],
  me: Seat,
  call: string,
): Promise<string | undefined> {
  if (!isBid(call)) return undefined;
  const strain = call[1]!;
  const needed = Number(call[0]) + 6;
  const tricks = await ddTricks(dealtHands, strain, declarerFor(auction, me, strain));
  if (tricks === undefined) return undefined;
  const label = callLabel(call as Call);
  if (tricks === needed) return `${label} takes exactly ${tricks} tricks double-dummy — just what it needs.`;
  return tricks > needed
    ? `${label} takes ${tricks} tricks double-dummy — ${tricks - needed} more than it needs.`
    : `${label} takes ${tricks} tricks double-dummy — it needs ${needed}.`;
}

/**
 * The position at the key moment, in one line — the same summarising voice
 * as looking.ts's auction sentence, but past tense: this decision is behind
 * the learner now.
 */
function momentSetting(auction: readonly { seat: Seat; call: string }[], me: Seat): string {
  const spoken = auction.filter((a) => a.call !== "P");
  const last = spoken[spoken.length - 1];
  if (!last) {
    return auction.length
      ? `${auction.length} pass${auction.length === 1 ? "" : "es"} to you — nobody had bid.`
      : "Your decision opened the board.";
  }
  const verb = spoken.length === 1 ? "opened" : "bid";
  let s = `${Relative(last.seat, me)} ${verb} ${callLabel(last.call as Call)}`;
  const after = auction.slice(auction.lastIndexOf(last) + 1);
  if (after.length === 1) s += `, then ${relative(after[0]!.seat, me)} passed`;
  else if (after.length > 1) s += `, then ${after.length} passes`;
  return `${s}.`;
}

/** The event-qa row label for the moment — matches looking.ts's phrasing. */
function askLabel(call: string): string {
  if (call === "P") return "You passed";
  if (call === "X") return "You doubled";
  if (call === "XX") return "You redoubled";
  return `You bid ${callLabel(call as Call)}`;
}

interface JudgedCall {
  chip: TakeawayChip;
  stateBefore: GameState;
  detail: CallVerdict | null;
}

/**
 * Build the takeaway for a finished board, or `null` where there is nothing
 * honest to build: no learner seat at the auction, or a rulebook that was
 * silent on every call the learner made. A coach with nothing to say says
 * nothing — the NOW screen then stays exactly as it is.
 *
 * Never throws, same contract as coachNotesForBoard: a takeaway that fails
 * is a takeaway that does not appear, and the table must be unaffected.
 */
export async function boardTakeaway(input: {
  record: {
    sessionId: string;
    board: { name: string; dealer: Seat };
    events: readonly GameEvent[];
    seats: Record<Seat, SeatConfig>;
  };
  vul: Vul;
  /** Hands AS DEALT — during play `state.hands` has been emptied by the tricks. */
  dealtHands: Record<Seat, Card[]>;
  learnerSeat: Seat;
  compiled: CompiledKb;
}): Promise<BoardTakeaway | null> {
  try {
    return await build(input);
  } catch (err) {
    console.error("[coach] takeaway failed", { sessionId: input.record.sessionId, err });
    return null;
  }
}

async function build({
  record,
  vul,
  dealtHands,
  learnerSeat,
  compiled,
}: Parameters<typeof boardTakeaway>[0]): Promise<BoardTakeaway | null> {
  const verdicts = bridgeVerdicts({
    compiled,
    player: partnershipSystem(record.seats, learnerSeat),
  });

  // Replay the board to each learner call's stateBefore — the position the
  // learner actually faced, which is the only thing a verdict may be computed
  // against.
  let state = initialState(record.board.name, record.board.dealer, vul, dealtHands);
  let auctionIndex = 0;
  const judged: JudgedCall[] = [];
  for (const event of record.events) {
    if (!isActionEvent(event)) continue;
    if (event.category === "bid-event") {
      if (event.seat === learnerSeat) {
        const detail = await verdicts.forCall(state, learnerSeat, event.call as Call);
        judged.push({
          stateBefore: state,
          detail,
          chip: {
            eventId: `call-${auctionIndex}`,
            auctionIndex,
            call: event.call,
            label: callLabel(event.call as Call),
            ...(detail
              ? {
                  verdict: detail.evaluation.correctness as TakeawayChip["verdict"],
                  severity: detail.evaluation.severity,
                  systemCall: callLabel(detail.systemCall),
                  ruleLabel: detail.ruleLabel,
                }
              : {}),
          },
        });
      }
      auctionIndex++;
    }
    state = applyEvent(state, event);
  }

  const withVerdict = judged.filter((j) => j.detail);
  if (!withVerdict.length) return null;

  // The moment that mattered, picked mechanically: the highest-severity
  // disagreement, earliest on a tie — the first wrong turning is usually the
  // instructive one. A clean board dwells on its best call instead: the
  // latest judged REAL action (a bid over a pass), else the latest judged
  // call of any kind.
  const rank: Record<string, number> = { major: 2, moderate: 1, minor: 0 };
  const wrong = withVerdict
    .filter((j) => j.chip.verdict === "incorrect")
    .sort(
      (a, b) =>
        (rank[b.chip.severity ?? "minor"]! - rank[a.chip.severity ?? "minor"]!) ||
        a.chip.auctionIndex - b.chip.auctionIndex,
    );
  const pick =
    wrong[0] ??
    [...withVerdict].reverse().find((j) => isBid(j.chip.call)) ??
    withVerdict[withVerdict.length - 1]!;
  const detail = pick.detail!;
  const kind = pick.chip.verdict === "incorrect" ? "disagreement" : "endorsement";
  const auction = pick.stateBefore.auction;

  // The layout's word on it. For a disagreement both calls get priced where
  // the solver can price them; an endorsement prices the call it is praising.
  const ddLines = (
    await Promise.all(
      kind === "disagreement"
        ? [
            ddLine(dealtHands, auction, learnerSeat, pick.chip.call),
            ddLine(dealtHands, auction, learnerSeat, detail.systemCall),
          ]
        : [ddLine(dealtHands, auction, learnerSeat, pick.chip.call)],
    )
  ).filter((l): l is string => Boolean(l));

  const learnerCall = pick.chip.label;
  const systemCall = callLabel(detail.systemCall);
  const moment: TakeawayMoment = {
    eventId: pick.chip.eventId,
    auctionIndex: pick.chip.auctionIndex,
    kind,
    setting: momentSetting(auction, learnerSeat),
    learnerCall,
    systemCall,
    ruleLabel: detail.ruleLabel,
    ddLines,
    askLabel: askLabel(pick.chip.call),
  };

  return {
    boardName: record.board.name,
    chips: judged.map((j) => j.chip),
    judged: withVerdict.length,
    moment,
    fallbackLine:
      kind === "disagreement"
        ? `Your system's agreement here — ${detail.ruleLabel} — makes it ${systemCall}, not ${learnerCall}.`
        : `${learnerCall} is exactly what your system plays here — ${detail.ruleLabel}.`,
  };
}
