// Source-fidelity audit (KB tools): a batch LLM pass that reads each item
// against the SOURCE PASSAGES it cites and files discrepancies as suggestions
// — content_fix (the rules could be authored better in the current language)
// vs inexpressible (the language lacks the concept, so it's a feature request)
// vs faithful. Findings adjudicated in the existing Suggestions queue.

import Link from "next/link";
import { kbStore } from "@/lib/kb";
import {
  auditAvailable,
  auditCandidates,
  citedPassagesForItem,
  classificationOfSuggestion,
  hasOpenAuditSuggestion,
  SOURCE_AUDIT_PREFIX,
} from "@/lib/sourceAudit";
import { runSourceAuditAction } from "./actions";

type Search = { audited?: string; flagged?: string };

export default async function SourceAuditPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<Search>;
}>) {
  const { kbId } = await params;
  const { audited, flagged } = await searchParams;
  const base = `/bridge/kb/${kbId}`;
  const store = kbStore();

  const [items, suggestions, sources] = await Promise.all([
    store.listItemsForKb(kbId),
    store.listSuggestionsForKb(kbId),
    store.listSources(),
  ]);
  const sourceTitleById = new Map(sources.map((s) => [s.sourceId, s.title]));
  const titleOf = new Map(items.map((i) => [i.itemId, i.title]));

  const citedSourceIds = new Set<string>();
  for (const item of items)
    for (const ref of item.sourceReferences)
      if (ref.sourceId !== "src_claude") citedSourceIds.add(ref.sourceId);
  const passagesBySource = new Map(
    await Promise.all(
      [...citedSourceIds].map(async (id) => [id, await store.listPassages(id)] as const),
    ),
  );

  // Provenance split: an item has provenance when it cites at least one
  // resolvable external passage (src_claude and bare anchors don't count).
  const withProvenance = items.filter(
    (i) => citedPassagesForItem(i, passagesBySource, sourceTitleById).length > 0,
  );
  const alreadyFlagged = withProvenance.filter((i) =>
    hasOpenAuditSuggestion(i.itemId, suggestions),
  );
  const remaining = auditCandidates({
    items,
    suggestions,
    passagesBySource,
    sourceTitleById,
  });

  // Open [source audit] suggestions, grouped by classification for the summary.
  const openAudit = suggestions.filter(
    (s) => s.status === "open" && s.text.startsWith(SOURCE_AUDIT_PREFIX),
  );
  const contentFixes = openAudit.filter(
    (s) => classificationOfSuggestion(s.text) === "content_fix",
  );
  const inexpressibles = openAudit.filter(
    (s) => classificationOfSuggestion(s.text) === "inexpressible",
  );

  const llmReady = auditAvailable();

  const stat = (value: string | number, label: string) => (
    <div className="min-w-24">
      <p className="text-2xl font-medium leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );

  const group = (
    label: string,
    rows: typeof openAudit,
    note: React.ReactNode,
  ) => (
    <section>
      <h2 className="mb-1 text-sm font-medium">
        {label} <span className="text-neutral-400">({rows.length})</span>
      </h2>
      <p className="mb-2 max-w-2xl text-xs text-neutral-500">{note}</p>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
          None open.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li
              key={s.suggestionId}
              className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3"
            >
              <p className="text-sm">{s.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span>{s.createdAt.slice(0, 16).replace("T", " ")}</span>
                {s.itemId && (
                  <Link
                    href={`${base}/items/${s.itemId}`}
                    className="text-emerald-800 hover:underline"
                  >
                    {titleOf.get(s.itemId) ?? s.itemId}
                  </Link>
                )}
                <Link
                  href={`${base}/suggestions`}
                  className="ml-auto text-neutral-400 hover:underline"
                >
                  adjudicate in Suggestions →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Source-fidelity audit</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          For every item that cites source passages, an LLM checks whether the compiled rules
          faithfully capture what the source actually says. Discrepancies are filed as
          suggestions for fellows to adjudicate — classified as{" "}
          <b>content&#8209;fix</b> (the rules could be authored better in today&apos;s language)
          or <b>inexpressible</b> (the language lacks the concept — a feature request, not an
          authoring error).
        </p>
      </div>

      {audited !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {Number(audited) === 0
            ? "Nothing left to audit — every item with provenance already has a finding or was found faithful."
            : `Audited ${audited} item(s) — flagged ${flagged ?? 0}. ${
                remaining.length > 0
                  ? `${remaining.length} still to go; click again to continue.`
                  : "That was the last batch."
              }`}
        </p>
      )}

      {!llmReady && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          ANTHROPIC_API_KEY isn&apos;t configured on this server — the audit is unavailable until
          the key is set. Existing findings below are still adjudicable.
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4">
        {stat(`${withProvenance.length}/${items.length}`, "items with provenance")}
        {stat(items.length - withProvenance.length, "no provenance (skipped)")}
        {stat(alreadyFlagged.length, "already flagged")}
        {stat(remaining.length, "still to audit")}
      </div>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="text-sm font-medium">Run the audit</h2>
        <p className="mb-3 mt-0.5 max-w-2xl text-sm text-neutral-500">
          Each run audits the next batch of items that have provenance and no open finding yet,
          in stable order — so clicking repeatedly walks the whole knowledge base.
        </p>
        <form action={runSourceAuditAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="kbId" value={kbId} />
          <label className="text-xs">
            <span className="mb-0.5 block text-neutral-500">Items this run (max 15)</span>
            <input
              type="number"
              name="n"
              min={1}
              max={15}
              defaultValue={8}
              className="w-24 rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!llmReady || remaining.length === 0}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Audit next {Math.min(8, remaining.length) || 8} items
          </button>
          {remaining.length === 0 && llmReady && (
            <span className="text-xs text-neutral-500">
              Nothing left — every item with provenance is audited or flagged.
            </span>
          )}
        </form>
      </section>

      <div className="space-y-6">
        {group(
          "Content-fix findings",
          contentFixes,
          "The source's concept is expressible in today's rule language — the item just captured it poorly (a shallow proxy, wrong threshold, or missing condition). A fellow can re-author it.",
        )}
        {group(
          "Inexpressible findings",
          inexpressibles,
          "The source relies on a concept the rule language cannot represent (e.g. “the agreed fit suit”, “combined keycards”). These are language FEATURE REQUESTS, not authoring errors — re-authoring in the current language can't fix them.",
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Findings land in the{" "}
        <Link href={`${base}/suggestions`} className="underline underline-offset-4">
          Suggestions
        </Link>{" "}
        queue, prefixed <code>{SOURCE_AUDIT_PREFIX}</code>, where fellows resolve them. The audit
        never edits knowledge itself.
      </p>
    </div>
  );
}
