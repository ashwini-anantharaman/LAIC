import type { Card, Rank, Suit } from "@bridge/events";
import {
  nextSeat,
  type AuctionCall,
  type Call,
  type Seat,
  type Vul,
} from "@bridge/events";
import { auctionComplete, finalContract, trickWinner } from "@bridge/engine";
import type { GameContext, ParseResult, PlayedCard } from "./context";

// Portable Bridge Notation parser (essential tags, including [Play] — so a
// PBN written by formats/write.ts round-trips deal + auction + play exactly).

const RANK_BY_CHAR: Record<string, Rank> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};
const DEAL_SUIT_ORDER: Suit[] = ["S", "H", "D", "C"]; // PBN lists S.H.D.C
const SEAT_CHARS: Record<string, Seat> = { N: "N", E: "E", S: "S", W: "W" };

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[])
    for (const rank of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as Rank[])
      deck.push({ suit, rank });
  return deck;
}

function parseVul(v: string): Vul {
  const s = v.trim().toLowerCase();
  if (s === "ns" || s === "n-s") return "ns";
  if (s === "ew" || s === "e-w") return "ew";
  if (s === "all" || s === "both") return "both";
  return "none"; // None / Love / - / anything else
}

/** Parse `[Deal "N:S.H.D.C S.H.D.C ..."]` into four hands. */
function parseDeal(spec: string): { hands: Record<Seat, Card[]> } | null {
  const m = spec.match(/^\s*([NESW])\s*:\s*(.+)$/);
  if (!m) return null;
  let seat = SEAT_CHARS[m[1]];
  const segs = m[2].trim().split(/\s+/);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  for (const seg of segs) {
    if (seg && seg !== "-") {
      const suits = seg.split(".");
      const cards: Card[] = [];
      DEAL_SUIT_ORDER.forEach((suit, i) => {
        for (const ch of suits[i] ?? "") {
          const rank = RANK_BY_CHAR[ch.toUpperCase()];
          if (rank) cards.push({ suit, rank });
        }
      });
      hands[seat] = cards;
    }
    seat = nextSeat(seat); // clockwise N→E→S→W
  }
  // Fill unspecified/short hands from the remaining deck (like LIN).
  const used = new Set<string>();
  for (const s of ["N", "E", "S", "W"] as Seat[]) for (const c of hands[s]) used.add(`${c.suit}${c.rank}`);
  const remaining = fullDeck().filter((c) => !used.has(`${c.suit}${c.rank}`));
  for (const s of ["N", "E", "S", "W"] as Seat[])
    while (hands[s].length < 13 && remaining.length) hands[s].push(remaining.shift()!);
  return { hands };
}

/** Map a PBN call token to the internal Call, or null to skip (note ref / annotation-only). */
function normPbnCall(tok: string): Call | null {
  let s = tok.trim();
  if (!s || /^=\d+=$/.test(s)) return null; // note reference
  s = s.replace(/[!?]+$/, ""); // strip annotations
  if (!s) return null;
  const up = s.toUpperCase();
  if (up === "PASS" || up === "P") return "P";
  if (up === "X" || up === "DBL") return "X";
  if (up === "XX" || up === "RDBL") return "XX";
  if (up === "AP") return "AP"; // handled by caller
  const level = up[0];
  if (!/[1-7]/.test(level)) return null;
  const rest = up.slice(1);
  const strain = rest === "NT" || rest === "N" ? "N" : rest[0];
  if (!"CDHSN".includes(strain)) return null;
  return `${level}${strain}`;
}

