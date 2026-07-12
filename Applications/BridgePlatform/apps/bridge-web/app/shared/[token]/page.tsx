import { rankLabel, type Card } from "@bridge/events";
import Link from "next/link";
import { sessionService } from "@/lib/sessions";

// Read-only shared board view (§15.1): the token IS the capability — anyone
// holding the link can see the board (and nothing else about its org).

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const handString = (hand: Card[]): string =>
  (["S", "H", "D", "C"] as const)
    .map(
      (s) =>
        GLYPH[s] +
        (hand
          .filter((c) => c.suit === s)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank))
          .join("") || "—"),
    )
    .join(" ");

export default async function SharedBoardPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  const board = await sessionService().getSharedBoard(token);

  if (!board) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Shared board</h1>
        <p className="text-sm text-neutral-600">
          This share link doesn’t exist (or was mistyped). Ask the person who
          shared it for a fresh link.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{board.name}</h1>
      <p className="text-sm text-neutral-600">
        Shared board — dealer {board.board.dealer}, vulnerability {board.board.vul}.
      </p>
      <div className="rounded-lg border border-neutral-200 p-4 font-mono text-sm">
        {(["N", "E", "S", "W"] as const).map((seat) => (
          <p key={seat}>
            {seat}: {handString(board.board.hands[seat])}
          </p>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Want to play it?{" "}
        <Link href="/bridge/home" className="text-emerald-700 hover:underline">
          Sign in to the Bridge platform
        </Link>{" "}
        and import or save it to your own library.
      </p>
    </div>
  );
}
