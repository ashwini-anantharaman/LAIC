import { registerSource } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";

export default async function SourcesPage() {
  const sources = await knowledgeStore().listSources();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge sources</h1>
      <ul className="space-y-2">
        {sources.map((s) => (
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
            </p>
            {s.notes && <p className="mt-1 text-sm text-neutral-600">{s.notes}</p>}
          </li>
        ))}
      </ul>

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
