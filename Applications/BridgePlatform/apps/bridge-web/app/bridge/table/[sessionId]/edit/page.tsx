import { seededDeal } from "@bridge/engine";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { redealEditedAction } from "../../actions";

/** Edit the live board's deal mid-play: change any cards, then deal the
 *  edited board to the same table and continue. The original board keeps
 *  its history — every call so far was made looking at the old hands. */
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

  let record;
  try {
    record = await sessionService().requireSession(sessionId);
  } catch {
    notFound();
  }
  const hands = record.board.hands ?? seededDeal(record.board.seed);

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
          Adjust any cards, then deal the edited board to this table — same seats, fresh
          auction. The board you came from is kept as it was.
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
          initialHands={hands}
          submitLabel="Deal to this table"
          footer={
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" name="saveToLibrary" />
              also save the edited board to the library
            </label>
          }
        />
      </form>
    </div>
  );
}
