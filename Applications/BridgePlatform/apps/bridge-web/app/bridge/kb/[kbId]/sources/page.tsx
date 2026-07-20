import { chunkDocument, type KbSourcePassage } from "@bridge/kb";
import Link from "next/link";
import { UploadForm } from "@/components/kb/UploadForm";
import { pendingSections } from "@/lib/documents";
import { extractionAvailable } from "@/lib/extraction";
import { kbStore } from "@/lib/kb";
import {
  registerSourceAction,
  runExtractionAction,
  uploadDocumentAction,
} from "../../actions";

/** Sources tab (spec §6): register → upload → extract, with job reports and
 *  the failed-section list fellows hand-author from. */
export default async function SourcesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{
    extracted?: string;
    remaining?: string;
    uploadError?: string;
    uploaded?: string;
    sections?: string;
  }>;
}>) {
  const { kbId } = await params;
  const { extracted, remaining: remainingParam, uploadError, uploaded, sections } =
    await searchParams;
  const store = kbStore();
  const [sources, jobs, items] = await Promise.all([
    store.listSources(),
    store.listJobsForKb(kbId),
    store.listItemsForKb(kbId),
  ]);
  const documents = new Map(
    await Promise.all(
      sources.map(async (s) => [s.sourceId, await store.getDocument(s.sourceId)] as const),
    ),
  );
  const pending = new Map(
    await Promise.all(
      sources.map(async (s) => [s.sourceId, await pendingSections(kbId, s.sourceId)] as const),
    ),
  );
  const llmReady = extractionAvailable();
  const base = `/bridge/kb/${kbId}`;

  // ---- the hand-authoring queue: failed sections across all runs ----------
  // A failure's anchor is "{section} → {what the extractor was attempting}".
  // Sections re-chunk deterministically from the document, so the prefix maps
  // back to real passages. Dedupe by source+anchor (re-runs fail the same
  // section again) and mark a failure done once an item cites its passages.
  const failedSections = new Map<string, { sourceId: string; anchor: string; reason: string }>();
  for (const job of jobs)
    for (const f of job.failures) {
      const dedupe = `${job.sourceId}::${f.anchor}`;
      if (!failedSections.has(dedupe))
        failedSections.set(dedupe, { sourceId: job.sourceId, anchor: f.anchor, reason: f.reason });
    }
  const failureSourceIds = [...new Set([...failedSections.values()].map((f) => f.sourceId))];
  const passagesByOrdinal = new Map(
    failureSourceIds.map((id) => {
      const doc = documents.get(id);
      return [
        id,
        {
          sections: doc ? chunkDocument(doc.text).sections : [],
          byOrdinal: new Map<number, KbSourcePassage>(),
        },
      ] as const;
    }),
  );
  for (const id of failureSourceIds) {
    const passages = await store.listPassages(id);
    const entry = passagesByOrdinal.get(id)!;
    for (const p of passages) entry.byOrdinal.set(p.ordinal, p);
  }
  const itemByPassage = new Map<string, { itemId: string; title: string }>();
  for (const item of items)
    for (const ref of item.sourceReferences)
      if (ref.passageId && !itemByPassage.has(ref.passageId))
        itemByPassage.set(ref.passageId, { itemId: item.itemId, title: item.title });
  const queue = [...failedSections.values()].map((f) => {
    const [sectionAnchor = f.anchor, ...rest] = f.anchor.split(" → ");
    const attempted = rest.join(" → ");
    const src = passagesByOrdinal.get(f.sourceId);
    const section = src?.sections.find((s) => s.anchor === sectionAnchor);
    const sectionPassages = (section?.passageOrdinals ?? [])
      .map((o) => src!.byOrdinal.get(o))
      .filter((p): p is KbSourcePassage => Boolean(p));
    const writtenUp = sectionPassages.map((p) => itemByPassage.get(p.passageId)).find(Boolean);
    return {
      ...f,
      sectionAnchor,
      attempted,
      sourceTitle: sources.find((s) => s.sourceId === f.sourceId)?.title ?? f.sourceId,
      preview: sectionPassages[0]?.text.slice(0, 240) ?? "",
      hasText: sectionPassages.length > 0,
      writtenUp,
    };
  });
  const open = queue.filter((q) => !q.writtenUp);
  const done = queue.filter((q) => q.writtenUp);

  return (
    <div className="space-y-8">
      {uploadError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
          {uploadError}
        </p>
      )}
      {uploaded && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Document uploaded — {uploaded} passages across {sections} sections. Extraction is ready
          below.
        </p>
      )}
      {extracted !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {Number(remainingParam ?? 0) > 0
            ? `Batch done — ${extracted} item(s) created; ${remainingParam} section(s) to go. Click the button again to continue.`
            : `Extraction finished — ${extracted} item(s) created in this last batch; everything is in the Items tab.`}
        </p>
      )}
      {!llmReady && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          ANTHROPIC_API_KEY isn&apos;t configured on this server — register and upload work;
          extraction is unavailable until the key is set.
        </p>
      )}

      {queue.length > 0 && (
        <section>
          <h3 className="font-medium">
            Sections that need a person{" "}
            <span className="text-sm font-normal text-neutral-500">
              — {open.length} to write up{done.length > 0 && `, ${done.length} done`}
            </span>
          </h3>
          <p className="mb-3 mt-0.5 max-w-2xl text-sm text-neutral-500">
            The automatic reader couldn&apos;t turn these sections of the document into rules.
            Each card shows the actual passage — click through and it opens next to the item
            editor, with the citation attached for you.
          </p>
          <ul className="space-y-2">
            {[...open, ...done].map((q) => (
              <li
                key={`${q.sourceId}::${q.anchor}`}
                className={`rounded-lg border p-4 ${
                  q.writtenUp
                    ? "border-neutral-200 bg-neutral-50/60"
                    : "border-amber-200 bg-[var(--card)]"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[15px] font-medium">
                      {q.attempted || q.sectionAnchor}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {q.sectionAnchor} · {q.sourceTitle}
                    </p>
                    {!q.writtenUp && q.preview && (
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                        {q.preview}
                        {q.preview.length >= 240 && "…"}
                      </p>
                    )}
                  </div>
                  {q.writtenUp ? (
                    <p className="flex-none text-sm text-[color:var(--color-approved)]">
                      ✓ written up —{" "}
                      <Link
                        href={`${base}/items/${q.writtenUp.itemId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {q.writtenUp.title}
                      </Link>
                    </p>
                  ) : q.hasText ? (
                    <Link
                      href={`${base}/items/new?sourceId=${encodeURIComponent(q.sourceId)}&section=${encodeURIComponent(q.sectionAnchor)}&title=${encodeURIComponent(q.attempted || q.sectionAnchor)}`}
                      className="flex-none rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Write this up →
                    </Link>
                  ) : (
                    <p className="flex-none text-xs text-neutral-400">
                      passage text unavailable (document re-uploaded?)
                    </p>
                  )}
                </div>
                {!q.writtenUp && (
                  <p className="mt-2 text-[11px] text-neutral-400" title={q.reason}>
                    why it failed: {q.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        {sources
          .filter((s) => s.sourceId !== "src_claude")
          .map((source) => {
            const doc = documents.get(source.sourceId);
            return (
              <div key={source.sourceId} className="rounded-lg border border-neutral-200 bg-[var(--card)] p-5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h3 className="font-serif text-lg font-medium">{source.title}</h3>
                  <span className="text-xs text-neutral-400">{source.sourceId}</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
                    {source.sourceType.replaceAll("_", " ")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {source.rightsStatus.replaceAll("_", " ")}
                  </span>
                </div>
                {doc ? (
                  <p className="mt-1 text-sm text-neutral-600">
                    {doc.fileName} · {doc.charCount.toLocaleString()} chars · uploaded{" "}
                    {doc.uploadedAt.slice(0, 10)}
                    {" · "}
                    <Link
                      href={`/bridge/kb/${kbId}/sources/${source.sourceId}`}
                      className="text-emerald-700 underline-offset-2 hover:underline"
                    >
                      read the document →
                    </Link>
                  </p>
                ) : (
                  <p className="mt-1 text-sm italic text-neutral-500">No document yet.</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <UploadForm
                    kbId={kbId}
                    sourceId={source.sourceId}
                    replace={Boolean(doc)}
                    action={uploadDocumentAction}
                  />
                  {doc &&
                    llmReady &&
                    (() => {
                      const p = pending.get(source.sourceId);
                      const left = p?.remaining.length ?? 0;
                      return left > 0 ? (
                        <form action={runExtractionAction}>
                          <input type="hidden" name="kbId" value={kbId} />
                          <input type="hidden" name="sourceId" value={source.sourceId} />
                          <button
                            type="submit"
                            className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800"
                          >
                            Extract next {Math.min(3, left)} section{Math.min(3, left) > 1 ? "s" : ""} ({left} of {p!.total} remaining)
                          </button>
                          <p className="mt-1 text-[11px] text-neutral-400">
                            Each batch takes a minute or two. Completed sections are skipped, so
                            keep clicking until none remain.
                          </p>
                        </form>
                      ) : (
                        <p className="text-sm text-[color:var(--color-approved)]">
                          ✓ all {p?.total ?? 0} sections extracted
                        </p>
                      );
                    })()}
                </div>
              </div>
            );
          })}
      </section>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h3 className="font-medium">Register a source</h3>
        <form action={registerSourceAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="kbId" value={kbId} />
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Slug (→ src_&lt;slug&gt;)</span>
            <input name="slug" required placeholder="sayc_booklet" className="w-full rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Title</span>
            <input name="title" required placeholder="ACBL SAYC System Booklet" className="w-full rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Type</span>
            <select name="sourceType" className="w-full rounded border border-neutral-300 px-2 py-1.5">
              <option value="official_system_document">official system document</option>
              <option value="book">book</option>
              <option value="article">article</option>
              <option value="expert">expert</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Rights</span>
            <select name="rightsStatus" className="w-full rounded border border-neutral-300 px-2 py-1.5">
              <option value="licensed">licensed</option>
              <option value="public">public</option>
              <option value="owned">owned</option>
              <option value="fair_use_excerpt">fair-use excerpt</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Locator (URL / ISBN, optional)</span>
            <input name="locator" className="w-full rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <p className="sm:col-span-2">
            <button type="submit" className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Register
            </button>
          </p>
        </form>
      </section>

      {jobs.length > 0 && (
        <section>
          <h3 className="mb-2 font-medium">Extraction jobs</h3>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.jobId} className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-xs text-neutral-400">{job.jobId}</span>
                  <span
                    className={
                      job.status === "completed"
                        ? "text-[color:var(--color-approved)]"
                        : job.status === "failed"
                          ? "text-[color:var(--color-invalid)]"
                          : "text-neutral-500"
                    }
                  >
                    {job.status}
                  </span>
                  <span className="text-neutral-500">
                    {job.createdItemIds.length} item(s) · {job.passageOrdinals.length} passage(s)
                  </span>
                  <span className="ml-auto text-xs text-neutral-400">{job.createdAt.slice(0, 16).replace("T", " ")}</span>
                </div>
                {job.createdItemIds.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {job.createdItemIds.map((id) => (
                      <Link key={id} href={`${base}/items/${id}`} className="text-xs text-emerald-800 hover:underline">
                        {id}
                      </Link>
                    ))}
                  </p>
                )}
                {job.failures.length > 0 && (
                  <p className="mt-1 text-xs text-[color:var(--color-draft)]">
                    {job.failures.length} section{job.failures.length === 1 ? "" : "s"} needed a
                    person — see &ldquo;Sections that need a person&rdquo; at the top.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
