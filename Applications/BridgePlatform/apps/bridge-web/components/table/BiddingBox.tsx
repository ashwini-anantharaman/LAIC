"use client";

// The bidding box, BBO-style (2026-07-21): pick a LEVEL first, then the five
// strains appear for that level — two taps per bid instead of scanning a
// 35-cell grid. Pass/Dbl/Rdbl stay one tap. Calls still submit through the
// server action; the only client state is which level is armed.

import { useState } from "react";
import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const red = (s: string) => s === "H" || s === "D";

export function BiddingBox({
  sessionId,
  legal,
}: Readonly<{ sessionId: string; legal: string[] }>) {
  const legalSet = new Set(legal);
  const [level, setLevel] = useState<number | null>(null);

  const specialCall = (value: string, label: string) => {
    const ok = legalSet.has(value);
    return (
      <form key={value} action={bidAction} onSubmit={() => setLevel(null)}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="call" value={value} />
        <button
          type="submit"
          disabled={!ok}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium enabled:hover:border-emerald-500 enabled:hover:bg-emerald-50 disabled:opacity-25"
        >
          {label}
        </button>
      </form>
    );
  };

  return (
    <div className="w-full max-w-sm space-y-1.5">
      {/* Step 1 — the level. Disabled when no call at that level is legal. */}
      <div className="grid grid-cols-7 gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((l) => {
          const any = STRAINS.some((s) => legalSet.has(`${l}${s}`));
          const armed = level === l;
          return (
            <button
              key={l}
              type="button"
              disabled={!any}
              onClick={() => setLevel(armed ? null : l)}
              aria-pressed={armed}
              className={`rounded-md border py-2 text-sm font-semibold transition-colors disabled:opacity-25 ${
                armed
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-neutral-300 bg-white enabled:hover:border-emerald-500 enabled:hover:bg-emerald-50"
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* Step 2 — the strain, once a level is armed. */}
      <div className="grid grid-cols-5 gap-1" aria-live="polite">
        {level === null
          ? STRAINS.map((s) => (
              <div
                key={s}
                className="rounded-md border border-dashed border-neutral-200 py-2 text-center text-sm text-neutral-300"
              >
                <span className={red(s) ? "opacity-60" : ""}>{GLYPH[s]}</span>
              </div>
            ))
          : STRAINS.map((s) => {
              const value = `${level}${s}`;
              const ok = legalSet.has(value);
              return (
                <form key={s} action={bidAction} onSubmit={() => setLevel(null)}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="call" value={value} />
                  <button
                    type="submit"
                    disabled={!ok}
                    className="w-full rounded-md border border-neutral-300 bg-white py-2 text-sm font-semibold enabled:hover:border-emerald-500 enabled:hover:bg-emerald-50 disabled:opacity-25"
                  >
                    <span className={red(s) ? "text-[var(--madder)]" : ""}>
                      {level}
                      {GLYPH[s]}
                    </span>
                  </button>
                </form>
              );
            })}
      </div>

      {/* Always one tap: pass, double, redouble. */}
      <div className="grid grid-cols-4 gap-1 pt-0.5">
        <div className="col-span-2">{specialCall("P", "P")}</div>
        {specialCall("X", "X")}
        {specialCall("XX", "XX")}
      </div>
    </div>
  );
}
