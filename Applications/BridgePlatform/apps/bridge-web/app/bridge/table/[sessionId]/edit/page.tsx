import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { redealEditedAction } from "../../actions";

/** Edit the live board's deal mid-play: redistribute the unplayed cards
 *  (played ones are locked to the seat that played them), then continue the
 *  game on the edited deal — same seats, same auction and tricks so far.
 *  The board you came from keeps its history. */
export default async function EditDealPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { error } = await searchParams;

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    notFound();
  }
  const { record, state } = view;
  // Remaining cards are freely editable; played cards are pinned where they
  // were played (continuing the game depends on that).
  const played = state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card })));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-sm">
          <Link
            href={`/bridge/table/${sessionId}`}
            className="text-neutral-500 underline-offset-4 hover:underline"
          >
            ← {record.board.name}
          </Link>
        </p>
        <h1 className="mt-1 text-3xl font-medium">Edit the deal</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Move any unplayed cards, then apply — the game continues right where it is, on the
          edited deal, with the same seats. Greyed cards were already played and can&apos;t
          move. Past calls and plays keep their original reasoning. The board you came from is
          kept as it was.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={redealEditedAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <DealEditor
          initialName={
            record.board.name.endsWith("(edited)")
              ? record.board.name
              : `${record.board.name} (edited)`
          }
          initialDealer={record.board.dealer}
          initialVul={record.board.vul}
          initialHands={state.hands}
          locked={played}
          submitLabel="Apply and continue"
          footer={
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input type="checkbox" name="restart" />
                restart the board instead (fresh auction on the edited deal)
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input type="checkbox" name="saveToLibrary" />
                also save the edited board to the library
              </label>
            </div>
          }
        />
      </form>
    </div>
  );
}
