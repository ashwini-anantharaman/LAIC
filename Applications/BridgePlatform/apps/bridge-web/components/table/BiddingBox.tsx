// The bidding box (2026-07-16 table rework): the full call grid, only legal
// calls live. Server-action forms — no client state.

import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const red = (s: string) => s === "H" || s === "D";

export function BiddingBox({
  sessionId,
  legal,
}: Readonly<{ sessionId: string; legal: Set<string> }>) {
  const call = (value: string, label: React.ReactNode, wide = false) => {
    const ok = legal.has(value);
    return (
      <form key={value} action={bidAction} className={wide ? "col-span-2" : ""}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="call" value={value} />
        <button
          type="submit"
          disabled={!ok}
          className="w-full rounded border border-neutral-300 bg-white px-1 py-1.5 text-sm font-medium enabled:hover:border-emerald-500 enabled:hover:bg-emerald-50 disabled:opacity-25"
        >
          {label}
        </button>
      </form>
    );
  };

  return (
    <div className="w-full max-w-xs">
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].flatMap((level) =>
          STRAINS.map((strain) =>
            call(
              `${level}${strain}`,
              <span className={red(strain) ? "text-[var(--madder)]" : ""}>
                {level}
                {GLYPH[strain]}
              </span>,
            ),
          ),
        )}
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {call("P", "Pass", true)}
        {call("X", "Dbl")}
        {call("XX", "Rdbl")}
      </div>
    </div>
  );
}
