// BBO-view bidding box (2026-07-23 skin): the iconic full grid — 7 rows
// (levels 1–7) × 5 columns (♣ ♦ ♥ ♠ NT) of every contract bid, plus the wide
// green Pass, red Dbl and blue Rdbl below it. No client state is needed (the
// full grid shows every call at once), so this is a plain server component:
// every button posts the SAME `bidAction` + `sessionId`/`call` fields the
// classic BiddingBox posts. Illegal calls render disabled/greyed.

import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const red = (s: string) => s === "H" || s === "D";

const RED = "#CC0000";

export function BboBidBox({
  sessionId,
  legal,
}: Readonly<{ sessionId: string; legal: string[] }>) {
  const legalSet = new Set(legal);

  const bidButton = (value: string, label: React.ReactNode, ok: boolean) => (
    <form key={value} action={bidAction} className="contents">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="call" value={value} />
      <button
        type="submit"
        disabled={!ok}
        aria-label={`Bid ${value}`}
        className={`w-full rounded-[3px] border py-1.5 text-[13px] font-bold tabular-nums transition-colors ${
          ok
            ? "border-neutral-400 bg-white text-black hover:bg-[#e8f0ff]"
            : "cursor-not-allowed border-neutral-300 bg-neutral-200 text-neutral-400"
        }`}
      >
        {label}
      </button>
    </form>
  );

  return (
    <div
      className="w-full max-w-md space-y-1"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {/* The 7×5 grid: every contract bid from 1♣ to 7NT. */}
      <div className="space-y-1">
        {[1, 2, 3, 4, 5, 6, 7].map((level) => (
          <div key={level} className="grid grid-cols-5 gap-1">
            {STRAINS.map((s) => {
              const value = `${level}${s}`;
              const ok = legalSet.has(value);
              return bidButton(
                value,
                <span style={ok && red(s) ? { color: RED } : undefined}>
                  {level}
                  {GLYPH[s]}
                </span>,
                ok,
              );
            })}
          </div>
        ))}
      </div>

      {/* Pass (green, wide) · Dbl (red) · Rdbl (blue). */}
      <div className="grid grid-cols-4 gap-1 pt-0.5">
        <form action={bidAction} className="col-span-2">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="call" value="P" />
          <button
            type="submit"
            disabled={!legalSet.has("P")}
            aria-label="Pass"
            className={`w-full rounded-[3px] border py-1.5 text-[13px] font-bold ${
              legalSet.has("P")
                ? "border-[#1f6b1f] bg-[#2E8B2E] text-white hover:brightness-110"
                : "cursor-not-allowed border-neutral-300 bg-neutral-200 text-neutral-400"
            }`}
          >
            Pass
          </button>
        </form>
        <form action={bidAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="call" value="X" />
          <button
            type="submit"
            disabled={!legalSet.has("X")}
            aria-label="Double"
            className={`w-full rounded-[3px] border py-1.5 text-[13px] font-bold ${
              legalSet.has("X")
                ? "border-[#990000] bg-[#CC0000] text-white hover:brightness-110"
                : "cursor-not-allowed border-neutral-300 bg-neutral-200 text-neutral-400"
            }`}
          >
            Dbl
          </button>
        </form>
        <form action={bidAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="call" value="XX" />
          <button
            type="submit"
            disabled={!legalSet.has("XX")}
            aria-label="Redouble"
            className={`w-full rounded-[3px] border py-1.5 text-[13px] font-bold ${
              legalSet.has("XX")
                ? "border-[#0a2170] bg-[#1034A6] text-white hover:brightness-110"
                : "cursor-not-allowed border-neutral-300 bg-neutral-200 text-neutral-400"
            }`}
          >
            Rdbl
          </button>
        </form>
      </div>
    </div>
  );
}
