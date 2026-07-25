import Link from "next/link";
import { notFound } from "next/navigation";
import { kbStore } from "@/lib/kb";

/** Source reader (2026-07-16): the whole document as its passages, in order.
 *  Citations deep-link here (?p=<passageId>#<passageId>) — the cited passage
 *  is highlighted and the browser lands on it, so "show me where the booklet
 *  says that" is one click from any item.
 *
 *  Visual documents (2026-07-25) read differently: one passage per SLIDE, and
 *  the stored PDF itself can be opened at that page (?slide=N) — because a
 *  bidding table's meaning is in the picture, the reading is only a
 *  transcription of it. Text documents render exactly as they always have. */
export default async function SourceReaderPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string; sourceId: string }>;
  searchParams: Promise<{ p?: string; slide?: string }>;
}>) {
  const { kbId, sourceId } = await params;
  const { p: target, slide } = await searchParams;
  const store = kbStore();
  const [source, document, passages] = await Promise.all([
    store.getSource(sourceId),
    store.getDocument(sourceId),
    store.listPassages(sourceId),
  ]);
  if (!source) notFound();

  // A visual document keeps its raw PDF in the private bucket; every passage is
  // one page of it (ordinal = page, anchor = "page-N").
  const visual = document?.ingestMode === "visual" && Boolean(document.storagePath);
  const openSlide = visual && slide ? Number(slide) : undefined;
  let slideUrl: string | null = null;
  let slideError: string | null = null;
  if (visual && openSlide) {
    try {
      const { getSignedSourceUrl } = await import("@/lib/visualIngest");
      slideUrl = await getSignedSourceUrl(document!.storagePath!, 600);
    } catch (e) {
      slideError = e instanceof Error ? e.message : "the stored PDF could not be signed";
    }
  }
  const selfHref = `/bridge/kb/${kbId}/sources/${sourceId}`;
  const slideHref = (page: number, passageId: string) =>
    `${selfHref}?p=${passageId}&slide=${page}#${passageId}`;

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
              {document.fileName} ·{" "}
              {visual
                ? `${passages.length}/${document.pageCount ?? passages.length} slides read`
                : `${passages.length} passages`}
            </>
          )}
        </p>
        {visual && (
          <p className="mt-1 text-xs text-neutral-500">
            Read as pictures: each slide below is a transcription of the page — tables as tables,
            what the colors mean, the annotated line in a diagram. Open any slide to check the
            reading against the real thing.
          </p>
        )}
      </header>

      {openSlide !== undefined && (
        <section className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50/40 p-3">
          <p className="mb-2 flex flex-wrap items-baseline gap-3 text-sm">
            <span className="font-medium">Slide {openSlide}</span>
            {slideUrl && (
              <a
                href={`${slideUrl}#page=${openSlide}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-800 underline-offset-2 hover:underline"
              >
                open in a new tab →
              </a>
            )}
            <Link
              href={target ? `${selfHref}?p=${target}#${target}` : selfHref}
              className="ml-auto text-xs text-neutral-500 underline-offset-2 hover:underline"
            >
              hide the slide
            </Link>
          </p>
          {slideUrl ? (
            <object
              data={`${slideUrl}#page=${openSlide}`}
              type="application/pdf"
              aria-label={`Slide ${openSlide} of ${document?.fileName ?? "the document"}`}
              className="h-[65vh] w-full rounded border border-neutral-200 bg-white"
            >
              <p className="p-3 text-sm text-neutral-600">
                Your browser won&apos;t embed the PDF —{" "}
                <a
                  href={`${slideUrl}#page=${openSlide}`}
                  className="text-emerald-800 underline-offset-2 hover:underline"
                >
                  open slide {openSlide} directly →
                </a>
              </p>
            </object>
          ) : (
            <p className="text-sm text-[color:var(--color-draft)]">
              The stored PDF couldn&apos;t be opened
              {slideError ? `: ${slideError}` : " — the signed link was refused"}. The reading
              below is still what extraction used.
            </p>
          )}
        </section>
      )}

      {passages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {visual
            ? "The PDF is stored but no slide has been read yet — run the reading pass from the document wizard."
            : "No document uploaded for this source yet."}
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
                  {visual ? `Slide ${passage.ordinal}` : `¶${passage.ordinal}`}
                  {cited && (
                    <span className="ml-2 rounded bg-emerald-700 px-1.5 py-0.5 text-[9px] font-medium tracking-normal text-white">
                      cited passage
                    </span>
                  )}
                  {visual && (
                    <Link
                      href={slideHref(passage.ordinal, passage.passageId)}
                      className="ml-2 tracking-normal text-emerald-700 normal-case underline-offset-2 hover:underline"
                    >
                      view slide {passage.ordinal} →
                    </Link>
                  )}
                </p>
                <p
                  className={`prose-knowledge mt-0.5 text-[15px] leading-relaxed text-neutral-800${
                    // A slide reading carries markdown tables and line-per-row
                    // structure — collapsing its whitespace would undo the
                    // reading pass. Text passages render exactly as before.
                    visual ? " whitespace-pre-wrap" : ""
                  }`}
                >
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
