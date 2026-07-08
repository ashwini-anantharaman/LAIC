import type { GameContext, ParseResult } from "./context";
import { parseLin } from "./lin";

// Thin wrapper: parseLin → normalized GameContext[]. LIN carries no card
// play here, so `play` is left undefined.
export function parseLinToContexts(text: string): ParseResult {
  const res = parseLin(text);
  if (!res.ok) return { ok: false, error: res.error };
  const contexts: GameContext[] = res.boards.map((b) => ({
    name: b.name,
    dealer: b.dealer,
    vul: b.vul,
    players: b.players,
    hands: b.hands,
    auction: b.auction,
    source: "lin",
  }));
  return { ok: true, contexts };
}
