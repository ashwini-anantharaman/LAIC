// BEN as a table character (2026-07-28): full bidding AND card play.
//
// BEN (github.com/lorserker/ben, GPL — always a separate service over HTTP,
// never bundled) exposes everything a seat needs:
//   GET /bid   — the auction        GET /lead  — the opening lead
//   GET /play  — every later card   (per the image's README-api.md)
//
// DUMMY. BEN's /play infers who is on play from the `played` sequence and
// answers for that hand — the same model as our engine, whose controllerFor()
// routes the dummy's turn to the DECLARER's decider. So when this decider is
// asked for a card while the dummy is on play, it asks BEN as the declarer
// (hand = declarer's, dummy = dummy's) and BEN returns the dummy's card.
//
// ORIGINAL HANDS. BEN wants pre-play 13-card holdings plus the full `played`
// sequence (it replays them); our GameState removes cards as they are played,
// so holdings are reconstructed from state.hands + state.tricks.
//
// PROD BEHAVIOUR — degrade, never break the table. Every BEN failure (endpoint
// down, timeout, illegal or unparseable answer) becomes an honest decision
// instead of a thrown error: bids fall back to Pass, plays fall back to the
// engine's own fallback chain, and in both cases the decision's `reason` says
// exactly what happened, so the rail shows it and the board stays playable.
//
// SERVER-ONLY: never import from a client component.

import { createKbDecider, legalCalls, legalPlays, type Decision, type GameState } from "@bridge/engine";
import { callLabel, type Call, type Card, type Seat, type Suit } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { SeatDecider, SessionServiceOptions } from "@bridge/sessions";
import {
  auctionToCtx,
  benAvailable,
  handToPbn,
  normalizeBenCall,
  pbnRank,
  vulToBen,
  type BenBidResult,
} from "./benchmark";

export { benAvailable };

/** The label a BEN seat carries — the plate and traces show it. */
export const BEN_SEAT_LABEL = "BEN · neural";

const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const RANK_OF: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without BEN).
// ---------------------------------------------------------------------------

/** "S7" / "HT" / "CA" → a Card, or null when unparseable. */
export function parseBenCard(raw: string): Card | null {
  const m = /^([SHDC])([2-9TJQKA])$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  return { suit: m[1] as Suit, rank: RANK_OF[m[2]!]! as Card["rank"] };
}

/** The full play-so-far as BEN's `played` string: "DJDKD3D2…" in play order. */
export function playedToBen(state: Pick<GameState, "tricks">): string {
  return state.tricks
    .flatMap((t) => t.plays)
    .map((p) => `${p.card.suit}${pbnRank(p.card.rank)}`)
    .join("");
}

/** A seat's ORIGINAL 13-card holding: remaining cards + what it already played. */
export function originalHand(state: Pick<GameState, "hands" | "tricks">, seat: Seat): Card[] {
  return [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) => t.plays.filter((p) => p.seat === seat).map((p) => p.card)),
  ];
}

// ---------------------------------------------------------------------------
// The table client — /bid, /lead and /play against BEN_ENDPOINT.
// ---------------------------------------------------------------------------

export interface BenCardResult {
  card: string;
  who?: string;
  candidates: { card?: string; insta_score?: number; explanation?: string }[];
}

export interface BenTableClient {
  bid(params: Record<string, string>): Promise<BenBidResult>;
  lead(params: Record<string, string>): Promise<BenCardResult>;
  play(params: Record<string, string>): Promise<BenCardResult>;
}

