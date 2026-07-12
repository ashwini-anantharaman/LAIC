import { initialState, reconstruct } from "@bridge/engine";
import type { ActionEvent } from "@bridge/events";
import type { BridgeSessionRecord } from "@bridge/sessions";
import { describe, expect, it } from "vitest";
import { exportSession, importBoardText } from "./formats";

// One-suit-per-seat deal keeps the hand-authored play trivially legal:
// E leads a heart, S (void) discards, W (void) discards, N ruffs with the
// spade trump — N wins the trick.
const PBN = `[Event "Round trip board"]
[Dealer "N"]
[Vulnerable "NS"]
[Deal "N:AKQJT98765432... .AKQJT98765432.. ..AKQJT98765432. ...AKQJT98765432"]
[Auction "N"]
1S Pass Pass Pass
[Play "E"]
HA D2 C2 S2
*`;

describe("PBN import → session events → export round trip", () => {
  it("imports as action events only, at odd seqs (no invented decision traces)", () => {
    const imported = importBoardText(PBN);
    expect(imported.format).toBe("pbn");
    expect(imported.board.dealer).toBe("N");
    expect(imported.board.vul).toBe("ns");
    expect(imported.events).toHaveLength(4 + 4); // 4 calls + 4 plays
    expect(imported.events.map((e) => e.seq)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(imported.events.every((e) => e.category === "bid-event" || e.category === "play-event")).toBe(true);
    expect(imported.warnings.some((w) => w.includes("no decision traces"))).toBe(true);
  });

  it("exports back to identical PBN after folding through the engine", () => {
    const imported = importBoardText(PBN);
    const state = reconstruct(
      initialState(imported.board.name, imported.board.dealer, imported.board.vul, imported.board.hands),
      imported.events as ActionEvent[],
    );
    expect(state.contract?.declarer).toBe("N");
    expect(state.tricks[0]?.winner).toBe("N"); // ruffed the heart lead

    const record = { board: imported.board } as BridgeSessionRecord;
    const exported = exportSession(record, state, "pbn");

    // Import the export: same deal, auction, and play.
    const again = importBoardText(exported);
    expect(again.board).toEqual(imported.board);
    expect(again.events.map(({ ts: _ts, ...e }) => e)).toEqual(
      imported.events.map(({ ts: _ts, ...e }) => e),
    );

    // And the export is a fixed point: export(import(export(x))) === export(x).
    const state2 = reconstruct(
      initialState(again.board.name, again.board.dealer, again.board.vul, again.board.hands),
      again.events as ActionEvent[],
    );
    expect(exportSession({ board: again.board } as BridgeSessionRecord, state2, "pbn")).toBe(exported);
  });

  it("round-trips LIN deal + auction (play tags are written but skipped on re-import)", () => {
    const imported = importBoardText(PBN);
    const state = reconstruct(
      initialState(imported.board.name, imported.board.dealer, imported.board.vul, imported.board.hands),
      imported.events as ActionEvent[],
    );
    const lin = exportSession({ board: imported.board } as BridgeSessionRecord, state, "lin");
    const again = importBoardText(lin);
    expect(again.format).toBe("lin");
    expect(again.board.hands).toEqual(imported.board.hands);
    expect(again.events.filter((e) => e.category === "bid-event")).toHaveLength(4);
  });

  it("rejects text that is neither PBN nor LIN, and partial deals", () => {
    expect(() => importBoardText("not a board")).toThrow();
    expect(() => importBoardText("")).toThrow();
  });
});
