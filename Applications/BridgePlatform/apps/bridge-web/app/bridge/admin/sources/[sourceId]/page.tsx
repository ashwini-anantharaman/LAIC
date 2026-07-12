import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeStore } from "@/lib/knowledge";

export default async function SourceDocumentPage({
  params,
}: Readonly<{ params: Promise<{ sourceId: string }> }>) {
  const { sourceId } = await params;
  const store = knowledgeStore();
  const source = await store.getSource(sourceId);
  if (!source) notFound();
  const doc = await store.getSourceDocument(sourceId);
  const passages = await store.listPassages(sourceId);
  const items = (await store.listItems()).filter((it) => it.sourceIds.includes(sourceId));
  const citedPassageIds = new Set(
    items.flatMap((it) => it.citations.map((c) => c.passageId).filter(Boolean)),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{source.title}</h1>
        <p className="text-xs text-neutral-500">
          {sourceId}
          {doc
            ? ` · ${doc.fileName} · ${Math.round(doc.charCount / 1000)}k chars · ${passages.length} passages · uploaded ${doc.uploadedAt.slice(0, 10)}`
            : " · no document uploaded"}
          {" · "}
          {items.length} knowledge item{items.length === 1 ? "" : "s"} cite this source
        </p>
        <Link href="/bridge/admin/sources" className="text-sm text-emerald-700 hover:underline">
          ← All sources
        </Link>
      </header>

      {!doc && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Upload a document on the sources page to see its passages here.
        </p>
      )}

      <ul className="space-y-2">
        {passages.map((p) => (
          <li
            key={p.passageId}
            id={p.passageId.split("#")[1]}
            className={`rounded-lg border p-4 ${
              citedPassageIds.has(p.passageId) ? "border-emerald-300 bg-emerald-50/40" : "border-neutral-200"
            }`}
          >
            <p className="mb-1 text-xs text-neutral-500">
              <span className="font-mono">{p.passageId}</span> · {p.anchor}
              {citedPassageIds.has(p.passageId) && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">cited</span>
              )}
            </p>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
