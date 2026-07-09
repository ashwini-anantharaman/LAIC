import {
  callLabel,
  contractLabel,
  isLogicEvent,
  rankLabel,
  type Card,
} from "@bridge/events";
import { SessionAccessError } from "@bridge/sessions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { autoplaySession, stepSession, undoSession } from "@/app/bridge/play/actions";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

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

export default async function SessionPage({
  params,
}: Readonly<{ params: Promise<{ sessionId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;

  let view, events;
  try {
    view = await sessionService().getSession(sessionId, context);
    events = await sessionService().getEvents(sessionId, context);
  } catch (e) {
    if (e instanceof SessionAccessError) notFound();
    throw e;
  }
  const { record, state } = view;
  const bidLogic = events.filter(
    (e) => e.category === "bid-logic-event",
  ) as Extract<(typeof events)[number], { category: "bid-logic-event" }>[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.board.name}</h1>
        <p className="text-xs text-neutral-500">
          <span className="font-mono">{record.bridgeSessionId}</span> · {record.status} ·{" "}
          {record.packageRef.packageId}@{record.packageRef.version} · config hash{" "}
          <span className="font-mono">{record.resolvedValueHash}</span> · {events.length} events
        </p>
      </header>

      <div className="flex gap-2">
        <form action={stepSession}>
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900" disabled={state.phase === "complete"}>
            Step AI
          </button>
        </form>
        <form action={autoplaySession}>
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800" disabled={state.phase === "complete"}>
            Play to end
          </button>
        </form>
        <form action={undoSession}>
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Undo
          </button>
        </form>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Position ({state.phase})
          </h2>
          <ul className="space-y-1 font-mono text-sm">
            {(["N", "E", "S", "W"] as const).map((seat) => (
              <li key={seat}>
                {seat}: {handString(state.hands[seat])}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            {state.contract
              ? `${contractLabel(state.contract)} — tricks NS ${state.trickCount.NS} / EW ${state.trickCount.EW}`
              : state.phase === "complete"
                ? "Passed out"
                : `Turn: ${state.turn}`}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Auction
          </h2>
          {bidLogic.length === 0 && <p className="text-sm text-neutral-500">No calls yet.</p>}
          <ul className="space-y-1 text-sm">
            {bidLogic.map((e) => (
              <li key={e.seq}>
                <span className="font-mono">{e.seat}: {callLabel(e.chosen)}</span>{" "}
                <span className="text-neutral-500">← {e.reason}</span>
                {e.fallback && <span className="ml-1 rounded bg-red-50 px-1 text-xs text-red-700">fallback</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Event log ({events.length} events, seq-ordered)
        </h2>
        <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
          {events.map((e) => (
            <li key={e.seq}>
              <details>
                <summary className="cursor-pointer font-mono">
                  #{e.seq} {e.category}
                  {"seat" in e ? ` · ${e.seat}` : ""}
                  {isLogicEvent(e) ? ` · ${e.reason}` : ""}
                  {"fallback" in e && e.fallback ? " · FALLBACK" : ""}
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2">
                  {JSON.stringify(e, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/bridge/play" className="text-sm text-emerald-700 hover:underline">
        ← All sessions
      </Link>
    </div>
  );
}
