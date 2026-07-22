import Link from "next/link";
import { kbStore } from "@/lib/kb";
import { createSuggestionAction, resolveSuggestionAction } from "../../actions";

/** The suggestion queue (spec decision 22): flags from the table and item
 *  annotations — a work queue, never a gate. */
export default async function SuggestionsPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const store = kbStore();
  const [suggestions, items] = await Promise.all([
    store.listSuggestionsForKb(kbId),
    store.listItemsForKb(kbId),
  ]);
  const titleOf = new Map(items.map((i) => [i.itemId, i.title]));
  const base = `/bridge/kb/${kbId}`;
  const open = suggestions.filter((s) => s.status === "open");
  const resolved = suggestions.filter((s) => s.status === "resolved");

  const row = (s: (typeof suggestions)[number]) => (
    <li key={s.suggestionId} className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3">
      <p className="text-sm">{s.text}</p>
      {s.board && (
        <details className="mt-2 rounded border border-neutral-200 bg-neutral-50/50 px-3 py-2" open={s.status === "open"}>
          <summary className="cursor-pointer text-xs text-neutral-600">
            <span className="font-medium">{s.board.name}</span> · dealer {s.board.dealer} · vul{" "}
            {s.board.vul} — flagged: <span className="font-medium">{s.board.flagged.seat}</span>{" "}
            <span className="font-mono">{s.board.flagged.label}</span>
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center font-mono text-[11px] leading-relaxed">
            <span />
            <span className="whitespace-nowrap"><b className="font-sans text-neutral-400">N </b>{s.board.hands.N}</span>
            <span />
            <span className="whitespace-nowrap text-left"><b className="font-sans text-neutral-400">W </b>{s.board.hands.W}</span>
            <span />
            <span className="whitespace-nowrap text-right"><b className="font-sans text-neutral-400">E </b>{s.board.hands.E}</span>
            <span />
            <span className="whitespace-nowrap"><b className="font-sans text-neutral-400">S </b>{s.board.hands.S}</span>
            <span />
          </div>
          {s.board.calls.length > 0 && (
            <p className="mt-2 text-xs text-neutral-600">
              <span className="text-neutral-400">Auction: </span>
              {s.board.calls.map((c, i) => (
                <span key={i} className="mr-1.5 whitespace-nowrap font-mono">
                  <span className="text-neutral-400">{c.seat}</span> {c.label}
                </span>
              ))}
            </p>
          )}
          {s.board.plays.length > 0 && (
            <p className="mt-1 text-xs text-neutral-600">
              <span className="text-neutral-400">Play: </span>
              {s.board.plays.map((c, i) => (
                <span key={i} className="mr-1.5 whitespace-nowrap font-mono">
                  <span className="text-neutral-400">{c.seat}</span> {c.label}
                </span>
              ))}
            </p>
          )}
          <p className="mt-1 text-xs text-red-700">
            Flagged: {s.board.flagged.seat} chose{" "}
            <span className="font-mono font-medium">{s.board.flagged.label}</span>
            {s.board.flagged.reason && <> — {s.board.flagged.reason}</>}
          </p>
        </details>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>{s.createdBy}</span>
        <span>{s.createdAt.slice(0, 16).replace("T", " ")}</span>
        {s.itemId && (
          <Link href={`${base}/items/${s.itemId}`} className="text-emerald-800 hover:underline">
            {titleOf.get(s.itemId) ?? s.itemId}
          </Link>
        )}
        {s.sessionId && (
          <span>
            <Link href={`/bridge/table/${s.sessionId}`} className="text-emerald-800 hover:underline">
              open the session →
            </Link>
            {s.decisionSeq !== undefined && <> · decision #{s.decisionSeq}</>}
          </span>
        )}
        {s.status === "open" ? (
          <form action={resolveSuggestionAction} className="ml-auto">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="suggestionId" value={s.suggestionId} />
            <button type="submit" className="rounded border border-neutral-300 px-2 py-0.5 hover:border-emerald-400">
              Resolve
            </button>
          </form>
        ) : (
          <span className="ml-auto text-neutral-400">
            resolved by {s.resolvedBy} · {s.resolvedAt?.slice(0, 10)}
          </span>
        )}
      </div>
    </li>
  );

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Open ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Nothing suggested yet. Suggestions arrive from the table (&ldquo;Suggest a
            fix&rdquo; on any decision), from a knowledge item&apos;s Suggest box, and from
            the form below.
          </p>
        ) : (
          <ul className="space-y-2">{open.map(row)}</ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h3 className="text-sm font-medium">Add a suggestion</h3>
        <form action={createSuggestionAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="kbId" value={kbId} />
          <label className="min-w-64 flex-1 text-xs">
            <span className="mb-0.5 block text-neutral-500">Note</span>
            <input name="text" required className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Item (optional)</span>
            <select name="itemId" className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="">—</option>
              {items.map((i) => (
                <option key={i.itemId} value={i.itemId}>
                  {i.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            Suggest
          </button>
        </form>
      </section>

      {resolved.length > 0 && (
        <details>
          <summary className="text-sm text-neutral-500">Resolved ({resolved.length})</summary>
          <ul className="mt-2 space-y-2">{resolved.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
