"use client";

// Deal editor (2026-07-17, prototype-inspired): type each hand suit by suit
// with live validation — duplicate cards are flagged as you type, the
// remaining-cards pool shrinks card by card, and the last hand is one click
// ("take the rest"). A paste box prefills everything from a BBO LIN string
// or PBN. Posts `hand:{seat}` in the serialized ♠.♥.♦.♣ form; the server
// action re-parses and re-validates.

import type { Rank, Seat, Suit, Vul } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import { parseLinToContexts, parsePbn } from "@bridge/formats";
import { useMemo, useState } from "react";
import { ranksFromText, suitTextsFromCards, SUIT_ORDER } from "@/lib/dealText";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redSuit = (s: Suit) => s === "H" || s === "D";
const ALL_RANKS: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

type HandTexts = Record<Suit, string>;
const emptyHand = (): HandTexts => ({ S: "", H: "", D: "", C: "" });

export function DealEditor() {
  const [hands, setHands] = useState<Record<Seat, HandTexts>>({
    N: emptyHand(),
    E: emptyHand(),
    S: emptyHand(),
    W: emptyHand(),
  });
  const [name, setName] = useState("");
  const [dealer, setDealer] = useState<Seat>("N");
  const [vul, setVul] = useState<Vul>("none");
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  const setSuit = (seat: Seat, suit: Suit, text: string) =>
    setHands((prev) => ({ ...prev, [seat]: { ...prev[seat], [suit]: text } }));

  // Live validation: parse every suit, find bad characters, in-hand and
  // cross-hand duplicates, per-seat counts, and the unassigned pool.
  const check = useMemo(() => {
    const owner = new Map<string, Seat>(); // "S14" → first seat holding it
    const problems: string[] = [];
    const counts = { N: 0, E: 0, S: 0, W: 0 } as Record<Seat, number>;
    for (const seat of SEATS) {
      const seen = new Set<string>();
      for (const suit of SUIT_ORDER) {
        const ranks = ranksFromText(hands[seat][suit]);
        if ("error" in ranks) {
          problems.push(`${SEAT_NAME[seat]} ${GLYPH[suit]}: ${ranks.error}`);
          continue;
        }
        for (const rank of ranks) {
          const id = `${suit}${rank}`;
          if (seen.has(id)) {
            problems.push(`${SEAT_NAME[seat]} holds ${GLYPH[suit]}${rankLabel(rank)} twice`);
            continue;
          }
          seen.add(id);
          const holder = owner.get(id);
          if (holder) {
            problems.push(
              `${GLYPH[suit]}${rankLabel(rank)} is in both ${SEAT_NAME[holder]} and ${SEAT_NAME[seat]}`,
            );
          } else {
            owner.set(id, seat);
          }
          counts[seat]++;
        }
      }
    }
    const remaining: Record<Suit, Rank[]> = { S: [], H: [], D: [], C: [] };
    for (const suit of SUIT_ORDER)
      for (const rank of ALL_RANKS)
        if (!owner.has(`${suit}${rank}`)) remaining[suit].push(rank);
    const remainingCount = 52 - owner.size;
    const complete =
      problems.length === 0 && SEATS.every((s) => counts[s] === 13);
    return { problems, counts, remaining, remainingCount, complete };
  }, [hands]);

  /** Give every unassigned card to one seat (finishing the last hand fast). */
  const takeRest = (seat: Seat) =>
    setHands((prev) => {
      const next = { ...prev[seat] };
      for (const suit of SUIT_ORDER) {
        const extra = check.remaining[suit].map((r) => rankLabel(r)).join("");
        if (extra) next[suit] = `${prev[seat][suit]}${extra}`;
      }
      return { ...prev, [seat]: next };
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
    setHands({
      N: suitTextsFromCards(ctx.hands.N),
      E: suitTextsFromCards(ctx.hands.E),
      S: suitTextsFromCards(ctx.hands.S),
      W: suitTextsFromCards(ctx.hands.W),
    });
    setDealer(ctx.dealer);
    setVul(ctx.vul);
    if (ctx.name) setName(ctx.name);
    setPasteNote(
      result.contexts.length > 1
        ? `Loaded board 1 of ${result.contexts.length} — import the file on the Library page for all of them.`
        : "Loaded.",
    );
  };

  const serialized = (seat: Seat) => SUIT_ORDER.map((s) => hands[seat][s]).join(".");

  return (
    <div className="space-y-5">
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
      </div>

      {/* The four hands */}
      <div className="grid gap-3 sm:grid-cols-2">
        {SEATS.map((seat) => (
          <fieldset key={seat} className="rounded-lg border border-neutral-200 p-3">
            <legend className="flex items-center gap-2 px-1 text-sm">
              <span className="font-medium">{SEAT_NAME[seat]}</span>
              <span
                className={`text-xs tabular-nums ${
                  check.counts[seat] === 13 ? "text-emerald-700" : "text-neutral-400"
                }`}
              >
                {check.counts[seat]}/13
              </span>
              {check.counts[seat] < 13 && check.remainingCount > 0 && (
                <button
                  type="button"
                  onClick={() => takeRest(seat)}
                  className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:border-emerald-400"
                  title="Add every unassigned card to this hand"
                >
                  take the rest
                </button>
              )}
            </legend>
            <div className="space-y-1.5">
              {SUIT_ORDER.map((suit) => (
                <label key={suit} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`w-4 text-center ${redSuit(suit) ? "text-[var(--madder)]" : ""}`}
                  >
                    {GLYPH[suit]}
                  </span>
                  <input
                    aria-label={`${SEAT_NAME[seat]} ${GLYPH[suit]}`}
                    value={hands[seat][suit]}
                    onChange={(e) => setSuit(seat, suit, e.target.value)}
                    placeholder="AKQJT98765432"
                    spellCheck={false}
                    className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-sm uppercase tracking-wide"
                  />
                </label>
              ))}
            </div>
            <input type="hidden" name={`hand:${seat}`} value={serialized(seat)} />
          </fieldset>
        ))}
      </div>

      {/* The pool */}
      <div className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-2.5 text-sm">
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
          Not dealt yet · {check.remainingCount}
        </p>
        {check.remainingCount === 0 ? (
          <p className="text-emerald-700">Every card is placed.</p>
        ) : (
          SUIT_ORDER.map((suit) => (
            <p key={suit} className="flex items-baseline gap-2 tabular-nums">
              <span aria-hidden className={`w-4 text-center ${redSuit(suit) ? "text-[var(--madder)]" : ""}`}>
                {GLYPH[suit]}
              </span>
              <span className="tracking-wider text-neutral-600">
                {check.remaining[suit].map((r) => rankLabel(r)).join(" ") || "—"}
              </span>
            </p>
          ))
        )}
      </div>

      {check.problems.length > 0 && (
        <ul className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {check.problems.slice(0, 4).map((p) => (
            <li key={p}>{p}</li>
          ))}
          {check.problems.length > 4 && <li>…and {check.problems.length - 4} more</li>}
        </ul>
      )}

      <button
        type="submit"
        disabled={!check.complete}
        className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
        title={check.complete ? undefined : "All 52 cards must be placed, 13 per hand"}
      >
        Save board
      </button>
    </div>
  );
}
