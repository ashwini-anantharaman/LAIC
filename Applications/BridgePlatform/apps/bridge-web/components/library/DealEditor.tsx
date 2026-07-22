"use client";

// Deal editor (2026-07-17, ported from the bridgebot prototype's DealGrid):
// four color-tinted seat tiles with live hand previews, and the 52-card grid
// below — click a seat, then click cards to give them to it (click a seat's
// own card to return it to the pool). Assignment is completely free; the
// 13-per-hand check gates the submit. A paste box prefills everything from a
// BBO LIN string or PBN. Posts `hand:{seat}` in the serialized ♠.♥.♦.♣ form;
// the server action re-parses and re-validates.

import type { Card, Rank, Seat, Suit, Vul } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import { parseLinToContexts, parsePbn } from "@bridge/formats";
import { useMemo, useState, type ReactNode } from "react";
import { SUIT_ORDER } from "@/lib/dealText";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redSuit = (s: Suit) => s === "H" || s === "D";

const SEAT_TINT: Record<Seat, string> = {
  N: "border-sky-400 bg-sky-100 text-sky-900",
  E: "border-violet-400 bg-violet-100 text-violet-900",
  S: "border-emerald-400 bg-emerald-100 text-emerald-900",
  W: "border-amber-400 bg-amber-100 text-amber-900",
};
const SEAT_CHIP: Record<Seat, string> = {
  N: "bg-sky-600",
  E: "bg-violet-600",
  S: "bg-emerald-600",
  W: "bg-amber-500",
};

type Owner = Seat | "";
const cid = (suit: Suit, rank: Rank) => `${suit}${rank}`;

