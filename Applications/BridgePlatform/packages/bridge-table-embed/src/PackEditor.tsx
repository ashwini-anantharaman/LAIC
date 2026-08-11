"use client";

// The pack editor — the card-by-card deal editor from the platform's board
// library (apps/bridge-web/components/library/DealEditor.tsx), reduced to the
// job a challenge board actually has and dressed in inline styles.
//
// SAME INTERACTION, SMALLER SURFACE. Pick a seat, then click cards to give them
// to it; clicking that seat's own card returns it to the pool; another seat's
// card moves across. Assignment is completely free and the 13-per-hand check
// gates Apply — that is the platform editor's contract, kept exactly, because a
// creator who has used one should not have to learn the other.
//
// WHAT IS GONE: the board's name, its notes, its dealer and vulnerability
// selects, and the mid-play "locked cards" mode. A challenge board carries its
// own dealer/vul chips on the board card, and no board here is ever half
// played. The LIN/PBN prefill box is gone too — the board card's BBO hand-link
// import is the same door, one level up, and it renumbers boards as it goes.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { rankLabel, type Card, type Rank, type Seat, type Suit } from "@bridge/events";
import { SUIT_ORDER } from "./dealText";
import { ACCENT, BAD, INK, INK_FAINT, INK_MUTED, LINE, PAPER, SURFACE } from "./challengeUi";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED = "#b03a2e";
const isRed = (s: Suit) => s === "H" || s === "D";

const SEAT_TINT: Record<Seat, string> = {
  N: "#2a7ab0",
  E: "#6f4bb0",
  S: "#1c8a5a",
  W: "#b08328",
};

type Owner = Seat | "";
const cid = (suit: Suit, rank: Rank) => `${suit}${rank}`;

export interface PackEditorProps {
  /** Prefill: the four hands as they stand. */
  hands: Record<Seat, Card[]>;
  /** The pack, once all four hands hold thirteen. */
  onApply: (hands: Record<Seat, Card[]>) => void;
  onCancel: () => void;
  applyLabel?: string;
}

