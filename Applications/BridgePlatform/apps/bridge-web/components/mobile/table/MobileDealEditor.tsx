"use client";

// Phone-native mid-play deal editor. Same server semantics as the desktop
// DealEditor overlay — posts redealEditedAction with the identical contract
// (hand:{seat} serialized ♠.♥.♦.♣, name/dealer/vul/notes, restart /
// saveToLibrary checkboxes) plus mobile=1 so the fork redirects back to
// /m/table. Phone interaction instead of the 52-card desktop grid: pick a
// seat chip (or the pool), then tap rank chips in per-suit rows to give cards
// to it; tapping a card the active seat already holds returns it to the pool.
// Played cards are locked to the seat that played them, exactly like desktop
// (greyed, struck through, never movable) — the server re-checks anyway.

import type { Card, Rank, Seat, Suit, Vul } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import { parseLinToContexts, parsePbn } from "@bridge/formats";
import { useMemo, useState } from "react";
import { redealEditedAction } from "@/app/bridge/table/actions";
import { SUIT_ORDER } from "@/lib/dealText";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redSuit = (s: Suit) => s === "H" || s === "D";

const FONT_KARLA = "var(--font-karla), sans-serif";

// Felt-palette seat tints (mobile design language, not the desktop pastels).
const SEAT_INK: Record<Seat, string> = {
  N: "#205e63",
  E: "#a16207",
  S: "#256e42",
  W: "#8a2d23",
};
const SEAT_BG: Record<Seat, string> = {
  N: "#e6f3f4",
  E: "#fdf3df",
  S: "#e3efe7",
  W: "#f6e2df",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e7e1d3",
  borderRadius: 10,
  padding: "10px 11px",
  font: `400 13px ${FONT_KARLA}`,
  color: "#1d1a15",
  background: "#fffefa",
  boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block",
  margin: "0 0 3px",
  font: `600 10px ${FONT_KARLA}`,
  letterSpacing: ".04em",
  color: "#7b7466",
};

type Owner = Seat | "";
const cid = (suit: Suit, rank: Rank) => `${suit}${rank}`;

