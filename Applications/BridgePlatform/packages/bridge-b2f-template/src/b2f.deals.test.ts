// The deal review (notes pp.18-24) is fifteen four-hand layouts transcribed from
// diagrams. Reading hand diagrams off a page is the least reliable step in
// authoring a knowledge base like this, and the errors are SILENT — a dropped
// card or an invented one produces a deal that reads perfectly well.
//
// So the deals are checked rather than trusted, and the check lives here rather
// than in a throwaway script, because a later edit to deals.json must not be
// able to reintroduce a bad layout. Three independent tests:
//
//   1. structural — 52 distinct cards, 13 per seat, 13 per suit, legal ranks;
//   2. EXTERNAL CHECKSUM — the HCP derived from the transcribed cards equals the
//      HCP printed beside that seat on the page. This is the strong one: the
//      page's own numbers are evidence I did not generate;
//   3. the printed HCP sums to 40.
//
// Test 2 caught two real errors in deal 5 on the first pass — a diamond dropped
// from West and a ♦9 invented in East.

import { describe, expect, it } from "vitest";
import DEALS from "./deals.json";

type Seat = "N" | "E" | "S" | "W";
const SEATS: Seat[] = ["N", "E", "S", "W"];
const SUITS = ["S", "H", "D", "C"] as const;
const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

interface Deal {
  num: number;
  page: number;
  dealer: string;
  vul: string;
  N: string[];
  E: string[];
  S: string[];
  W: string[];
  hcp: Record<Seat, number>;
  par: string;
  makeable: string;
  lesson: string;
  also: string;
}

const deals = DEALS.deals as unknown as Deal[];

/** Every card of one seat's holding as "S:A" style tokens. */
const cardsOf = (holding: string[]): string[] =>
  holding.flatMap((suit, i) => [...suit].map((rank) => `${SUITS[i]}:${rank}`));

describe("deal review — structure", () => {
  it("has all fifteen deals from pages 18-24", () => {
    expect(deals.length).toBe(15);
    expect(deals.map((d) => d.num)).toEqual([2, 3, 4, 5, 6, 13, 14, 15, 17, 19, 20, 21, 28, 29, 30]);
    for (const d of deals) expect(d.page).toBeGreaterThanOrEqual(18);
    for (const d of deals) expect(d.page).toBeLessThanOrEqual(24);
  });

  it.each(deals.map((d) => [d.num, d] as const))(
    "deal %i is a legal 52-card layout",
    (_num, deal) => {
      const all: string[] = [];
      for (const seat of SEATS) {
        expect(deal[seat], `${seat} must have four suit holdings`).toHaveLength(4);
        const cards = cardsOf(deal[seat]);
        expect(cards.length, `${seat} holds ${deal[seat].join("/")}`).toBe(13);
        all.push(...cards);
      }
      expect(all.length).toBe(52);
      expect(new Set(all).size, "a card appears in two hands").toBe(52);
      for (const suit of SUITS) {
        expect(all.filter((c) => c.startsWith(`${suit}:`)).length, `${suit} count`).toBe(13);
      }
      const illegal = all.filter((c) => !"AKQJT98765432".includes(c.split(":")[1]!));
      expect(illegal, "illegal ranks").toEqual([]);
    },
  );
});

describe("deal review — the page's own HCP as an external checksum", () => {
  it.each(deals.map((d) => [d.num, d] as const))(
    "deal %i: transcribed cards give the HCP printed on the page",
    (_num, deal) => {
      for (const seat of SEATS) {
        const hcp = cardsOf(deal[seat]).reduce(
          (n, c) => n + (HCP[c.split(":")[1]!] ?? 0),
          0,
        );
        expect(hcp, `${seat} (${deal[seat].join("/")}) — page prints ${deal.hcp[seat]}`).toBe(
          deal.hcp[seat],
        );
      }
    },
  );

  it.each(deals.map((d) => [d.num, d] as const))("deal %i: printed HCP sums to 40", (_num, deal) => {
    expect(SEATS.reduce((n, s) => n + deal.hcp[s], 0)).toBe(40);
  });
});

describe("deal review — the teaching content survived", () => {
  it.each(deals.map((d) => [d.num, d] as const))(
    "deal %i carries a bidding lesson, a play lesson and a par result",
    (_num, deal) => {
      expect(deal.lesson.trim().length).toBeGreaterThan(40);
      expect(deal.also.trim().length).toBeGreaterThan(40);
      expect(deal.par).toMatch(/Par/);
      expect(deal.makeable.length).toBeGreaterThan(0);
      expect(["N", "E", "S", "W"]).toContain(deal.dealer);
      expect(["none", "ns", "ew", "both"]).toContain(deal.vul);
    },
  );
});