export function PackEditor({
  hands,
  onApply,
  onCancel,
  applyLabel = "Use this pack",
}: Readonly<PackEditorProps>) {
  const [owner, setOwner] = useState<Record<string, Owner>>(() => {
    const m: Record<string, Owner> = {};
    for (const seat of SEATS)
      for (const card of hands[seat] ?? []) m[cid(card.suit, card.rank)] = seat;
    return m;
  });
  const [active, setActive] = useState<Seat>("N");

  const counts = useMemo(() => {
    const c: Record<Seat, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const o of Object.values(owner)) if (o) c[o]++;
    return c;
  }, [owner]);
  const poolCount = 52 - counts.N - counts.E - counts.S - counts.W;
  const complete = SEATS.every((s) => counts[s] === 13);

  /** Give to the active seat; click its own card to send it back to the pool. */
  const toggle = (suit: Suit, rank: Rank) => {
    const id = cid(suit, rank);
    setOwner((o) => ({ ...o, [id]: o[id] === active ? "" : active }));
  };

  /** Give every pool card to the active seat — finishes the last hand fast. */
  const takeRest = () =>
    setOwner((o) => {
      const next = { ...o };
      for (const suit of SUIT_ORDER)
        for (const rank of RANKS_DESC) {
          const id = cid(suit, rank);
          if (!next[id]) next[id] = active;
        }
      return next;
    });

  const apply = () => {
    const out = { N: [], E: [], S: [], W: [] } as Record<Seat, Card[]>;
    for (const suit of SUIT_ORDER)
      for (const rank of RANKS_DESC) {
        const seat = owner[cid(suit, rank)];
        if (seat) out[seat].push({ suit, rank });
      }
    onApply(out);
  };

  return (
    <div
      role="group"
      aria-label={
        complete
          ? "Pack editor — all four hands hold 13 cards"
          : "Pack editor — hands are not yet 13 cards each"
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `2px solid ${complete ? "#79c2a4" : "#e8b1a8"}`,
        background: SURFACE,
      }}
    >
      {/* Seat tiles: which hand the next click fills, and how full each is. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
        {SEATS.map((seat) => {
          const on = active === seat;
          const texts = SUIT_ORDER.map((suit) => ({
            suit,
            text: RANKS_DESC.filter((r) => owner[cid(suit, r)] === seat)
              .map((r) => rankLabel(r))
              .join(" "),
          }));
          return (
            <button
              key={seat}
              type="button"
              onClick={() => setActive(seat)}
              title={`Click cards below to give them to ${SEAT_NAME[seat]}`}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${on ? SEAT_TINT[seat] : LINE}`,
                background: on ? `${SEAT_TINT[seat]}14` : SURFACE,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: on ? SEAT_TINT[seat] : INK_MUTED,
                }}
              >
                <span>{SEAT_NAME[seat]}</span>
                <span style={{ color: counts[seat] === 13 ? "#1c8a5a" : BAD }}>
                  {counts[seat]}/13
                </span>
              </div>
              {texts.map(({ suit, text }) => (
                <div
                  key={suit}
                  style={{
                    display: "flex",
                    gap: 4,
                    fontSize: 10,
                    lineHeight: 1.45,
                    fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                  }}
                >
                  <span style={{ color: isRed(suit) ? RED : INK }}>{GLYPH[suit]}</span>
                  <span
                    style={{
                      color: INK_MUTED,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {text || "—"}
                  </span>
                </div>
              ))}
            </button>
          );
        })}
      </div>

      {/* The 52-card grid, one row per suit. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {SUIT_ORDER.map((suit) => (
          <div key={suit} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: 14,
                flex: "none",
                fontSize: 12,
                textAlign: "center",
                color: isRed(suit) ? RED : INK,
              }}
            >
              {GLYPH[suit]}
            </span>
            <div style={{ display: "flex", gap: 2, flex: 1, minWidth: 0 }}>
              {RANKS_DESC.map((rank) => {
                const held = owner[cid(suit, rank)] || "";
                const cell: CSSProperties = {
                  flex: 1,
                  minWidth: 0,
                  height: 24,
                  padding: 0,
                  borderRadius: 4,
                  border: `1px solid ${held ? SEAT_TINT[held] : LINE}`,
                  background: held ? `${SEAT_TINT[held]}1f` : PAPER,
                  color: held ? SEAT_TINT[held] : INK_FAINT,
                  fontFamily: "inherit",
                  fontSize: 10.5,
                  fontWeight: held ? 800 : 600,
                  cursor: "pointer",
                };
                return (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => toggle(suit, rank)}
                    aria-label={`${rankLabel(rank)} of ${suit}${held ? ` — ${SEAT_NAME[held]}` : ""}`}
                    title={held ? SEAT_NAME[held] : "In the pool"}
                    style={cell}
                  >
                    {rankLabel(rank)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: INK_FAINT }}>
          {poolCount} in the pool · filling {SEAT_NAME[active]}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={takeRest}
          disabled={poolCount === 0}
          style={{
            height: 30,
            padding: "0 10px",
            borderRadius: 7,
            border: `1px solid ${LINE}`,
            background: SURFACE,
            color: poolCount === 0 ? INK_FAINT : INK_MUTED,
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 700,
            cursor: poolCount === 0 ? "default" : "pointer",
          }}
        >
          Give the rest to {active}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 30,
            padding: "0 10px",
            borderRadius: 7,
            border: `1px solid ${LINE}`,
            background: SURFACE,
            color: INK_MUTED,
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!complete}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            border: 0,
            background: complete ? ACCENT : "#d7ded9",
            color: complete ? "#fff" : "#8b9a93",
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 800,
            cursor: complete ? "pointer" : "default",
          }}
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
