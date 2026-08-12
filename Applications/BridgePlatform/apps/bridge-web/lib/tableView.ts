// ONE resolver for what a table IS to its viewer — extracted from the table2
// page (T0 of the native-table work) so the SSR page and GET
// /api/bridge/sessions/[id]/view can never disagree. Policy lives HERE and
// only here: seat identity, the declarer takeover, dummy visibility timing,
// show-all gating, bidding-only completion, and the access catalogue with the
// challenge's control overrides laid over it. The native client renders these
// answers; it re-derives none of them.
//
// SIDE EFFECTS RIDE THE RESOLVER, deliberately. Assignment delivery
// (deliverForSession) and the challenge freeze (inside challengeTableContext)
// used to fire only when someone rendered the PAGE — a native table that
// never loads the page would silently break review delivery and challenge
// completion. Resolving a view IS "someone looked at the board", whichever
// door they came through.

import type { Seat } from "@bridge/events";
import { controllingSeat, type SessionView } from "@bridge/sessions";
import type { TableAppearance } from "@bridge/table-config";
import { after } from "next/server";
import type { NexusBridgeContext } from "@laic/learner-contracts";

import {
  applyControlOverrides,
  type TableControlAccess,
} from "@/app/bridge/table2/[sessionId]/challengeControls";
import {
  challengeTableContext,
  practiceIsBiddingOnly,
  tableControlAccess,
  type ChallengeTableContext,
} from "@/app/bridge/table2/[sessionId]/challengeTable";
import { getAppearance } from "@/lib/appearance";
import { sessionService } from "@/lib/sessions";

export interface TableViewOptions {
  /** The ?hands= toggle: "all" opens every hand (gate permitting), "mine"
   *  forces own-seat view even for a spectator. Absent = the default rule. */
  hands?: string | undefined;
}

export interface LoadedTableView {
  view: SessionView;
  /** PLAYED OUT, narrowly — the engine's own "complete" phase. Assignment
   *  delivery and the hands-record peek key on this strict sense. */
  playedOut: boolean;
  /** The board ends when the auction ends (challenge format, or a practice
   *  replay's own stamp) — derived from format+phase, never from the freeze. */
  biddingOnly: boolean;
  auctionWasTheBoard: boolean;
  /** Nothing left to do — either phase, either format. */
  boardOver: boolean;
  /** The event log's head — the client's reconciliation cursor. */
  headSeq: number;
  challenge: ChallengeTableContext | null;
  /** Catalogue answers with the board's overrides applied, BOTH directions. */
  control: TableControlAccess;
  appearance: TableAppearance;
  mySeat: Seat | null;
  dummy: Seat | null;
  /** THE LEARNER NEVER SITS OUT: their robot partner won the contract, so
   *  they play the declarer's chair. Same rule the service gates act() on. */
  takeover: boolean;
  /** The seat the learner plays FROM — their own, unless they took over. */
  declaringSeat: Seat | null;
  myTurn: boolean;
  canSeeAllHands: boolean;
  showAll: boolean;
  /** Which hands this viewer sees face-up, RIGHT NOW. */
  visible: Record<Seat, boolean>;
  /** The rail-sized board label — trailing digits of a "seeded-26105" name. */
  boardNumber: string;
  /** Seat PLATES. Under a takeover "you" follows the CARDS, not the chair:
   *  the seat being declared from says "you", the dealt seat says "your
   *  seat · dummy" — the swap is legible instead of two plates both claiming
   *  to be the same person. */
  seats: Record<Seat, { name: string; strip: string; human: boolean; tag: string }>;
  /** Raw chair names ("you"/"human"/robot label), takeover-blind — what the
   *  seat-swap panel labels chairs with. */
  seatNames: Record<Seat, string>;
}

/**
 * The mutation envelope every table route answers with — ONE reconciliation
 * path for the native client: `events` past the caller's cursor, the new
 * head, and the turn facts. `state` rides along for cheap full resync
 * (headSeq < confirmedSeq after an undo → rebuild from it).
 */
export function sessionEnvelope(view: SessionView, sinceSeq?: number) {
  const { record, state, actingSeat, actingIsHuman } = view;
  const events =
    sinceSeq === undefined ? record.events : record.events.filter((e) => e.seq > sinceSeq);
  return {
    events,
    headSeq: record.events.length ? record.events[record.events.length - 1]!.seq : -1,
    status: record.status,
    state,
    actingSeat,
    actingIsHuman,
    complete: state.phase === "complete",
  };
}

/** Identity strips (SeatPlate design): humans petrol, robots a distinct color
 *  per seat — what tells two BENs at one table apart. */
const ROBOT_STRIPS: Record<Seat, string> = {
  N: "#e0813a",
  E: "#8e5bc4",
  S: "#3aa0e0",
  W: "#3ab77a",
};

/**
 * Resolve one session for one viewer. `{ ok: false }` when the session is
 * gone — an ordinary event (a discarded board tapped from a stale list); the
 * caller decides what "gone" renders as.
 */
