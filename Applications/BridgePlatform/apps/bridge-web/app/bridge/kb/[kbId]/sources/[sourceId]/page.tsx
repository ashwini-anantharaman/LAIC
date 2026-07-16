import Link from "next/link";
import { notFound } from "next/navigation";
import { kbStore } from "@/lib/kb";

/** Source reader (2026-07-16): the whole document as its passages, in order.
 *  Citations deep-link here (?p=<passageId>#<passageId>) — the cited passage
 *  is highlighted and the browser lands on it, so "show me where the booklet
 *  says that" is one click from any item. */
export default async function SourceReaderPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string; sourceId: string }>;
  searchParams: Promise<{ p?: string }>;
}>) {
  const { kbId, sourceId } = await params;
  const { p: target } = await searchParams;
  const store = kbStore();
  const [source, document, passages] = await Promise.all([
    store.getSource(sourceId),
    store.getDocument(sourceId),
    store.listPassages(sourceId),
  ]);
  if (!source) notFound();

  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-xs text-neutral-400">
        <Link href={`/bridge/kb/${kbId}/sources`} className="hover:underline">
          Sources
        </Link>{" "}
        / {source.sourceId}
      </p>
      <header className="mb-6">
        <h2 className="text-2xl font-medium">{source.title}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {source.sourceType.replace(/_/g, " ")} · {source.rightsStatus.replace(/_/g, " ")}
          {document && (
            <>
              {" · "}
              {document.fileName} · {passages.length} passages
            </>
          )}
        </p>
      </header>

      {passages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No document uploaded for this source yet.
        </p>
      ) : (
        <ol className="space-y-1">
          {passages.map((passage) => {
            const cited = passage.passageId === target;
            return (
              <li
                key={passage.passageId}
                id={passage.passageId}
                className={
                  cited
                    ? "-mx-3 scroll-mt-24 rounded-lg border border-emerald-400 bg-emerald-50/60 px-3 py-2"
                    : "scroll-mt-24 px-0 py-1.5"
                }
              >
                <p className="text-[10px] uppercase tracking-wide text-neutral-400">
                  ¶{passage.ordinal}
                  {cited && (
                    <span className="ml-2 rounded bg-emerald-700 px-1.5 py-0.5 text-[9px] font-medium tracking-normal text-white">
                      cited passage
                    </span>
                  )}
                </p>
                <p className="prose-knowledge mt-0.5 text-[15px] leading-relaxed text-neutral-800">
                  {passage.text}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
