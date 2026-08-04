"use client";

// The client half of the demo: three independent <PlayTable/> instances, each
// with its own local auction so you can click Pass on one and watch the other
// two stay exactly where they were.

import { useState } from "react";
import type { AuctionCall, Card, Seat } from "@bridge/events";
import { PlayTable } from "@bridge/table-ui";

const NEXT: Record<Seat, Seat> = { N: "E", E: "S", S: "W", W: "N" };
const STRAINS = ["C", "D", "H", "S", "N"];

/** Everything legal over the current auction — enough to drive the bid box. */
function legalOver(auction: AuctionCall[]): string[] {
  const out = ["P"];
  const lastBid = [...auction].reverse().find((a) => /^[1-7][CDHSN]$/.test(a.call));
  const rank = (x: string) => Number(x[0]) * 5 + STRAINS.indexOf(x[1]!);
  for (let l = 1; l <= 7; l++) {
    for (const st of STRAINS) {
      const c = `${l}${st}`;
      if (!lastBid || rank(c) > rank(lastBid.call)) out.push(c);
    }
  }
  return out;
}

function OneTable({ board, hands }: Readonly<{ board: number; hands: Record<Seat, Card[]> }>) {
  const dealer: Seat = (["N", "E", "S", "W"] as Seat[])[(board - 1) % 4]!;
  const [auction, setAuction] = useState<AuctionCall[]>([]);
  const turn = auction.reduce<Seat>((s) => NEXT[s], dealer);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300" style={{ height: 380 }}>
      <PlayTable
        state={{
          hands,
          auction,
          tricks: [{ plays: [] }],
          phase: "auction",
          turn,
          contract: null,
          trickCount: { NS: 0, EW: 0 },
          dealer,
          vul: ["none", "ns", "ew", "both"][(board - 1) % 4]!,
        }}
        seats={{
          N: { name: "North" },
          E: { name: "East" },
          S: { name: "you" },
          W: { name: "West" },
        }}
        visible={{ N: false, E: false, S: true, W: false }}
        mySeat="S"
        myTurn={turn === "S"}
        legalCalls={turn === "S" ? legalOver(auction) : []}
        boardLabel={board}
        onCall={(call) => setAuction((a) => [...a, { seat: "S", call } as AuctionCall])}
      />
    </div>
  );
}

export function DemoTables({
  boards,
}: Readonly<{ boards: { n: number; hands: Record<Seat, Card[]> }[] }>) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {boards.map((b) => (
        <OneTable key={b.n} board={b.n} hands={b.hands} />
      ))}
    </div>
  );
}
