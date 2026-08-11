"use client";

// One board card in the create wizard — the platform's own
// (apps/bridge-web/app/bridge/challenges/new/BoardCard.tsx) in inline styles.
//
// The deal from the seat you will sit, the dealer / seat chips, a re-roll, and
// two doors onto the cards themselves: paste a BBO hand link, or open the pack
// editor. Both fold away — six cards of permanent chrome is a wall.
//
// The "edited" chip is the only thing left of the platform's editor badge. On
// the platform that badge tells a FIELD that the creator had seen the hands;
// solo there is no field, so what is left is a plain fact about this board:
// its cards were chosen, not dealt.

import { useState } from "react";
import type { Card, Seat, Vul } from "@bridge/events";
import { parseBbo } from "@bridge/formats";
import { SeatDiagram } from "@bridge/table-ui";
import { PackEditor } from "./PackEditor";
import {
  ACCENT,
  BAD,
  Chip,
  INK,
  INK_FAINT,
  INK_MUTED,
  LINE,
  PAPER,
  SURFACE,
  inputStyle,
} from "./challengeUi";

const SEAT_CYCLE: readonly Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const VUL_TEXT: Record<Vul, string> = { none: "None", ns: "N-S", ew: "E-W", both: "Both" };

export interface BoardDraftState {
  boardNo: number;
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  /** The pack differs from the seeded deal, so it travels card-by-card. */
  edited: boolean;
}

export const nextSeat = (seat: Seat): Seat =>
  SEAT_CYCLE[(SEAT_CYCLE.indexOf(seat) + 1) % 4] ?? "N";

export function ChallengeBoardCard({
  board,
  onChange,
  onReroll,
}: Readonly<{
  board: BoardDraftState;
  onChange: (patch: Partial<BoardDraftState>) => void;
  onReroll: () => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Take the FIRST board out of a pasted BBO link and make it this board. */
  const applyLink = () => {
    const parsed = parseBbo(link);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const imported = parsed.boards[0];
    if (!imported) {
      setError("That link holds no boards.");
      return;
    }
    setError(null);
    setLink("");
    setLinking(false);
    onChange({
      hands: imported.hands,
      dealer: imported.dealer,
      vul: imported.vul,
      edited: true,
    });
  };

  return (
    <div
      style={{
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${board.edited ? "#e2cf9a" : LINE}`,
        background: SURFACE,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderBottom: `1px solid ${PAPER}`,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Board {board.boardNo}</span>
        {board.edited && (
          <span
            style={{
              padding: "1px 6px",
              borderRadius: 4,
              background: "#fdf6e3",
              color: "#8a6d1f",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: ".05em",
              textTransform: "uppercase",
            }}
          >
            edited
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Chip onClick={onReroll} title="Re-roll this deal">
          ↻ Re-roll
        </Chip>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px 4px" }}>
        <Chip tone={board.vul === "none" ? "plain" : "alarm"}>Vul {VUL_TEXT[board.vul]}</Chip>
        <Chip onClick={() => onChange({ dealer: nextSeat(board.dealer) })} title="Cycle the dealer">
          Dealer {board.dealer}
        </Chip>
        <Chip
          tone="accent"
          onClick={() => onChange({ humanSeat: nextSeat(board.humanSeat) })}
          title="Cycle the seat the learner sits"
        >
          You: {board.humanSeat}
        </Chip>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "4px 10px" }}>
        <SeatDiagram
          cards={board.hands[board.humanSeat]}
          panelBg={SURFACE}
          width="100%"
          font={14}
          suitW={14}
          pad="4px 8px"
        />
      </div>
      <p
        style={{
          margin: 0,
          padding: "2px 10px 8px",
          textAlign: "center",
          fontSize: 10,
          color: INK_FAINT,
        }}
      >
        You play {SEAT_NAME[board.humanSeat]} · the other three hands stay hidden
      </p>

      {error && !editing && (
        <p
          style={{
            margin: "0 10px 8px",
            padding: "5px 8px",
            borderRadius: 6,
            border: "1px solid #f3c9c2",
            background: "#fdeeec",
            color: BAD,
            fontSize: 10.5,
          }}
        >
          {error}
        </p>
      )}

      {/* Two doors onto the same board: paste a deal, or set it card by card. */}
      <div style={{ display: "flex", borderTop: `1px solid ${PAPER}` }}>
        <button
          type="button"
          onClick={() => setLinking((v) => !v)}
          style={{
            flex: 1,
            padding: "8px 4px",
            border: 0,
            borderRight: `1px solid ${PAPER}`,
            background: linking ? "#eef2ef" : PAPER,
            color: INK_MUTED,
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {linking ? "Close BBO link" : "BBO link"}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={{
            flex: 1,
            padding: "8px 4px",
            border: 0,
            background: editing ? "#eff7f6" : PAPER,
            color: editing ? ACCENT : INK_MUTED,
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {editing ? "Close pack editor" : "Edit pack →"}
        </button>
      </div>

      {linking && (
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", background: PAPER }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a Hand Viewer URL"
            aria-label={`BBO hand link for board ${board.boardNo}`}
            style={{ ...inputStyle, height: 34, fontSize: 12 }}
          />
          <button
            type="button"
            onClick={applyLink}
            disabled={!link.trim()}
            style={{
              flex: "none",
              height: 34,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: link.trim() ? "#22302a" : "#e4ebe7",
              color: link.trim() ? "#fff" : INK_FAINT,
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
              cursor: link.trim() ? "pointer" : "default",
            }}
          >
            Use deal
          </button>
        </div>
      )}

      {editing && (
        <div style={{ padding: 10, background: PAPER }}>
          <PackEditor
            key={`${board.boardNo}:${board.seed}:${board.edited}`}
            hands={board.hands}
            onCancel={() => setEditing(false)}
            onApply={(hands) => {
              onChange({ hands, edited: true });
              setEditing(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
