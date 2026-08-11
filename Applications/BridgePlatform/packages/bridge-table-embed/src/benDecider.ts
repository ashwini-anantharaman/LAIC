// BEN as a `decide` for the embedded table — a browser fetch and nothing else.
//
// BEN (github.com/lorserker/ben) answers three GETs: /bid for the auction,
// /lead for the opening lead, /play for every card after it. This turns a
// GameState into those requests and the answers back into a call or a card.
//
// WHY IT LIVES HERE. The platform has the same conversion in
// apps/bridge-web/lib/{benchmark,benSeat}.ts, but those modules are SERVER-ONLY
// — they read process.env and are imported by server actions. An embedded table
// has no server, so the wire format has to travel with the component. The
// functions below are ports of those, kept deliberately literal so a reader can
// diff them; converging both onto one shared module is the obvious follow-up
// and is noted in the package README.
//
// DEGRADE, NEVER BREAK. Every failure — unreachable, timeout, illegal answer —
// returns null. The table simply does not move that seat, which is honest and
// leaves the board playable; it never throws into the render tree.

import { legalCalls, legalPlays, type GameState } from "@bridge/engine";
import { rankLabel, type AuctionCall, type Call, type Card, type Seat, type Suit, type Vul } from "@bridge/events";
import type { BridgeDecide, BridgeDecision } from "./BridgeTable";

const SUIT_ORDER: Suit[] = ["S", "H", "D", "C"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const RANK_OF: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** 10 is "T" on the wire; every other rank is its usual label. */
function pbnRank(rank: number): string {
  return rank === 10 ? "T" : rankLabel(rank as never);
}

/** A hand as BEN's PBN holding: "AKQ.J54.T92.8763" in ♠.♥.♦.♣ order. */
export function handToPbn(cards: readonly Card[]): string {
  return SUIT_ORDER.map((suit) =>
    cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => pbnRank(c.rank))
      .join(""),
  ).join(".");
}

/** One call as a ctx token: 2-char bid, '--' pass, 'Db' double, 'Rd' redouble. */
function callToCtxToken(call: Call): string {
  if (call === "P") return "--";
  if (call === "X") return "Db";
  if (call === "XX") return "Rd";
  return call;
}

/** The auction so far, as concatenated ctx tokens (empty = opening bid). */
export function auctionToCtx(auction: readonly AuctionCall[]): string {
  return auction.map((c) => callToCtxToken(c.call)).join("");
}

/** BEN's vul code: none empty, both @v@V, NS @v, EW @V. */
export function vulToBen(vul: Vul): string {
  return vul === "both" ? "@v@V" : vul === "ns" ? "@v" : vul === "ew" ? "@V" : "";
}

/** The play so far as BEN's `played` string: "DJDKD3D2…" in play order. */
export function playedToBen(state: Pick<GameState, "tricks">): string {
  return state.tricks
    .flatMap((t) => t.plays)
    .map((p) => `${p.card.suit}${pbnRank(p.card.rank)}`)
    .join("");
}

/** A seat's ORIGINAL 13 cards: what it still holds plus what it has played. */
export function originalHand(
  state: Pick<GameState, "hands" | "tricks">,
  seat: Seat,
): Card[] {
  return [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) =>
      t.plays.filter((p) => p.seat === seat).map((p) => p.card),
    ),
  ];
}

/** BEN's returned call in our notation. Unknown tokens pass through. */
export function normalizeBenCall(bid: string): Call {
  const b = bid.trim().toUpperCase();
  if (b === "PASS" || b === "P" || b === "--" || b === "PA") return "P";
  if (b === "X" || b === "DB" || b === "DBL" || b === "DOUBLE") return "X";
  if (b === "XX" || b === "RD" || b === "REDBL" || b === "REDOUBLE") return "XX";
  const m = /^([1-7])(NT|N|C|D|H|S)$/.exec(b);
  if (m) return `${m[1]}${m[2] === "NT" ? "N" : m[2]}`;
  return b as Call;
}

/** "S7" / "HT" / "CA" → a Card, or null when unparseable. */
export function parseBenCard(raw: string): Card | null {
  const m = /^([SHDC])([2-9TJQKA])$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  return { suit: m[1] as Suit, rank: RANK_OF[m[2]!]! as Card["rank"] };
}

export interface BenDeciderOptions {
  /** Where BEN is. No trailing slash needed. */
  endpoint: string;
  /** Per-request ceiling. BEN's hard bids can take tens of seconds. */
  timeoutMs?: number;
  /** Swap in for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Called with a one-line reason whenever a seat is skipped. */
  onProblem?: (why: string) => void;
}

/**
 * A `decide` backed by BEN. Give it to <BridgeTable decide={...}/> and the three
 * seats the learner is not sitting in are played by the neural engine.
 */
export function createBenDecider({
  endpoint,
  timeoutMs = 60_000,
  fetchImpl,
  onProblem,
}: BenDeciderOptions): BridgeDecide {
  const base = endpoint.replace(/\/$/, "");
  const doFetch: typeof fetch = fetchImpl ?? ((...a) => fetch(...a));

  const get = async (path: string, params: Record<string, string>) => {
    const url = `${base}${path}?${new URLSearchParams({ ...params, details: "true" })}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  };

  return async (state: GameState, seat: Seat): Promise<BridgeDecision | null> => {
    const vul = vulToBen(state.vul);
    const ctx = auctionToCtx(state.auction);
    try {
      if (state.phase === "auction") {
        const body = await get("/bid", {
          hand: handToPbn(originalHand(state, seat)),
          seat,
          dealer: state.dealer,
          vul,
          ctx,
        });
        const raw = typeof body.bid === "string" ? body.bid : "";
        const call = normalizeBenCall(raw);
        if (!legalCalls(state.auction, seat).has(call)) {
          onProblem?.(`BEN answered "${raw}" for ${seat}, which is not legal here`);
          return null;
        }
        return { call };
      }

      if (state.phase === "play") {
        const played = playedToBen(state);
        const declarer = state.contract?.declarer ?? null;
        const dummy = declarer ? PARTNER[declarer] : null;
        // BEN infers who is on play from `played`; when the dummy is on play we
        // ask as the DECLARER, matching how the platform's decider does it.
        const asSeat = seat === dummy && declarer ? declarer : seat;
        const body =
          played === ""
            ? await get("/lead", {
                hand: handToPbn(originalHand(state, seat)),
                seat,
                dealer: state.dealer,
                vul,
                ctx,
              })
            : await get("/play", {
                hand: handToPbn(originalHand(state, asSeat)),
                dummy: dummy ? handToPbn(originalHand(state, dummy)) : "",
                seat: asSeat,
                dealer: state.dealer,
                vul,
                ctx,
                played,
              });
        const raw = typeof body.card === "string" ? body.card : "";
        const card = parseBenCard(raw);
        if (!card) {
          onProblem?.(`BEN answered "${raw}" for ${seat}, which is not a card`);
          return null;
        }
        const legal = legalPlays(state, seat);
        if (!legal.some((c) => c.suit === card.suit && c.rank === card.rank)) {
          onProblem?.(`BEN's ${raw} is not legal for ${seat} here`);
          return null;
        }
        return { card };
      }
      return null;
    } catch (e) {
      onProblem?.(`BEN could not be reached (${(e as Error).message})`);
      return null;
    }
  };
}
