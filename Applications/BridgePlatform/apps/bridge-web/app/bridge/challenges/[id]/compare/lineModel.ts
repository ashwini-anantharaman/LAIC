// From a frozen snapshot to a renderable line — the ONE place the comparison
// surface touches bridge law.
//
// A `ChallengeSnapshot` is a record of what happened: an auction, a flat list
// of cards, a couple of display strings. The comparison needs a little more —
// which side declared, what the trump suit was, who won each trick — and every
// one of those is a rule, not a preference. They are resolved here, on the
// server, with @bridge/engine, and travel to the client as plain data. That is
// what keeps `compareView.ts` pure (and its rules unit-testable), and keeps the
// engine out of the browser bundle.
//
// SERVER-ONLY.

import type { ChallengeBoard, ChallengeSnapshot } from "@bridge/challenges";
import { trickWinner } from "@bridge/engine";
import type { AuctionCall, Card, Seat } from "@bridge/events";
import { finalContract } from "@bridge/engine";
import {
  GLYPH,
  SEAT_NAME,
  isRedSuit,
  type CompareLine,
  type LineKind,
} from "./compareView";

/** Everything about a line that is a naming decision rather than a rule. */
export interface LineIdentity {
  key: string;
  kind: LineKind;
  who: string;
  short: string;
  badge: string;
  editor?: boolean;
  isViewer?: boolean;
}

/** The board's raw score from the human seat's side, as the leaderboard signs it. */
function rawText(raw: number | undefined): string {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return "";
  return raw > 0 ? `+${raw}` : String(raw);
}

/**
 * Winner of each COMPLETED trick. A four-card trick is the unit the engine
 * scores, so a line interrupted mid-trick contributes nothing for that trick —
 * the tally the reader sees can never run ahead of the cards on the table.
 */
function trickWinners(play: readonly { seat: Seat; card: Card }[], trump: Card["suit"] | "N"): Seat[] {
  const winners: Seat[] = [];
  for (let i = 0; i + 3 < play.length; i += 4) {
    const plays = play.slice(i, i + 4).map((p) => ({ seat: p.seat, card: p.card }));
    const leader = plays[0]?.seat;
    if (!leader) break;
    winners.push(trickWinner({ leader, plays }, trump));
  }
  return winners;
}

export function buildCompareLine(input: {
  identity: LineIdentity;
  snapshot: ChallengeSnapshot;
  board: Pick<ChallengeBoard, "humanSeat">;
  rawScore?: number;
}): CompareLine {
  const { identity, snapshot, board } = input;
  const auction = snapshot.auction.map((a) => ({ seat: a.seat, call: a.call }));
  const play = snapshot.play.map((p) => ({ seat: p.seat, card: p.card }));
  const contract = finalContract(auction as AuctionCall[]);
  const trump = contract?.strain ?? "N";
  const winners = contract ? trickWinners(play, trump) : [];

  // Made or down, from the tricks actually won — the same arithmetic the
  // scoring engine does, so a line and its score can never disagree.
  const declarerSide = contract
    ? winners.filter((w) =>
        contract.declarer === "N" || contract.declarer === "S"
          ? w === "N" || w === "S"
          : w === "E" || w === "W",
      ).length
    : 0;
  const need = contract ? contract.level + 6 : 0;
  const over = declarerSide - need;
  const complete = play.length === 52;
  const result = !contract
    ? "Passed out"
    : !complete
      ? `${declarerSide} tricks so far`
      : over === 0
        ? `Made ${contract.level}`
        : over > 0
          ? `Made +${over}`
          : `Down ${-over}`;

  const dbl = contract?.doubled === 1 ? " X" : contract?.doubled === 2 ? " XX" : "";
  const strainText = contract
    ? contract.strain === "N"
      ? "NT"
      : (GLYPH[contract.strain] as string)
    : "";

  return {
    key: identity.key,
    kind: identity.kind,
    who: identity.who,
    short: identity.short,
    badge: identity.badge,
    editor: !!identity.editor,
    isViewer: !!identity.isViewer,
    contract: contract ? `${contract.level}${strainText}${dbl}` : "Passed out",
    contractRed: !!contract && contract.strain !== "N" && isRedSuit(contract.strain),
    byLine: contract
      ? contract.declarer === board.humanSeat
        ? `by ${identity.short}`
        : `by ${SEAT_NAME[contract.declarer]}`
      : "",
    declarer: contract?.declarer ?? null,
    result,
    made: !!contract && complete && over >= 0,
    rawText: rawText(input.rawScore),
    auction,
    play,
    seatCards: snapshot.hands[board.humanSeat] ?? [],
    trickWinners: winners,
  };
}

/** The identity of each BEN line, so the page and the action name them alike. */
export function benIdentity(kind: "full_ben" | "your_contract" | "from_point", key: string): LineIdentity {
  if (kind === "full_ben")
    return { key, kind, who: "BEN's board", short: "BEN", badge: "BEN" };
  if (kind === "your_contract")
    return { key, kind, who: "BEN in your contract", short: "BEN", badge: "BEN" };
  return { key, kind, who: "BEN from here", short: "BEN", badge: "BEN · FROM HERE" };
}
