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
  const [sources, jobs] = await Promise.all([store.listSources(), store.listJobsForKb(kbId)]);
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
                  <details className="mt-1" open={job.status === "failed"}>
                    <summary className="text-xs text-[color:var(--color-draft)]">
                      {job.failures.length} section failure(s) — hand-author from the source
                    </summary>
                    <ul className="mt-1 list-inside list-disc text-xs text-neutral-600">
                      {job.failures.map((f, i) => (
                        <li key={i}>
                          <span className="font-medium">{f.anchor}:</span> {f.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
