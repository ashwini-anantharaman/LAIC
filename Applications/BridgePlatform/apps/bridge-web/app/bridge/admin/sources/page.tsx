import Link from "next/link";
import {
  extractPrototypeRegistry,
  registerSource,
  runLlmExtraction,
  uploadSourceDocument,
} from "@/app/bridge/admin/actions";
import { extractionAvailable } from "@/lib/extraction";
import { knowledgeStore } from "@/lib/knowledge";

export default async function SourcesPage() {
  const store = knowledgeStore();
  const sources = await store.listSources();
  const jobs = (await store.listJobs()).slice().reverse();
  const llmReady = extractionAvailable();
  const docs = new Map(
    (await Promise.all(sources.map(async (s) => [s.sourceId, await store.getSourceDocument(s.sourceId)] as const)))
      .filter(([, d]) => d)
      .map(([id, d]) => [id, d!]),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge sources</h1>
        <p className="text-sm text-neutral-500">
          Register a book, upload it, run extraction, edit the items, generate a
          package — and you have a player that plays by the book.
        </p>
      </header>
      <ul className="space-y-2">
        {sources.map((s) => {
          const doc = docs.get(s.sourceId);
          return (
            <li key={s.sourceId} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{s.title}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {s.sourceType} · {s.rightsStatus} · {s.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {s.sourceId}
                {s.locator ? ` — ${s.locator}` : ""}
                {doc && (
                  <>
                    {" · "}
                    <Link href={`/bridge/admin/sources/${s.sourceId}`} className="text-emerald-700 hover:underline">
                      document uploaded ({doc.fileName}, {Math.round(doc.charCount / 1000)}k chars)
                    </Link>
                  </>
                )}
              </p>
              {s.notes && <p className="mt-1 text-sm text-neutral-600">{s.notes}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={uploadSourceDocument} className="flex items-center gap-2">
                  <input type="hidden" name="sourceId" value={s.sourceId} />
                  <input
                    type="file"
                    name="file"
                    accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                    required
                    className="text-xs"
                  />
                  <button className="rounded border border-neutral-400 px-2 py-1 text-xs font-medium hover:bg-neutral-50">
                    {doc ? "Replace document" : "Upload document"}
                  </button>
                </form>
                {doc && (
                  <form action={runLlmExtraction} className="flex items-center gap-2">
                    <input type="hidden" name="sourceId" value={s.sourceId} />
                    <select name="systemFamily" defaultValue={s.systemFamily ?? "custom"} className="rounded border border-neutral-300 px-1 py-0.5 text-xs">
                      {["natural", "SAYC", "2_over_1", "custom"].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <button
                      disabled={!llmReady}
                      title={llmReady ? undefined : "Set ANTHROPIC_API_KEY in .env.local to enable"}
                      className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Extract items (LLM)
                    </button>
                    {!llmReady && (
                      <span className="text-xs text-neutral-400">needs ANTHROPIC_API_KEY</span>
                    )}
                  </form>
                )}
                {s.sourceId === "src_prototype_artifacts" && (
                  <form action={extractPrototypeRegistry}>
                    <button className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-900">
                      Extract candidates (deterministic registry parser)
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {jobs.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Ingestion jobs</h2>
          {jobs.map((j) => (
            <p key={j.jobId} className="rounded border border-neutral-200 px-3 py-2 text-xs">
              <span className="font-mono">{j.jobId}</span> · {j.extractor} · {j.sourceId} ·{" "}
              <span className={j.status === "completed" ? "text-emerald-700" : "text-red-700"}>{j.status}</span>{" "}
              · parsed {j.stats.parsedEntries}, created {j.stats.candidatesCreated}, skipped {j.stats.skipped}
              {j.errors.length > 0 && <span className="text-red-700"> — {j.errors[0]}</span>}
            </p>
          ))}
        </section>
      )}

      <form action={registerSource} className="space-y-2 rounded-lg border border-neutral-200 p-4">
        <h2 className="font-medium">Register a source</h2>
        <div className="grid grid-cols-2 gap-2">
          <input name="slug" placeholder="id slug (src_<slug>)" required className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          <input name="title" placeholder="Title" required className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          <select name="sourceType" className="rounded border border-neutral-300 px-2 py-1 text-sm">
            {["standard_doc", "book", "expert_notes", "website", "conversation", "code", "manual_entry"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select name="rightsStatus" className="rounded border border-neutral-300 px-2 py-1 text-sm">
            {["owned", "licensed", "public_reference", "fair_use_reference", "unknown"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input name="systemFamily" placeholder="system family (optional)" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
          <input name="locator" placeholder="URL / ISBN / path (optional)" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
        </div>
        <textarea name="notes" placeholder="Notes" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
          Register
        </button>
      </form>
    </div>
  );
}
