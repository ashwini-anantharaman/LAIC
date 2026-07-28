"use client";

// The felt bid box (mobile): pick a LEVEL (arms it), then the five strains
// light up for the legal calls at that level; Pass/Dbl/Rdbl stay one tap.
// Legality is the engine's real `legalCalls` set, passed from the server —
// same source the desktop BiddingBox uses. Each concrete call submits the
// same `bidAction`; the only client state is the armed level. Posts mobile=1
// so any redirect the action grows later returns to the /m chrome (bidAction
// only revalidates today, so the mobile field is inert but future-proof).

import { useState } from "react";
import type { Suit } from "@bridge/events";
import { bidAction } from "@/app/bridge/table/actions";

const STRAINS = ["C", "D", "H", "S", "N"] as const;
const GLYPH: Record<Suit | "N", string> = { C: "♣", D: "♦", H: "♥", S: "♠", N: "NT" };
const isRed = (s: string) => s === "H" || s === "D";

const PANEL: React.CSSProperties = {
  background: "rgba(250,248,242,.97)",
  borderRadius: "14px 14px 0 0",
  padding: "10px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)",
};
const LABEL: React.CSSProperties = {
  font: "600 10px var(--font-karla), sans-serif",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "#a49d8e",
  textAlign: "center",
  marginBottom: 7,
};

function baseBtn(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: "1px solid #d3ccbb",
    background: "#fff",
    borderRadius: 8,
    padding: "9px 0",
    font: "600 13px var(--font-karla), sans-serif",
    color: "#1d1a15",
    cursor: "pointer",
    width: "100%",
    ...extra,
  };
}

export function MobileBidBox({
  sessionId,
  legal,
}: Readonly<{ sessionId: string; legal: string[] }>) {
  const legalSet = new Set(legal);
  const [level, setLevel] = useState<number | null>(null);

  const hidden = (call: string) => (
    <>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="call" value={call} />
      <input type="hidden" name="mobile" value="1" />
    </>
  );

  const special = ([
    ["P", "Pass"],
    ["X", "Dbl"],
    ["XX", "Rdbl"],
  ] as const).map(([value, label]) => {
    const ok = legalSet.has(value);
    return (
      <form
        key={value}
        action={bidAction}
        onSubmit={() => setLevel(null)}
        style={{ gridColumn: value === "P" ? "span 2" : undefined }}
      >
        {hidden(value)}
        <button
          type="submit"
          disabled={!ok}
          aria-label={label}
          style={baseBtn(ok ? undefined : { opacity: 0.28, cursor: "default" })}
        >
          {label}
        </button>
      </form>
    );
  });

  return (
    <div style={PANEL}>
      <div style={LABEL}>Your call</div>

      {/* Step 1 — the level. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((l) => {
          const any = STRAINS.some((s) => legalSet.has(`${l}${s}`));
          const armed = level === l;
          return (
            <button
              key={l}
              type="button"
              disabled={!any}
              aria-pressed={armed}
              aria-label={`Level ${l}`}
              onClick={() => setLevel(armed ? null : l)}
              style={
                armed
                  ? {
                      border: "1px solid #205e63",
                      background: "#205e63",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "9px 0",
                      font: "600 13px var(--font-karla), sans-serif",
                      cursor: "pointer",
                    }
                  : baseBtn(any ? undefined : { opacity: 0.28, cursor: "default" })
              }
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* Step 2 — the strain, once a level is armed. */}
      <div
        aria-live="polite"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,1fr)",
          gap: 4,
          marginTop: 4,
        }}
      >
        {STRAINS.map((s) => {
          const label = s === "N" ? "NT" : GLYPH[s];
          if (level === null) {
            return (
              <div
                key={s}
                style={{
                  border: "1px dashed #e0d9c8",
                  borderRadius: 8,
                  padding: "9px 0",
                  textAlign: "center",
                  font: "600 13px var(--font-karla), sans-serif",
                  color: isRed(s) ? "#c99" : "#c3bba8",
                }}
              >
                {label}
              </div>
            );
          }
          const value = `${level}${s}`;
          const ok = legalSet.has(value);
          return (
            <form key={s} action={bidAction} onSubmit={() => setLevel(null)}>
              {hidden(value)}
              <button
                type="submit"
                disabled={!ok}
                aria-label={`Bid ${level}${label}`}
                style={baseBtn(
                  ok
                    ? { color: isRed(s) ? "#8a2d23" : "#1d1a15" }
                    : { opacity: 0.28, cursor: "default" },
                )}
              >
                {level}
                {label}
              </button>
            </form>
          );
        })}
      </div>

      {/* Always one tap: pass / double / redouble. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 4,
          marginTop: 4,
        }}
      >
        {special}
      </div>
    </div>
  );
}