function parseChunk(chunk: string): GameContext | null {
  const lines = chunk.split(/\r?\n/);
  const tags: Record<string, string> = {};
  const auctionTokens: string[] = [];
  const playLines: string[] = [];
  let mode: "normal" | "auction" | "play" = "normal";
  let auctionFirst: Seat | null = null;

  for (const line of lines) {
    const tagMatch = line.match(/^\s*\[(\w+)\s+"([^"]*)"\]/);
    if (tagMatch) {
      const [, tag, value] = tagMatch;
      tags[tag] = value;
      if (tag === "Auction") {
        auctionFirst = SEAT_CHARS[value.trim()[0]] ?? null;
        mode = "auction";
      } else if (tag === "Play") {
        mode = "play";
      } else {
        mode = "normal";
      }
      continue;
    }
    const body = line.trim();
    if (!body) continue;
    if (mode === "auction") auctionTokens.push(...body.split(/\s+/));
    else if (mode === "play" && body !== "*") playLines.push(body);
  }

  if (!tags.Deal) return null;
  const deal = parseDeal(tags.Deal);
  if (!deal) return null;

  const dealer: Seat = SEAT_CHARS[(tags.Dealer ?? "N").trim()[0]] ?? "N";
  const vul = parseVul(tags.Vulnerable ?? "None");

  // Build the auction, rotating clockwise from the auction's first seat.
  const auction: AuctionCall[] = [];
  let seat = auctionFirst ?? dealer;
  for (const tok of auctionTokens) {
    const call = normPbnCall(tok);
    if (!call) continue;
    if (call === "AP") {
      let guard = 0;
      while (!auctionComplete(auction) && guard++ < 4) {
        auction.push({ seat, call: "P" });
        seat = nextSeat(seat);
      }
      continue;
    }
    auction.push({ seat, call });
    seat = nextSeat(seat);
  }

  const contract = auction.length ? finalContract(auction) : null;

  // [Play] section: columns are anchored to the Play seat for every trick;
  // actual play order rotates from each trick's leader (winner of the last).
  let play: PlayedCard[] | undefined;
  if (playLines.length && contract) {
    const anchor: Seat = SEAT_CHARS[(tags.Play ?? "").trim()[0]] ?? nextSeat(contract.declarer);
    const cols: Seat[] = [anchor, nextSeat(anchor), nextSeat(nextSeat(anchor)), nextSeat(nextSeat(nextSeat(anchor)))];
    const parseCard = (tok: string): Card | null => {
      const m = tok.toUpperCase().match(/^([SHDC])(10|[AKQJT2-9])$/);
      if (!m) return null;
      const rank = m[2] === "10" ? 10 : RANK_BY_CHAR[m[2]];
      return rank ? { suit: m[1] as Suit, rank } : null;
    };
    play = [];
    let leader: Seat = nextSeat(contract.declarer);
    for (let t = 0; t < playLines.length; t++) {
      const toks = playLines[t].split(/\s+/);
      const bySeat: Partial<Record<Seat, Card>> = {};
      cols.forEach((s, i) => {
        const card = toks[i] && toks[i] !== "-" ? parseCard(toks[i]) : null;
        if (card) bySeat[s] = card;
      });
      const trick: { seat: Seat; card: Card }[] = [];
      let s = leader;
      for (let i = 0; i < 4; i++, s = nextSeat(s)) {
        const card = bySeat[s];
        if (!card) break;
        trick.push({ seat: s, card });
      }
      for (const p of trick) play.push({ seat: p.seat, card: p.card, trickIndex: t });
      if (trick.length < 4) break; // incomplete trick ends the record
      leader = trickWinner({ leader, plays: trick }, contract.strain as Suit | "N");
    }
    if (!play.length) play = undefined;
  }

  return {
    name: tags.Board ? `Board ${tags.Board}` : tags.Event || "PBN board",
    dealer,
    vul,
    players: {
      N: tags.North ?? "",
      E: tags.East ?? "",
      S: tags.South ?? "",
      W: tags.West ?? "",
    },
    hands: deal.hands,
    auction,
    play,
    contract,
    source: "pbn",
  };
}

export function parsePbn(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste a PBN string first." };
  if (!/\[Deal\s+"/.test(trimmed))
    return { ok: false, error: 'No [Deal "..."] tag found — this doesn’t look like PBN.' };
  const chunks = trimmed.split(/\n\s*\n/);
  const contexts: GameContext[] = [];
  for (const chunk of chunks) {
    if (!/\[Deal\s+"/.test(chunk)) continue;
    const ctx = parseChunk(chunk);
    if (ctx) contexts.push(ctx);
  }
  if (!contexts.length) return { ok: false, error: "Couldn’t read any complete deals from that PBN." };
  return { ok: true, contexts };
}
