"use client";

// One board card in the create wizard (the "02 · Boards" section of
// docs/design/challenges/Create Challenge.dc.html): the seeded deal from the
// seat you will sit, the dealer / seat chips, a re-roll, and the pack editor.
//
// The editor is the platform's own DealEditor — not a challenge-flavoured
// copy. It posts hands as `hand:{seat}` hidden inputs and owns its own submit
// button, so it lives inside a small local <form> whose submit we intercept:
// the FormData is exactly the contract the library server action re-parses.
// OPENING it sets the editor badge (spec §3) — seeing the hands is the act,
// not changing them.

import type { Card, Seat, Vul } from "@bridge/events";
import type { ChallengeBoardDraft } from "../draft";
import { parseBbo } from "@bridge/formats";
import { SeatDiagram } from "@bridge/table-ui";
import { useState } from "react";
import { DealEditor } from "@/components/library/DealEditor";
import { handFromSerialized } from "@/lib/dealText";

const SEAT_CYCLE: readonly Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const VUL_LABEL: Record<Vul, string> = { none: "None", ns: "N-S", ew: "E-W", both: "Both" };

export interface BoardDraftState {
  boardNo: number;
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  /** The pack editor was opened on this board — the badge is already set. */
  touched: boolean;
  /** The pack differs from the seeded deal, so it travels card-by-card. */
  edited: boolean;
  /** The frozen story, when the challenge's format is "puzzle". */
  puzzle?: NonNullable<ChallengeBoardDraft["puzzle"]>;
}

export const nextSeat = (seat: Seat): Seat =>
  SEAT_CYCLE[(SEAT_CYCLE.indexOf(seat) + 1) % 4] ?? "N";

export function BoardCard({
  board,
  onChange,
  onReroll,
  onOpenEditor,
}: Readonly<{
  board: BoardDraftState;
  onChange: (patch: Partial<BoardDraftState>) => void;
  onReroll: () => void;
  /** Called the moment the editor opens — this is what sets the badge. */
  onOpenEditor: () => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linking, setLinking] = useState(false);

  /** Take the FIRST board out of a pasted BBO link and make it this board. */
  const applyLink = () => {
    const parsed = parseBbo(link);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const imported = parsed.boards[0]!;
    setError(null);
    setLink("");
    setLinking(false);
    // Importing a named deal IS setting the board — the creator has had the
    // hands in front of them — so it carries the same badge the editor does.
    onOpenEditor();
    onChange({
      hands: imported.hands,
      dealer: imported.dealer,
      vul: imported.vul,
      edited: true,
      touched: true,
    });
  };

  const openEditor = () => {
    setEditing(true);
    onOpenEditor();
  };

  /** Read the DealEditor's own form contract back out and keep the pack. */
  const applyPack = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const hands = { N: [], E: [], S: [], W: [] } as Record<Seat, Card[]>;
    for (const seat of SEAT_CYCLE) {
      const parsed = handFromSerialized(String(data.get(`hand:${seat}`) ?? ""));
      if ("error" in parsed) {
        setError(`${SEAT_NAME[seat]}: ${parsed.error}`);
        return;
      }
      if (parsed.length !== 13) {
        setError(`${SEAT_NAME[seat]} holds ${parsed.length} cards, not 13.`);
        return;
      }
      hands[seat] = parsed;
    }
    setError(null);
    onChange({ hands, edited: true });
    setEditing(false);
  };

  const vulnerable = board.vul !== "none";
  const errorEl = error ? (
    <p className="mx-2.5 mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-invalid">
      {error}
    </p>
  ) : null;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        board.touched ? "border-amber-300" : "border-neutral-200"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-100 px-2.5 py-2">
        <span className="text-[13px] font-bold text-neutral-900">
          Board {board.boardNo}
        </span>
        {board.touched && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-draft">
            edited
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onReroll}
          title="Re-roll this deal"
          className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-[11px] font-bold text-neutral-700 hover:border-emerald-400"
        >
          ↻ Re-roll
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-2.5 pb-1 pt-2">
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-bold ${
            vulnerable ? "bg-red-50 text-invalid" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          Vul {VUL_LABEL[board.vul]}
        </span>
        <button
          type="button"
          onClick={() => onChange({ dealer: nextSeat(board.dealer) })}
          title="Cycle the dealer"
          className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-700 hover:border-emerald-400"
        >
          Dealer {board.dealer}
        </button>
        <button
          type="button"
          onClick={() => onChange({ humanSeat: nextSeat(board.humanSeat) })}
          title="Cycle the seat every player sits"
          className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:border-emerald-500"
        >
          You: {board.humanSeat}
        </button>
      </div>

      <div className="flex justify-center px-2.5 py-1.5">
        <SeatDiagram
          cards={board.hands[board.humanSeat]}
          panelBg="#fff"
          width="100%"
          font={14}
          suitW={14}
          pad="4px 8px"
        />
      </div>
      <p className="px-2.5 pb-2 text-center text-[10.5px] text-neutral-400">
        You play {SEAT_NAME[board.humanSeat]} · the other three hands stay hidden
        until you open the editor
      </p>

      {!editing && errorEl}

      {/* Two doors onto the same board: paste a deal, or set it card by card.
          Both fold away — six cards of permanent chrome is a wall. */}
      <div className="flex border-t border-neutral-100 text-xs font-bold">
        <button
          type="button"
          onClick={() => setLinking((v) => !v)}
          className={`flex-1 border-r border-neutral-100 py-2 ${
            linking ? "bg-neutral-100 text-neutral-800" : "bg-neutral-50 text-neutral-600"
          }`}
        >
          {linking ? "Close BBO link" : "BBO link"}
        </button>
        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : openEditor())}
          className={`flex-1 py-2 ${
            editing ? "bg-emerald-50 text-emerald-800" : "bg-neutral-50 text-neutral-600"
          }`}
        >
          {editing ? "Close pack editor" : "Edit pack →"}
        </button>
      </div>

      {linking && (
        <div className="flex gap-1.5 border-t border-neutral-100 bg-neutral-50 px-2.5 py-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a Hand Viewer URL"
            aria-label={`BBO hand link for board ${board.boardNo}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 text-[12px] text-neutral-900"
          />
          <button
            type="button"
            onClick={applyLink}
            disabled={!link.trim()}
            className="h-9 shrink-0 rounded-lg bg-neutral-800 px-3 text-[11px] font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            Use deal
          </button>
        </div>
      )}

      {editing && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-2.5 py-3">
          {/* The DealEditor is a board editor; here it edits a PACK. Its name
              and notes fields belong to library boards, so they are hidden
              rather than the component forked. */}
          <style>{`.pack-editor label:has(input[name="name"]),
                   .pack-editor label:has(textarea[name="notes"]) { display: none; }`}</style>
          <p className="mb-2.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-draft">
            Card-by-card editor. Opening it set the <b>“set the boards”</b> badge
            on your leaderboard row — that cannot be undone.
          </p>
          {error && (
            <p className="mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-invalid">
              {error}
            </p>
          )}
          <form
            className="pack-editor"
            onSubmit={(e) => {
              e.preventDefault();
              applyPack(e.currentTarget);
            }}
          >
            <DealEditor
              key={`${board.boardNo}:${board.seed}`}
              initialHands={board.hands}
              hideBoardFacts
              submitLabel="Use this pack"
            />
          </form>
        </div>
      )}
    </div>
  );
}