export async function loadTableView(
  context: NexusBridgeContext,
  sessionId: string,
  options: TableViewOptions = {},
): Promise<{ ok: true; v: LoadedTableView } | { ok: false }> {
  // The viewer's appearance and the session fold need nothing from each
  // other — run together (sequential was ~260ms of the open, 2026-08-09).
  const [appearance, viewResult] = await Promise.all([
    getAppearance(context.nexusUserId),
    sessionService()
      .view(sessionId)
      .then((v) => ({ ok: true as const, v }))
      .catch(() => ({ ok: false as const })),
  ]);
  if (!viewResult.ok) return { ok: false };
  const view = viewResult.v;
  const { record, state, actingSeat, actingIsHuman } = view;
  const playedOut = state.phase === "complete";

  // THE COMPLETION EVENT. Finishing an assigned board is what sends the play
  // to its reviewers, and this is the moment we know it finished. after() so
  // no viewer waits on it; delivery is idempotent.
  if (playedOut) {
    after(async () => {
      const { deliverForSession } = await import("@/lib/assignments");
      await deliverForSession(sessionId);
    });
  }

  // CHALLENGE BRANCH: null for every ordinary table. This call is also where
  // a finished challenge board is frozen into its play record.
  const challenge = await challengeTableContext(view, context);

  // BIDDING-ONLY (owner, 2026-08-10): the board ends when the auction ends.
  // From the challenge's format — or, for a chrome-less practice replay, the
  // session's own stamp — never from the freeze.
  const biddingOnly = challenge ? challenge.biddingOnly : await practiceIsBiddingOnly(view);
  const auctionWasTheBoard = biddingOnly && state.phase !== "auction";
  const boardOver = playedOut || auctionWasTheBoard;

  // Access catalogue first, then the board's controlOverrides laid OVER it in
  // BOTH directions (spec §7) — one place the two layers meet.
  const control = applyControlOverrides(
    await tableControlAccess(context),
    challenge?.board.controlOverrides,
  );

  const mySeat =
    (Object.entries(record.seats) as [Seat, (typeof record.seats)[Seat]][]).find(
      ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
    )?.[0] ?? null;

  const dummy =
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;

  // THE LEARNER NEVER SITS OUT (origin/main's takeover rule): dummy's cards
  // belong to the declarer, so a learner whose ROBOT partner won the contract
  // plays the declarer's chair — refused when that chair holds another PERSON.
  const takeover =
    mySeat != null &&
    dummy === mySeat &&
    !!state.contract &&
    record.seats[state.contract.declarer].kind !== "human";
  const declaringSeat = takeover ? state.contract!.declarer : null;

  // Same function the service gates act() on — the felt cannot offer a play
  // the server would refuse, or hide one it would accept.
  const controller = controllingSeat(record.seats, state, actingSeat);
  const myTurn =
    !boardOver &&
    actingIsHuman &&
    record.seats[controller].kind === "human" &&
    (record.seats[controller] as { nexusUserId: string }).nexusUserId === context.nexusUserId;

  // At a challenge board the Hands control governs the CAPABILITY: hidden
  // means unreachable, so ?hands=all is refused too.
  const canSeeAllHands = !challenge || control["table.hands_view"];
  const showAll =
    (options.hands === "all" || (options.hands !== "mine" && !mySeat)) && canSeeAllHands;
  // Dummy spreads only after the opening lead — real-bridge timing. A
  // finished board is face-up, and a bidding-only board is finished the
  // moment the auction is.
  const leadMade = state.tricks.length > 0 && (state.tricks[0]?.plays.length ?? 0) > 0;
  const canSee = (seat: Seat) =>
    showAll ||
    seat === mySeat ||
    // The hand they took over is theirs from the moment they took it.
    seat === declaringSeat ||
    (seat === dummy && leadMade) ||
    boardOver;
  const visible = { N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") };

  const seatName = (seat: Seat) => {
    const c = record.seats[seat];
    return c.kind === "human" ? (c.nexusUserId === context.nexusUserId ? "you" : "human") : c.label;
  };
  const seatNames = Object.fromEntries(
    (["N", "E", "S", "W"] as Seat[]).map((seat) => [seat, seatName(seat)]),
  ) as LoadedTableView["seatNames"];
  const seats = Object.fromEntries(
    (["N", "E", "S", "W"] as Seat[]).map((seat) => [
      seat,
      {
        // Under a takeover "you" follows the CARDS, not the chair.
        name:
          takeover && seat === declaringSeat
            ? "you"
            : takeover && seat === mySeat
              ? "your seat"
              : seatName(seat),
        strip: record.seats[seat].kind === "human" ? "#12525e" : ROBOT_STRIPS[seat],
        human: record.seats[seat].kind === "human" || (takeover && seat === declaringSeat),
        tag: dummy === seat ? "dummy" : "",
      },
    ]),
  ) as LoadedTableView["seats"];

  // The board card in the rail is sized for a number; "seeded-26105" is not
  // one, so show the trailing digits and keep the full name for the tooltip.
  const boardNumber = /(\d+)\s*$/.exec(record.board.name)?.[1] ?? record.board.name;

  return {
    ok: true,
    v: {
      view,
      playedOut,
      biddingOnly,
      auctionWasTheBoard,
      boardOver,
      // Seqs start at 0, so an empty log's head sits below the first one.
      headSeq: record.events.length ? record.events[record.events.length - 1]!.seq : -1,
      challenge,
      control,
      appearance,
      mySeat,
      dummy,
      takeover,
      declaringSeat,
      myTurn,
      canSeeAllHands,
      showAll,
      visible,
      boardNumber,
      seats,
      seatNames,
    },
  };
}