export function createBenTableClient(opts?: {
  endpoint?: string;
  timeoutMs?: number;
}): BenTableClient {
  const endpoint = opts?.endpoint ?? process.env.BEN_ENDPOINT;
  if (!endpoint) throw new Error("BEN needs BEN_ENDPOINT configured on the server");
  const base = endpoint.replace(/\/$/, "");
  const timeoutMs =
    opts?.timeoutMs ?? (Number(process.env.BEN_TIMEOUT_MS || "") || 20_000);

  const get = async (path: string, params: Record<string, string>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${base}${path}?${new URLSearchParams({ ...params, details: "true" })}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (e) {
      throw new Error(
        `BEN is unreachable at ${base} — is the container running? (${(e as Error).message})`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`BEN ${path} returned HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };

  const asCardResult = (data: Record<string, unknown>): BenCardResult => ({
    card: String(data.card ?? ""),
    who: typeof data.who === "string" ? data.who : undefined,
    candidates: Array.isArray(data.candidates)
      ? (data.candidates as Record<string, unknown>[]).map((c) => ({
          card: typeof c.card === "string" ? c.card : undefined,
          insta_score: typeof c.insta_score === "number" ? c.insta_score : undefined,
          explanation: typeof c.explanation === "string" ? c.explanation : undefined,
        }))
      : [],
  });

  return {
    async bid(params) {
      const data = await get("/bid", params);
      return {
        bid: normalizeBenCall(String(data.bid ?? "")),
        who: typeof data.who === "string" ? data.who : undefined,
        quality: typeof data.quality === "string" ? data.quality : undefined,
        candidates: Array.isArray(data.candidates)
          ? (data.candidates as Record<string, unknown>[]).map((c) => ({
              call: normalizeBenCall(String(c.call ?? c.bid ?? "")),
              insta_score: typeof c.insta_score === "number" ? c.insta_score : undefined,
              explanation: typeof c.explanation === "string" ? c.explanation : undefined,
            }))
          : [],
      };
    },
    lead: async (params) => asCardResult(await get("/lead", params)),
    play: async (params) => asCardResult(await get("/play", params)),
  };
}

// ---------------------------------------------------------------------------
// The seat decider.
// ---------------------------------------------------------------------------

/** Builds the engine-fallback decider a BEN seat degrades to. Injectable. */
export type FallbackFactory = (args: {
  compiled: CompiledKb;
  sessionId: string;
  seat: Seat;
}) => SeatDecider;

const defaultFallback: FallbackFactory = ({ compiled, sessionId, seat }) =>
  createKbDecider({
    compiled,
    player: { enabledPackIds: [], settingOverrides: {}, decisionPolicyId: "first_match" },
    seed: `${sessionId}_${seat}_ben`,
  });

/**
 * The benDecider option for SessionService. Both collaborators are injectable
 * so the whole decision surface unit-tests without BEN or a compiled KB.
 */
export function benSeatDecider(
  clientFactory: () => BenTableClient = () => createBenTableClient(),
  fallbackFactory: FallbackFactory = defaultFallback,
): NonNullable<SessionServiceOptions["benDecider"]> {
  return ({ record, compiled, seat: benSeat }) => {
    const fallback = fallbackFactory({ compiled, sessionId: record.sessionId, seat: benSeat });

    const bidFacts = { source: "BEN" };

    return {
      async decideBid(state: GameState, actingSeat: Seat): Promise<Decision<Call>> {
        const legal = legalCalls(state.auction, actingSeat);
        let result: BenBidResult;
        try {
          result = await clientFactory().bid({
            hand: handToPbn(state.hands[actingSeat]),
            seat: actingSeat,
            dealer: state.dealer,
            vul: vulToBen(state.vul),
            ctx: auctionToCtx(state.auction),
          });
        } catch (e) {
          // Degrade, don't break the table: pass, and say why in the trace.
          console.error(`[ben-seat] bid failed for ${actingSeat}:`, e);
          return {
            action: "P",
            candidates: ["P"],
            trace: [],
            citedSettings: [],
            facts: bidFacts,
            reason: `BEN could not be reached — passed (${(e as Error).message})`,
            rejected: [],
            fallback: true,
          };
        }

        const illegal = !legal.has(result.bid);
        const action: Call = illegal ? "P" : result.bid;
        const top = result.candidates.find((c) => c.call === result.bid);
        const reason = illegal
          ? `BEN chose ${callLabel(result.bid)}, which is not legal here — passed instead`
          : top?.explanation
            ? `BEN: ${top.explanation}`
            : `BEN neural engine${typeof top?.insta_score === "number" ? ` (score ${top.insta_score.toFixed(2)})` : ""}`;

        return {
          action,
          candidates: result.candidates.map((c) => c.call).filter((c) => legal.has(c)),
          trace: [],
          citedSettings: [],
          facts: bidFacts,
          reason,
          rejected: result.candidates
            .filter((c) => c.call !== action)
            .slice(0, 4)
            .map((c) => ({
              action: callLabel(c.call),
              why:
                c.explanation ??
                (typeof c.insta_score === "number"
                  ? `BEN score ${c.insta_score.toFixed(2)}`
                  : "BEN candidate"),
            })),
          fallback: false,
        };
      },

      async decidePlay(state: GameState, actingSeat: Seat): Promise<Decision<Card>> {
        // Engine-legal cards for the hand on play — the guard on everything.
        const legal = legalPlays(state, actingSeat);
        const legalSet = new Set(legal.map((c) => `${c.suit}${c.rank}`));

        const degrade = async (why: string): Promise<Decision<Card>> => {
          const d = await fallback.decidePlay(state, actingSeat);
          return { ...d, fallback: true, reason: `${why} — ${d.reason}` };
        };

        const declarer = state.contract?.declarer;
        const dummySeat = declarer ? PARTNER[declarer] : null;
        const played = playedToBen(state);
        const ctx = auctionToCtx(state.auction);
        const vul = vulToBen(state.vul);

        let result: BenCardResult;
        try {
          if (played === "") {
            // The opening lead: dummy is still hidden; /lead sees only the hand.
            result = await clientFactory().lead({
              hand: handToPbn(originalHand(state, actingSeat)),
              seat: actingSeat,
              dealer: state.dealer,
              vul,
              ctx,
            });
          } else {
            // Everything after the lead. BEN infers who is on play from the
            // `played` sequence; when the dummy is on play we ask as the
            // declarer (the seat this decider actually controls), matching the
            // engine's controllerFor().
            const requestSeat = actingSeat === dummySeat ? benSeat : actingSeat;
            result = await clientFactory().play({
              hand: handToPbn(originalHand(state, requestSeat)),
              dummy: dummySeat ? handToPbn(originalHand(state, dummySeat)) : "",
              seat: requestSeat,
              dealer: state.dealer,
              vul,
              ctx,
              played,
            });
          }
        } catch (e) {
          console.error(`[ben-seat] play failed for ${actingSeat}:`, e);
          return degrade(`BEN could not be reached (${(e as Error).message})`);
        }

        const card = parseBenCard(result.card);
        if (!card) return degrade(`BEN returned an unreadable card "${result.card}"`);
        if (!legalSet.has(`${card.suit}${card.rank}`))
          return degrade(`BEN chose ${result.card}, which is not legal here`);

        const top = result.candidates.find((c) => c.card === result.card);
        return {
          action: card,
          candidates: legal.length ? [...legal] : [card],
          trace: [],
          citedSettings: [],
          facts: bidFacts,
          reason:
            top?.explanation ??
            `BEN neural engine${result.who ? ` (${result.who})` : ""}${typeof top?.insta_score === "number" ? ` — score ${top.insta_score.toFixed(2)}` : ""}`,
          rejected: result.candidates
            .filter((c) => c.card && c.card !== result.card)
            .slice(0, 4)
            .map((c) => ({
              action: c.card!,
              why:
                c.explanation ??
                (typeof c.insta_score === "number"
                  ? `BEN score ${c.insta_score.toFixed(2)}`
                  : "BEN candidate"),
            })),
          fallback: false,
        };
      },
    } satisfies SeatDecider;
  };
}