export function DealEditor({
  initialName = "",
  initialDealer = "N",
  initialVul = "none",
  initialNotes = "",
  initialHands,
  locked,
  hideBoardFacts,
  submitLabel = "Save board",
  footer,
}: Readonly<{
  initialName?: string;
  initialDealer?: Seat;
  initialVul?: Vul;
  initialNotes?: string;
  /** Prefill — when `locked` is given, pass only the UNPLAYED cards here. */
  initialHands?: Record<Seat, Card[]>;
  /** Already-played cards (mid-play editing): pinned to their seats, greyed. */
  locked?: { seat: Seat; card: Card }[];
  /** Bare deals: no dealer/vul selects (the name field stays). */
  hideBoardFacts?: boolean;
  submitLabel?: string;
  /** Extra form controls rendered just above the submit button. */
  footer?: ReactNode;
}>) {
  const lockedMap = useMemo(() => {
    const m = new Map<string, Seat>();
    for (const l of locked ?? []) m.set(cid(l.card.suit, l.card.rank), l.seat);
    return m;
  }, [locked]);
  const [owner, setOwner] = useState<Record<string, Owner>>(() => {
    const m: Record<string, Owner> = {};
    if (initialHands)
      for (const seat of SEATS)
        for (const card of initialHands[seat]) m[cid(card.suit, card.rank)] = seat;
    return m;
  });
  const [active, setActive] = useState<Seat>("N");
  const [name, setName] = useState(initialName);
  const [dealer, setDealer] = useState<Seat>(initialDealer);
  const [vul, setVul] = useState<Vul>(initialVul);
  const [notes, setNotes] = useState(initialNotes);
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  // Totals per seat = freely assigned + locked (played) cards.
  const counts = useMemo(() => {
    const c: Record<Seat, number> = { N: 0, E: 0, S: 0, W: 0 };
    for (const o of Object.values(owner)) if (o) c[o]++;
    for (const seat of lockedMap.values()) c[seat]++;
    return c;
  }, [owner, lockedMap]);
  const poolCount = 52 - counts.N - counts.E - counts.S - counts.W;
  const complete = SEATS.every((s) => counts[s] === 13);

  // Free assignment: give to the active seat; clicking the active seat's own
  // card returns it to the pool; another seat's card moves to the active
  // seat. Played cards never move.
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
    setPasteNote(
      result.contexts.length > 1
        ? `Loaded board 1 of ${result.contexts.length} — import the file on the Library page for all of them.`
        : "Loaded.",
    );
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

  /** Live hand preview inside a seat tile. */
  const preview = (seat: Seat) => (
    <button
      key={seat}
      type="button"
      onClick={() => setActive(seat)}
      className={`rounded-md border px-2 py-1.5 text-left ${
        active === seat
          ? SEAT_TINT[seat]
          : "border-neutral-200 bg-white hover:border-neutral-400"
      }`}
      title={`Click cards below to give them to ${SEAT_NAME[seat]}`}
    >
      <div className="flex items-center justify-between text-[10px] font-bold uppercase">
        {SEAT_NAME[seat]}
        <span
          className={`font-mono ${counts[seat] === 13 ? "text-emerald-600" : "text-rose-600"}`}
        >
          {counts[seat]}/13
        </span>
      </div>
      {SUIT_ORDER.map((suit) => {
        const cells = RANKS_DESC.flatMap((rank) => {
          const id = cid(suit, rank);
          if (owner[id] === seat) return [{ label: rankLabel(rank), played: false }];
          if (lockedMap.get(id) === seat) return [{ label: rankLabel(rank), played: true }];
          return [];
        });
        return (
          <div key={suit} className="flex gap-1 font-mono text-[10px] leading-4">
            <span className={redSuit(suit) ? "text-[var(--madder)]" : ""}>{GLYPH[suit]}</span>
            <span className="truncate">
              {cells.length
                ? cells.map((c, i) => (
                    <span key={i} className={c.played ? "text-neutral-400 line-through" : ""}>
                      {c.label}
                      {i < cells.length - 1 ? " " : ""}
                    </span>
                  ))
                : "—"}
            </span>
          </div>
        );
      })}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Prefill from LIN/PBN */}
      <details className="rounded-lg border border-neutral-200">
        <summary className="cursor-pointer px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900">
          Prefill from a BBO LIN string or PBN…
        </summary>
        <div className="space-y-2 border-t border-[var(--line)] px-4 py-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder="pn|South,West,North,East|md|1S...|  —  or PBN with [Deal “N:...”]"
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadPaste}
              disabled={!paste.trim()}
              className="rounded border border-neutral-300 px-3 py-1 text-sm hover:border-emerald-400 disabled:opacity-40"
            >
              Load
            </button>
            {pasteNote && <span className="text-xs text-neutral-500">{pasteNote}</span>}
          </div>
        </div>
      </details>

      {/* Board facts */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Name</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weak 2 defense, board 4"
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        {!hideBoardFacts && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Dealer</span>
              <select
                name="dealer"
                value={dealer}
                onChange={(e) => setDealer(e.target.value as Seat)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              >
                {SEATS.map((s) => (
                  <option key={s} value={s}>
                    {SEAT_NAME[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Vulnerability</span>
              <select
                name="vul"
                value={vul}
                onChange={(e) => setVul(e.target.value as Vul)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              >
                <option value="none">none</option>
                <option value="ns">NS</option>
                <option value="ew">EW</option>
                <option value="both">both</option>
              </select>
            </label>
          </>
        )}
        <label className="text-sm sm:col-span-3">
          <span className="mb-1 block text-xs text-neutral-500">Notes (optional)</span>
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
      </div>

      <p className="text-xs text-neutral-500">
        Click a seat, then click cards to give them to it — click one of its cards again to
        return it to the pool.
      </p>

      {/* Seat tiles with live previews */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{SEATS.map(preview)}</div>

      {/* The 52-card grid */}
      <div className="space-y-1">
        {SUIT_ORDER.map((suit) => (
          <div key={suit} className="flex items-center gap-0.5 sm:gap-1">
            <span
              aria-hidden
              className={`w-4 text-center text-sm ${redSuit(suit) ? "text-[var(--madder)]" : ""}`}
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
                  aria-label={`${GLYPH[suit]}${rankLabel(rank)}`}
                  title={
                    lockSeat
                      ? `played by ${SEAT_NAME[lockSeat]} — locked`
                      : own === active
                        ? `held by ${SEAT_NAME[active]} — click to return to the pool`
                        : `give to ${SEAT_NAME[active]}`
                  }
                  className={`relative h-8 min-w-0 flex-1 rounded border text-[11px] font-semibold transition-colors sm:min-w-6 sm:text-[12px] ${
                    lockSeat
                      ? "border-neutral-200 bg-neutral-100 text-neutral-300 line-through"
                      : own
                        ? SEAT_TINT[own]
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                  }`}
                >
                  {rankLabel(rank)}
                  {own && (
                    <span
                      className={`absolute -right-0.5 -top-1 rounded-sm px-0.5 text-[8px] font-bold leading-3 text-white ${
                        lockSeat ? "bg-neutral-400" : SEAT_CHIP[own]
                      }`}
                    >
                      {own}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className={poolCount === 0 ? "text-emerald-700" : "text-neutral-500"}>
          {poolCount === 0 ? "Every card is placed." : `${poolCount} in the pool`}
        </span>
        {poolCount > 0 && (
          <button
            type="button"
            onClick={takeRest}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:border-emerald-400"
          >
            give the rest to {SEAT_NAME[active]}
          </button>
        )}
      </div>

      {/* The form contract: serialized hands travel as hidden inputs. */}
      {SEATS.map((seat) => (
        <input key={seat} type="hidden" name={`hand:${seat}`} value={serialized(seat)} />
      ))}

      {footer}

      <button
        type="submit"
        disabled={!complete}
        className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
        title={complete ? undefined : "All 52 cards must be placed, 13 per hand"}
      >
        {submitLabel}
      </button>
    </div>
  );
}
