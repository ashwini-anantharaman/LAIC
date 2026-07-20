import { chunkDocument } from "@bridge/kb";
import Link from "next/link";
import { ItemEditor } from "@/components/kb/ItemEditor";
import { kbStore } from "@/lib/kb";
import { createItemAction } from "../../../actions";

/** Hand-author a knowledge item. Arriving from a failed extraction section
 *  (?sourceId=…&section=…), the source passage sits alongside the editor and
 *  the citation is attached automatically; otherwise the item cites the
 *  Claude source until a fellow attaches real passages. */
export default async function NewItemPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ sourceId?: string; section?: string; title?: string }>;
}>) {
  const { kbId } = await params;
  const { sourceId, section, title } = await searchParams;

  // The write-up-from-a-passage flow: re-chunk the document (deterministic)
  // and pull the failed section's passages.
  const store = kbStore();
  const source = sourceId ? await store.getSource(sourceId) : null;
  const doc = source ? await store.getDocument(source.sourceId) : null;
  const chunk = doc && section ? chunkDocument(doc.text).sections.find((s) => s.anchor === section) : null;
  const byOrdinal = source
    ? new Map((await store.listPassages(source.sourceId)).map((p) => [p.ordinal, p]))
    : new Map();
  const passages = (chunk?.passageOrdinals ?? [])
    .map((o) => byOrdinal.get(o))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const citation = passages[0]
    ? { sourceId: source!.sourceId, passageId: passages[0].passageId, anchor: section! }
    : undefined;

  const editor = (
    <ItemEditor
      kbId={kbId}
      item={null}
      action={createItemAction}
      initialTitle={citation ? (title ?? section) : undefined}
      citation={citation}
    />
  );

  if (!citation) {
    return (
      <div className="max-w-3xl">
        <h2 className="mb-1 text-2xl font-medium">New knowledge item</h2>
        <p className="mb-6 text-sm text-neutral-600">
          Hand-authored items cite the Claude source by default — attach real
          passages by editing after upload, or prefer extraction for anything
          the system document covers.
        </p>
        {editor}
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-2xl font-medium">Write up “{title ?? section}”</h2>
      <p className="mb-6 max-w-2xl text-sm text-neutral-600">
        The automatic reader couldn&apos;t turn this section into rules, so it&apos;s yours.
        Read the passage on the right, describe the agreement in plain words, then translate
        it into rules — the citation back to this exact passage is attached for you.
      </p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>{editor}</div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="max-h-[80vh] overflow-y-auto rounded-lg border border-emerald-200 bg-[var(--card)] p-5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              The source passage
            </p>
            <p className="mb-3 text-xs text-neutral-500">
              {source!.title} ·{" "}
              <Link
                href={`/bridge/kb/${kbId}/sources/${source!.sourceId}?p=${passages[0]!.passageId}#${passages[0]!.passageId}`}
                className="text-emerald-700 underline-offset-2 hover:underline"
              >
                open in the full document →
              </Link>
            </p>
            <h3 className="font-serif text-lg font-medium">{section}</h3>
            {passages.map((p) => (
              <p
                key={p.passageId}
                className="prose-knowledge mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800"
              >
                {p.text}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
