// Three tables on one page — the proof that <PlayTable/> is a component and not
// a page in disguise.
//
// Each one gets its own container, its own board and its own callbacks. Nothing
// is shared: the prototype's `position:fixed` stage and `window.resize` listener
// were both replaced by a per-instance ResizeObserver, so each table scales to
// the box it is given rather than to the viewport.

import type { Card, Seat } from "@bridge/events";
import { DemoTables } from "./DemoTables";

/** A deterministic deal, so the page renders the same thing every time. */
function deal(seed: number): Record<Seat, Card[]> {
  const suits: Card["suit"][] = ["S", "H", "D", "C"];
  const deck: Card[] = [];
  for (const suit of suits) for (let rank = 2; rank <= 14; rank++) deck.push({ suit, rank: rank as Card["rank"] });
  let a = seed >>> 0;
  const rng = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  const seats: Seat[] = ["N", "E", "S", "W"];
  deck.forEach((c, i) => hands[seats[i % 4]!]!.push(c));
  return hands;
}

export default function PlayTableDemoPage() {
  const boards = [1, 2, 3].map((n) => ({ n, hands: deal(n * 7919 + 13) }));
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="font-serif text-2xl">Three tables, one page</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Each table below is a separate <code className="rounded bg-neutral-100 px-1">&lt;PlayTable/&gt;</code>{" "}
        with its own board, its own bid box and its own sizing. Resize the window: they scale
        independently, because each measures its own container rather than the viewport.
      </p>
      <DemoTables boards={boards} />
    </div>
  );
}
