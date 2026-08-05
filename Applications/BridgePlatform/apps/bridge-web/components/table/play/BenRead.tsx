"use client";

// "What does BEN read?" — one line at the foot of the bid-meaning card.
//
// ON DEMAND, and that is the design rather than laziness: BEN answers in 8–22
// seconds (measured against the deployed service). An unrequested spinner that
// long is worse than a button, and it would mean calling BEN on every render of
// every board whether anyone was curious or not.
//
// It sits under the knowledge base's meanings but must not blend into them:
// those are what the SYSTEM says a call promises, this is what a neural engine
// GUESSES the other hands hold. Two authorities, and a learner should never be
// unsure which one is talking — hence its own badge and its own hedged wording.

import { useState } from "react";

interface SeatRead {
  seat: string;
  relation: "partner" | "lho" | "rho";
  hcp: number;
  shape: [number, number, number, number];
}

const RELATION_LABEL: Record<SeatRead["relation"], string> = {
  partner: "partner",
  lho: "left opp",
  rho: "right opp",
};


const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RED = new Set(["♥", "♦"]);

/**
 * The suits worth mentioning — and NOTHING when there is nothing to say.
 *
 * A random hand averages 3.25 cards per suit, so a seat BEN knows nothing about
 * comes back near 3.25 across the board and one suit edges highest by noise. An
 * earlier version always printed that peak, which put "3.7♦" — pure noise — in
 * the same typeface and with the same authority as partner's "5.3♠", which is
 * BEN reflecting a 1♠ opening back at you. Presenting a shrug as a reading is
 * the same sin as rounding an estimate into a count.
 *
 * So: name a suit only once it is meaningfully longer than chance, and say so
 * plainly otherwise. Twelve averages across three hands would be noise anyway;
 * what a learner acts on is "partner is long in spades".
 */
const NOTABLE_LENGTH = 4.5;
function shapeText(shape: readonly number[]): string | null {
  const notable = shape
    .map((len, i) => ({ len, suit: SUITS[i]! }))
    .filter((s) => s.len >= NOTABLE_LENGTH)
    .sort((a, b) => b.len - a.len);
  if (!notable.length) return null;
  return notable.map((s) => `${s.len.toFixed(1)}${s.suit}`).join(" ");
}

export function BenRead({ sessionId }: Readonly<{ sessionId: string }>) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; read: SeatRead[] }
    | { kind: "empty"; reason: string }
  >({ kind: "idle" });

  async function ask() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/bridge/ben-read?sessionId=${encodeURIComponent(sessionId)}`);
      const body = (await res.json()) as { read?: SeatRead[] | null; reason?: string };
      setState(
        body.read?.length
          ? { kind: "done", read: body.read }
          : { kind: "empty", reason: body.reason ?? "no answer" },
      );
    } catch {
      setState({ kind: "empty", reason: "unreachable" });
    }
  }

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopStyle: "solid",
        borderTopColor: "#8a8a6a",
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "0 4px",
          marginRight: 6,
          borderRadius: 3,
          background: "#384bb3",
          color: "#fff",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          verticalAlign: "middle",
        }}
      >
        BEN
      </span>

      {state.kind === "idle" && (
        <button
          type="button"
          onClick={ask}
          style={{
            background: "transparent",
            borderWidth: 0,
            padding: 0,
            color: "#2f4bb0",
            fontFamily: "inherit",
            fontSize: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          What does BEN read the other hands as?
        </button>
      )}

      {/* Say how long, because eight seconds of silence reads as broken. */}
      {state.kind === "loading" && (
        <span style={{ color: "#57573f", fontStyle: "italic" }}>
          Asking BEN — this takes several seconds…
        </span>
      )}

      {state.kind === "empty" && (
        <span style={{ color: "#57573f", fontStyle: "italic" }}>
          {state.reason === "unconfigured"
            ? "BEN isn't connected to this table."
            : state.reason === "not bidding"
              ? "BEN only reads hands during the auction."
              : "BEN had no read for this position."}
        </span>
      )}

      {/* One seat per row rather than a run-on sentence. Three estimates with
          a decimal point each wrap into an unreadable ribbon on a phone; as
          rows they align and scan in one pass. Ordered partner-first, because
          partner is the only one whose number usually carries information. */}
      {state.kind === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
          {[...state.read]
            .sort((a, b) => (a.relation === "partner" ? -1 : b.relation === "partner" ? 1 : 0))
            .map((r) => (
              <div key={r.seat} style={{ display: "flex", gap: 6, color: "#2b2b1e" }}>
                <span style={{ flex: "none", width: 62, color: "#57573f" }}>
                  {RELATION_LABEL[r.relation]}
                </span>
                {/* One decimal, deliberately: these are a neural net's averages
                    over the hands it thinks are plausible, and rounding them to
                    whole points would dress a guess up as a count. */}
                <span style={{ flex: "none", width: 58 }}>{r.hcp.toFixed(1)} HCP</span>
                <span>
                  {shapeText(r.shape)?.split(" ").map((tok, j) => (
                    <span key={j} style={{ color: RED.has(tok.slice(-1)) ? "#c00" : "#000" }}>
                      {j > 0 ? " " : ""}
                      {tok}
                    </span>
                  )) ?? <span style={{ color: "#8a8a6a" }}>no shape read</span>}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
