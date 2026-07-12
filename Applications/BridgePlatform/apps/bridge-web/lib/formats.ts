// PBN/LIN import & export glue (BP §7.2). Import parses pasted text into a
// BoardInput (+ optional recorded auction/play primed as action events);
// export rebuilds a GameContext from the session record + folded state.
//
// Imported actions carry NO logic events (there is no decision trace to
// invent — attribution honesty): they take odd seqs 1,3,5,… so the engine's
// logicSeq = seq-1 bookkeeping and undo rollback stay consistent.

import type { BoardInput, GameState } from "@bridge/engine";
import type { BidEvent, GameEvent, PlayEvent, Seat } from "@bridge/events";
import {
  parseLinToContexts,
  parsePbn,
  toLin,
  toPbn,
  validateDeal,
  type GameContext,
  type PlayedCard,
} from "@bridge/formats";
import type { BridgeSessionRecord } from "@bridge/sessions";

export interface ImportedBoard {
  format: "pbn" | "lin";
  board: BoardInput;
  /** Recorded history (if the text contained an auction/play), primed-ready. */
  events: GameEvent[];
  warnings: string[];
}

export function importBoardText(text: string): ImportedBoard {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste a PBN or LIN board first");

  let ctx: GameContext | undefined;
  let format: "pbn" | "lin" = "pbn";
  const pbn = parsePbn(trimmed);
  if (pbn.ok && pbn.contexts.length) {
    ctx = pbn.contexts[0];
  } else {
    const lin = parseLinToContexts(trimmed);
    if (lin.ok && lin.contexts.length) {
      ctx = lin.contexts[0];
      format = "lin";
    }
  }
  if (!ctx)
    throw new Error(
      `Could not parse as PBN${pbn.ok ? "" : ` (${(pbn as { error: string }).error})`} or LIN`,
    );

  const dealError = validateDeal(ctx.hands);
  if (dealError) throw new Error(`Invalid deal: ${dealError}`);
  const total = (["N", "E", "S", "W"] as Seat[]).reduce((n, s) => n + ctx.hands[s].length, 0);
  if (total !== 52) throw new Error(`Deal has ${total} cards — a full 52-card deal is required`);

  const board: BoardInput = {
    name: ctx.name || "imported board",
    dealer: ctx.dealer,
    vul: ctx.vul,
    hands: ctx.hands,
  };

  const warnings: string[] = [];
  const events: GameEvent[] = [];
  let seq = 1; // odd seqs; even "logic" slots stay empty (imported = no trace)
  const ts = Date.now();
  for (const call of ctx.auction) {
    const e: BidEvent = {
      seq, ts, boardRef: board.name, category: "bid-event",
      seat: call.seat, call: call.call, fallback: false,
    };
    events.push(e);
    seq += 2;
  }
  if (ctx.play?.length) {
    const ordered = [...ctx.play].sort((a, b) => a.trickIndex - b.trickIndex);
    // Within a trick the parser preserves play order; sort is stable.
    for (const p of ordered) {
      const e: PlayEvent = {
        seq, ts, boardRef: board.name, category: "play-event",
        seat: p.seat, card: p.card, fallback: false,
      };
      events.push(e);
      seq += 2;
    }
  }
  if (events.length)
    warnings.push(
      `Imported ${ctx.auction.length} calls${ctx.play?.length ? ` + ${ctx.play.length} plays` : ""} as recorded history (no decision traces — they were not made at this table).`,
    );
  return { format, board, events, warnings };
}

/** Rebuild a GameContext for the writers from the record + folded state. */
export function sessionToContext(record: BridgeSessionRecord, state: GameState): GameContext {
  const play: PlayedCard[] = state.tricks.flatMap((t, trickIndex) =>
    t.plays.map((p) => ({ seat: p.seat, card: p.card, trickIndex })),
  );
  return {
    name: record.board.name,
    dealer: record.board.dealer,
    vul: record.board.vul,
    players: { N: "", E: "", S: "", W: "" },
    hands: record.board.hands, // the ORIGINAL full deal, not remaining cards
    auction: state.auction,
    play: play.length ? play : undefined,
    contract: state.contract,
    source: "manual",
  };
}

export function exportSession(
  record: BridgeSessionRecord,
  state: GameState,
  format: "pbn" | "lin",
): string {
  const ctx = sessionToContext(record, state);
  return format === "lin" ? toLin(ctx) : toPbn(ctx);
}