export function MobileDealEditor({
  sessionId,
  initialName,
  initialDealer,
  initialVul,
  initialHands,
  locked,
}: Readonly<{
  sessionId: string;
  initialName: string;
  initialDealer: Seat;
  initialVul: Vul;
  /** UNPLAYED cards only (the played ones travel in `locked`). */
  initialHands: Record<Seat, Card[]>;
  /** Already-played cards, pinned to their seats. */
  locked: { seat: Seat; card: Card }[];
}>) {
  const lockedMap = useMemo(() => {
    const m = new Map<string, Seat>();
    for (const l of locked) m.set(cid(l.card.suit, l.card.rank), l.seat);
    return m;
  }, [locked]);
  const [owner, setOwner] = useState<Record<string, Owner>>(() => {
    const m: Record<string, Owner> = {};
    for (const seat of SEATS)
      for (const card of initialHands[seat]) m[cid(card.suit, card.rank)] = seat;
    return m;
  });
  const [active, setActive] = useState<Seat>("N");
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  // Name/dealer/vul become controlled so a LIN/PBN paste can prefill them.
  const [name, setName] = useState(initialName);
  const [dealer, setDealer] = useState<Seat>(initialDealer);
  const [vul, setVul] = useState<Vul>(initialVul);

  const counts = useMemo(() => {
    const c: Record<Seat, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const o of Object.values(owner)) if (o) c[o]++;
    for (const seat of lockedMap.values()) c[seat]++;
    return c;
  }, [owner, lockedMap]);
  const poolCount = 52 - counts.N - counts.E - counts.S - counts.W;
  const complete = SEATS.every((s) => counts[s] === 13);

  const toggle = (suit: Suit, rank: Rank) => {
    const id = cid(suit, rank);
    if (lockedMap.has(id)) return;
    setOwner((o) => ({ ...o, [id]: o[id] === active ? "" : active }));
  };

  /** Give every pool card to the active seat (finishes the last hand fast). */
  const takeRest = () =>
    setOwner((o) => {
      const next = { ...o };
      for (const suit of SUIT_ORDER)
        for (const rank of RANKS_DESC) {
          const id = cid(suit, rank);
          if (!next[id] && !lockedMap.has(id)) next[id] = active;
        }
      return next;
    });

  const loadPaste = () => {
    const text = paste.trim();
    const looksLin = /(^|\|)md\|/.test(text);
    const result = looksLin ? parseLinToContexts(text) : parsePbn(text);
    if (!result.ok || result.contexts.length === 0) {
      setPasteNote(result.ok ? "No boards in that text." : result.error);
      return;
    }
    const ctx = result.contexts[0]!;
    const m: Record<string, Owner> = {};
    for (const seat of SEATS)
      for (const card of ctx.hands[seat]) m[cid(card.suit, card.rank)] = seat;
    setOwner(m);
    setDealer(ctx.dealer);
    setVul(ctx.vul);
    if (ctx.name) setName(ctx.name);
    setPasteNote("Loaded.");
  };

  // Full hands travel to the server: assigned + locked cards at their seats.
  const serialized = (seat: Seat) =>
    SUIT_ORDER.map((suit) =>
      RANKS_DESC.filter((rank) => {
        const id = cid(suit, rank);
        return owner[id] === seat || lockedMap.get(id) === seat;
      })
        .map((rank) => rankLabel(rank))
        .join(""),
    ).join(".");

  /** A seat tile: tap to make it the drop target; shows count + hand preview. */
  const seatTile = (seat: Seat) => {
    const isActive = active === seat;
    return (
      <button
        key={seat}
        type="button"
        onClick={() => setActive(seat)}
        aria-label={`Give cards to ${SEAT_NAME[seat]} (${counts[seat]} of 13)`}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: isActive ? `1.5px solid ${SEAT_INK[seat]}` : "1px solid #e7e1d3",
          background: isActive ? SEAT_BG[seat] : "#fffefa",
          borderRadius: 11,
          padding: "7px 8px",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            font: `700 10px ${FONT_KARLA}`,
            color: SEAT_INK[seat],
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          {seat}
          <span style={{ color: counts[seat] === 13 ? "#256e42" : "#8a2d23" }}>
            {counts[seat]}/13
          </span>
        </span>
        {SUIT_ORDER.map((suit) => {
          const cells = RANKS_DESC.flatMap((rank) => {
            const id = cid(suit, rank);
            if (owner[id] === seat) return [{ label: rankLabel(rank), played: false }];
            if (lockedMap.get(id) === seat) return [{ label: rankLabel(rank), played: true }];
            return [];
          });
          return (
            <span
              key={suit}
              style={{
                display: "flex",
                gap: 3,
                font: `500 9px ${FONT_KARLA}`,
                lineHeight: 1.4,
                color: "#1d1a15",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: redSuit(suit) ? "#8a2d23" : "#1d1a15" }}>{GLYPH[suit]}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {cells.length
                  ? cells.map((c, i) => (
                      <span
                        key={i}
                        style={
                          c.played
                            ? { color: "#a49d8e", textDecoration: "line-through" }
                            : undefined
                        }
                      >
                        {c.label}
                        {i < cells.length - 1 ? " " : ""}
                      </span>
                    ))
                  : "—"}
              </span>
            </span>
          );
        })}
      </button>
    );
  };

  return (
    <form
      action={redealEditedAction}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="mobile" value="1" />
      {SEATS.map((seat) => (
        <input key={seat} type="hidden" name={`hand:${seat}`} value={serialized(seat)} />
      ))}

      {/* Prefill from LIN/PBN — same convenience as the desktop editor. */}
      <details
        style={{
          border: "1px solid #e7e1d3",
          borderRadius: 11,
          background: "#fffefa",
          padding: "9px 12px",
        }}
      >
        <summary style={{ cursor: "pointer", font: `500 11px ${FONT_KARLA}`, color: "#7b7466" }}>
          Prefill from a BBO LIN string or PBN…
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder="pn|South,West,North,East|md|1S...|  —  or PBN with [Deal]"
            aria-label="LIN or PBN text"
            style={{ ...INPUT, fontFamily: "monospace", fontSize: 11 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={loadPaste}
              disabled={!paste.trim()}
              aria-label="Load the pasted deal"
              style={{
                border: "1px solid #d3ccbb",
                background: "#fff",
                borderRadius: 8,
                padding: "6px 14px",
                font: `600 11px ${FONT_KARLA}`,
                color: "#5e5749",
                cursor: "pointer",
                opacity: paste.trim() ? 1 : 0.4,
              }}
            >
              Load
            </button>
            {pasteNote && (
              <span style={{ font: `400 10.5px ${FONT_KARLA}`, color: "#7b7466" }}>
                {pasteNote}
              </span>
            )}
          </div>
        </div>
      </details>

      {/* Board facts (dealer/vul stay editable mid-play, like the desktop
          overlay — the server only applies them on a restart). */}
      <label style={{ display: "block" }}>
        <span style={LABEL}>Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weak 2 defense, board 4"
          style={INPUT}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "block" }}>
          <span style={LABEL}>Dealer</span>
          <select
            name="dealer"
            value={dealer}
            onChange={(e) => setDealer(e.target.value as Seat)}
            style={INPUT}
          >
            {SEATS.map((s) => (
              <option key={s} value={s}>
                {SEAT_NAME[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span style={LABEL}>Vulnerability</span>
          <select
            name="vul"
            value={vul}
            onChange={(e) => setVul(e.target.value as Vul)}
            style={INPUT}
          >
            <option value="none">none</option>
            <option value="ns">NS</option>
            <option value="ew">EW</option>
            <option value="both">both</option>
          </select>
        </label>
      </div>
      <label style={{ display: "block" }}>
        <span style={LABEL}>Notes (optional)</span>
        <textarea name="notes" rows={2} style={INPUT} />
      </label>

      <p style={{ margin: 0, font: `400 11px/1.5 ${FONT_KARLA}`, color: "#7b7466" }}>
        Tap a seat, then tap cards to give them to it — tap one of its cards again to return it
        to the pool. Greyed cards were already played and can&apos;t move.
      </p>

      {/* Seat tiles with live previews */}
      <div style={{ display: "flex", gap: 6 }}>{SEATS.map(seatTile)}</div>

      {/* Per-suit rank-chip rows (the phone-sized 52-card grid) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {SUIT_ORDER.map((suit) => (
          <div key={suit} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              aria-hidden
              style={{
                flex: "none",
                width: 15,
                textAlign: "center",
                font: `600 12px ${FONT_KARLA}`,
                color: redSuit(suit) ? "#8a2d23" : "#1d1a15",
              }}
            >
              {GLYPH[suit]}
            </span>
            {RANKS_DESC.map((rank) => {
              const id = cid(suit, rank);
              const lockSeat = lockedMap.get(id);
              const own = lockSeat ?? owner[id] ?? "";
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => toggle(suit, rank)}
                  disabled={!!lockSeat}
                  aria-label={`${GLYPH[suit]}${rankLabel(rank)}${
                    lockSeat
                      ? ` — played by ${SEAT_NAME[lockSeat]}, locked`
                      : own
                        ? ` — held by ${SEAT_NAME[own as Seat]}`
                        : " — in the pool"
                  }`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 34,
                    borderRadius: 6,
                    font: `600 11px ${FONT_KARLA}`,
                    padding: 0,
                    cursor: lockSeat ? "not-allowed" : "pointer",
                    ...(lockSeat
                      ? {
                          border: "1px solid #ece7db",
                          background: "#f0ece2",
                          color: "#c3bba8",
                          textDecoration: "line-through",
                        }
                      : own
                        ? {
                            border: `1px solid ${SEAT_INK[own as Seat]}`,
                            background: SEAT_BG[own as Seat],
                            color: SEAT_INK[own as Seat],
                          }
                        : {
                            border: "1px solid #e7e1d3",
                            background: "#fffefa",
                            color: "#1d1a15",
                          }),
                  }}
                >
                  {rankLabel(rank)}
                  {own && (
                    <span style={{ display: "block", fontSize: 7, lineHeight: 1, opacity: 0.8 }}>
                      {own}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          font: `500 12px ${FONT_KARLA}`,
          color: poolCount === 0 ? "#256e42" : "#7b7466",
        }}
      >
        <span>{poolCount === 0 ? "Every card is placed." : `${poolCount} in the pool`}</span>
        {poolCount > 0 && (
          <button
            type="button"
            onClick={takeRest}
            aria-label={`Give the rest to ${SEAT_NAME[active]}`}
            style={{
              border: "1px solid #d3ccbb",
              background: "#fff",
              borderRadius: 8,
              padding: "4px 10px",
              font: `600 10.5px ${FONT_KARLA}`,
              color: "#5e5749",
              cursor: "pointer",
            }}
          >
            give the rest to {SEAT_NAME[active]}
          </button>
        )}
      </div>

      {/* Same footer options as the desktop overlay. */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          font: `400 12px ${FONT_KARLA}`,
          color: "#5e5749",
        }}
      >
        <input type="checkbox" name="restart" aria-label="Restart the board on the edited deal" />
        restart the board instead (fresh auction on the edited deal)
      </label>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          font: `400 12px ${FONT_KARLA}`,
          color: "#5e5749",
        }}
      >
        <input
          type="checkbox"
          name="saveToLibrary"
          aria-label="Also save the edited board to the library"
        />
        also save the edited board to the library
      </label>

      <button
        type="submit"
        disabled={!complete}
        aria-label="Apply the edited deal and continue"
        title={complete ? undefined : "All 52 cards must be placed, 13 per hand"}
        style={{
          border: "none",
          background: "#205e63",
          color: "#fff",
          borderRadius: 10,
          padding: 13,
          font: `600 13px ${FONT_KARLA}`,
          cursor: complete ? "pointer" : "not-allowed",
          opacity: complete ? 1 : 0.4,
        }}
      >
        Apply and continue
      </button>
    </form>
  );
}
