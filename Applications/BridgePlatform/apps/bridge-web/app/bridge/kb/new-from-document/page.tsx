import { AutoRead } from "@/components/kb/AutoRead";
import { canViewKbWorkspace } from "@/lib/kbComponent";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureSeeds, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { INGEST_MODELS, storageAvailable, visionAvailable } from "@/lib/visualIngest";
import {
  createKbFromDocumentAction,
  extractSectionAction,
  makePlayableAction,
  proposeSectionsAction,
  registerVisualSourceAction,
  runReadingBatchAction,
  saveSectionsAction,
  uploadVisualPdfAction,
} from "./actions";
import {
  isVisualDoc,
  MAX_PDF_BYTES,
  PAGE_BATCH,
  readPages,
  sectionChip,
  sectionProgress,
  wizardUrl,
} from "./wizard";

/**
 * "New knowledge base from a document" — the visual-ingest wizard.
 *
 * A slide deck's meaning lives in tables, colored rows, matrices and diagrams;
 * flattening it to a text layer destroys all of that. This page walks one deck
 * from a PDF to a playable knowledge base by having Claude READ the pages
 * (vision), then extracting one named section at a time so a person can settle
 * "Opening bids" before "Responses" is even attempted.
 *
 * RESUMABLE BY CONSTRUCTION: the page holds no state. Identity travels in the
 * URL (?kbId=&sourceId=&model=) and every stage is recomputed from the store on
 * each GET — the KB, the document row, its page passages, its section map, the
 * extraction jobs. Each button is exactly one serverless invocation over a
 * bounded batch, so closing the tab loses at most one batch.
 */

type Search = {
  kbId?: string;
  sourceId?: string;
  model?: string;
  error?: string;
  uploaded?: string;
  read?: string;
  remaining?: string;
  proposed?: string;
  sectionsSaved?: string;
  extracted?: string;
  failed?: string;
  section?: string;
  playable?: string;
  packId?: string;
};

const card = "rounded-lg border border-neutral-200 bg-[var(--card)] p-5";
const input = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
const primary =
  "rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";

/** Estimated cost of a FULL run (both passes) of THIS deck under one option. */
function estimateLabel(model: (typeof INGEST_MODELS)[number], pages: number): string {
  if (pages < 1) return "price depends on the page count";
  const { lowUsd, highUsd } = model.estimate(pages);
  return `~$${lowUsd.toFixed(2)}–$${highUsd.toFixed(2)}`;
}

function Stage({
  n,
  title,
  state,
  done,
  children,
}: Readonly<{
  n: number;
  title: string;
  state: string;
  done?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span
          className={
            done
              ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-xs font-medium text-white"
              : "flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-xs text-neutral-500"
          }
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-serif text-lg font-medium">{title}</h2>
        <span className="ml-auto text-xs text-neutral-500">{state}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function NewFromDocumentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Search> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!(await canViewKbWorkspace(context))) redirect("/bridge/home");
  await ensureSeeds();
  const sp = await searchParams;

  const store = kbStore();
  const kb = sp.kbId ? await store.getKb(sp.kbId) : null;
  const source = kb && sp.sourceId ? await store.getSource(sp.sourceId) : null;
  const doc = source ? await store.getDocument(source.sourceId) : null;
  const visual = isVisualDoc(doc);
  const pageCount = visual ? (doc?.pageCount ?? 0) : 0;
  const passages = visual ? await store.listPassages(source!.sourceId) : [];
  const [items, jobs] = kb
    ? await Promise.all([store.listItemsForKb(kb.kbId), store.listJobsForKb(kb.kbId)])
    : [[], []];

  const llmReady = visionAvailable();
  const storeReady = storageAvailable();

  // Model choice rides the URL, so a reload or a shared link keeps it.
  const models = INGEST_MODELS;
  const model = models.find((m) => m.id === sp.model) ?? models[1] ?? models[0];
  const modelId = model?.id ?? "";
  const identity = { kbId: kb?.kbId ?? "", sourceId: source?.sourceId ?? "", model: modelId };

  // ---- derived stage state (nothing is remembered) -------------------------
  const pagesRead = readPages(passages);
  const readCount = pagesRead.length;
  const readingDone = pageCount > 0 && readCount >= pageCount;
  const sections = doc?.sections ?? [];
  const pageByPassageId = new Map(passages.map((p) => [p.passageId, p.ordinal]));
  const progressBySection = sections.map((section) =>
    sectionProgress({
      section,
      sourceId: source?.sourceId ?? "",
      items,
      jobs,
      pageByPassageId,
    }),
  );
  const draftedTotal = progressBySection.reduce((n, p) => n + p.drafted, 0);
  const base = kb ? `/bridge/kb/${kb.kbId}` : "";
  const readerHref = source ? `${base}/sources/${source.sourceId}` : "";
  const packHref = sp.packId ? `${base}/sets/${sp.packId}` : `${base}/sets`;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href="/bridge/kb" className="hover:underline">
            Knowledge bases
          </Link>{" "}
          / from a document
        </p>
        <h1 className="mt-1 text-3xl font-medium">New knowledge base from a document</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          For a document whose meaning is in its <b>pictures</b> — a slide deck of bidding
          tables, color-coded rows, support matrices, card diagrams and deal figures. The pages
          are read as images, so a table stays a table and &ldquo;orange means forcing&rdquo;
          survives; then you extract the deck <b>one named section at a time</b>, settling each
          before the next. Every step is a single click you can stop and resume.
        </p>
        {kb && (
          <p className="mt-2 text-xs text-neutral-500">
            Working on{" "}
            <Link href={base} className="text-emerald-700 underline-offset-2 hover:underline">
              {kb.name}
            </Link>{" "}
            · this page is resumable — bookmark the URL and come back to it.
          </p>
        )}
      </header>

      {sp.error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
          {sp.error}
        </p>
      )}
      {!llmReady && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          ANTHROPIC_API_KEY isn&apos;t configured on this server — reading a document, proposing
          its sections and extracting from it are unavailable until the key is set. Creating the
          knowledge base, registering the source and uploading the PDF all still work.
        </p>
      )}
      {!storeReady && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-[color:var(--color-draft)]">
          Visual ingestion needs the Postgres backend — this server is running the JSON file
          store, so there is nowhere to keep the PDF. Set STORE_BACKEND=postgres (with the
          Supabase keys) and reload.
        </p>
      )}
      {sp.uploaded && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          PDF stored — {sp.uploaded} slides. Pick a model below and start reading.
        </p>
      )}
      {sp.read !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {Number(sp.remaining ?? 0) > 0
            ? `Read ${sp.read} page(s) — ${sp.remaining} to go. Click again to continue.`
            : `Read ${sp.read} page(s) — that was the last batch; every slide now has a reading.`}
        </p>
      )}
      {sp.proposed && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {sp.proposed} sections proposed — check the titles and page ranges below, then save.
        </p>
      )}
      {sp.sectionsSaved && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Section map saved — {sp.sectionsSaved} sections.
        </p>
      )}
      {sp.extracted !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Extracted {sp.extracted} draft item(s) from{" "}
          <b>{sections[Number(sp.section)]?.title ?? "that section"}</b>
          {Number(sp.failed ?? 0) > 0 && ` · ${sp.failed} window(s) need a person`}. Review it
          before extracting the next section.
        </p>
      )}
      {sp.playable !== undefined && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Playable — {sp.playable} floor item(s) added and every item is in{" "}
          <b>Full {kb?.systemLabel}</b>, which the completeness checklist now scores.
        </p>
      )}

      {/* ---- 1. the knowledge base ---------------------------------------- */}
      <Stage
        n={1}
        title="Create the knowledge base"
        state={kb ? kb.systemLabel : "not created yet"}
        done={Boolean(kb)}
      >
        {kb ? (
          <p className="text-sm text-neutral-600">
            <b>{kb.name}</b> — {items.length} knowledge item{items.length === 1 ? "" : "s"} so
            far.{" "}
            <Link href={base} className="text-emerald-700 underline-offset-2 hover:underline">
              open the knowledge base →
            </Link>
          </p>
        ) : (
          <form action={createKbFromDocumentAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="model" value={modelId} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Name</span>
              <input name="name" required placeholder="Teaching bridge (from slides)" className={input} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">System label</span>
              <input name="systemLabel" required placeholder="Teaching" className={input} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
              <input
                name="description"
                placeholder="Built from the 88-slide teaching deck"
                className={input}
              />
            </label>
            <p className="sm:col-span-2">
              <button type="submit" className={primary}>
                Create the knowledge base
              </button>
            </p>
          </form>
        )}
      </Stage>

      {/* ---- 2. the source + the PDF -------------------------------------- */}
      <Stage
        n={2}
        title="Register the source and upload the PDF"
        state={
          !kb
            ? "waiting for the knowledge base"
            : visual
              ? `${doc?.fileName} · ${pageCount} slides`
              : source
                ? "source registered — upload the PDF"
                : "no source yet"
        }
        done={visual}
      >
        {!kb ? (
          <p className="text-sm text-neutral-500">Create the knowledge base first.</p>
        ) : !source ? (
          <form action={registerVisualSourceAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="kbId" value={kb.kbId} />
            <input type="hidden" name="model" value={modelId} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Slug (→ src_&lt;slug&gt;)</span>
              <input name="slug" required placeholder="teaching_slides" className={input} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Title</span>
              <input name="title" required placeholder="Teaching bridge — slide deck" className={input} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Type</span>
              <select name="sourceType" className={input}>
                <option value="official_system_document">official system document</option>
                <option value="book">book</option>
                <option value="article">article</option>
                <option value="expert">expert</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Rights</span>
              <select name="rightsStatus" className={input}>
                <option value="owned">owned</option>
                <option value="licensed">licensed</option>
                <option value="public">public</option>
                <option value="fair_use_excerpt">fair-use excerpt</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">
                Locator (URL / file name, optional)
              </span>
              <input name="locator" className={input} />
            </label>
            <p className="sm:col-span-2">
              <button type="submit" className={primary}>
                Register the source
              </button>
            </p>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              <b>{source.title}</b> <span className="text-xs text-neutral-400">{source.sourceId}</span>
            </p>
            {visual ? (
              <p className="text-sm text-neutral-600">
                {doc?.fileName} · {pageCount} slides stored ·{" "}
                <Link href={readerHref} className="text-emerald-700 underline-offset-2 hover:underline">
                  read the slides →
                </Link>
              </p>
            ) : (
              doc && (
                <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-[color:var(--color-draft)]">
                  This source already has a <b>text</b> document ({doc.fileName}). Uploading a PDF
                  here replaces it with a visual one and clears its passages — citations into the
                  old passages would stop resolving.
                </p>
              )
            )}
            <form
              action={uploadVisualPdfAction}
              encType="multipart/form-data"
              className="flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="kbId" value={kb.kbId} />
              <input type="hidden" name="sourceId" value={source.sourceId} />
              <input type="hidden" name="model" value={modelId} />
              <input
                type="file"
                name="file"
                accept=".pdf,application/pdf"
                required
                className="text-sm"
              />
              <button type="submit" disabled={!storeReady} className={secondary}>
                {visual ? "Replace the PDF" : "Upload the PDF"}
              </button>
              <span className="text-[11px] text-neutral-400">
                one PDF, up to {MAX_PDF_BYTES / 1_000_000} MB — but this server&apos;s
                request-body limit is 4 MB, so keep the deck under ~4 MB (the 88-slide deck is
                2.5 MB). The whole file is posted: the pages are read on the server, not in your
                browser.
              </span>
            </form>
          </div>
        )}
      </Stage>

      {/* ---- 3. the reading pass ------------------------------------------ */}
      <Stage
        n={3}
        title="Read the deck, slide by slide"
        state={
          !visual
            ? "waiting for the PDF"
            : readingDone
              ? `all ${pageCount} slides read`
              : `${readCount}/${pageCount} slides read`
        }
        done={readingDone}
      >
        {!visual ? (
          <p className="text-sm text-neutral-500">Upload the PDF first.</p>
        ) : (
          <div className="space-y-3">
            <p className="max-w-2xl text-sm text-neutral-600">
              Each slide is transcribed as itself — tables as tables, what a color <i>means</i>,
              the annotated line in a card diagram, the hands in a deal figure — and stored as
              that page&apos;s passage, so every extracted rule can cite the exact slide.
            </p>
            <fieldset className="space-y-1.5">
              <legend className="text-xs uppercase tracking-wide text-neutral-400">
                Reading model · price for this deck ({pageCount} slides)
              </legend>
              {models.map((m) => (
                <p key={m.id} className="text-sm">
                  <Link
                    href={wizardUrl({ ...identity, model: m.id })}
                    className={
                      m.id === modelId
                        ? "block rounded border border-emerald-400 bg-emerald-50/60 px-2 py-1 text-emerald-900"
                        : "block rounded border border-transparent px-2 py-1 text-neutral-600 hover:border-neutral-300"
                    }
                  >
                    {m.id === modelId ? "◉" : "○"} {m.label}{" "}
                    <span className="text-xs text-neutral-500">
                      · {estimateLabel(m, pageCount)} for the whole deck, both passes
                    </span>
                    <span className="block pl-4 text-xs text-neutral-500">{m.note}</span>
                  </Link>
                </p>
              ))}
              <p className="text-[11px] text-neutral-400">
                The choice is per run and rides this page&apos;s URL. Re-reading is per page, so
                trying a cheaper model first and re-running weak pages on a stronger one costs
                cents.
              </p>
            </fieldset>
            <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200">
              <div
                className="h-full bg-emerald-600"
                style={{ width: `${pageCount ? Math.round((readCount / pageCount) * 100) : 0}%` }}
              />
            </div>
            <form action={runReadingBatchAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="kbId" value={kb!.kbId} />
              <input type="hidden" name="sourceId" value={source!.sourceId} />
              <input type="hidden" name="model" value={modelId} />
              <button
                type="submit"
                disabled={!llmReady || !storeReady || readingDone}
                className={primary}
              >
                Read the next {Math.min(PAGE_BATCH, Math.max(pageCount - readCount, 0)) || PAGE_BATCH}{" "}
                pages
              </button>
              <span className="text-xs text-neutral-500">
                {readCount}/{pageCount} slides read
                {readingDone ? " — nothing left to read." : " · one batch per click, resumable."}
              </span>
            </form>
            {/* Or let it drain itself — an 88-slide deck is ~11 batches. */}
            {!readingDone && (
              <AutoRead
                kbId={kb!.kbId}
                sourceId={source!.sourceId}
                model={modelId}
                total={pageCount}
                remaining={pageCount - readCount}
                disabled={!llmReady || !storeReady}
              />
            )}
          </div>
        )}
      </Stage>

      {/* ---- 4. the section map ------------------------------------------- */}
      <Stage
        n={4}
        title="Agree the section map"
        state={
          !visual
            ? "waiting for the PDF"
            : sections.length
              ? `${sections.length} sections`
              : readingDone
                ? "not proposed yet"
                : "waiting for the reading pass"
        }
        done={sections.length > 0}
      >
        {!visual ? (
          <p className="text-sm text-neutral-500">Upload the PDF first.</p>
        ) : (
          <div className="space-y-3">
            <p className="max-w-2xl text-sm text-neutral-600">
              The deck is settled one named section at a time, so the map matters: a proposal is
              made from the readings (which covers every page), and you correct it. Titles and
              page ranges are yours to edit — split a long chapter, rename anything, and drop the
              agenda or credits slides by leaving them out of every section: pages no section
              covers are simply never extracted.
            </p>
            <form action={proposeSectionsAction}>
              <input type="hidden" name="kbId" value={kb!.kbId} />
              <input type="hidden" name="sourceId" value={source!.sourceId} />
              <input type="hidden" name="model" value={modelId} />
              <button
                type="submit"
                disabled={!llmReady || readCount === 0}
                className={secondary}
                title="Reads the page readings and proposes named page ranges"
              >
                {sections.length ? "Propose sections again" : "Propose sections"}
              </button>
              {readCount === 0 && (
                <span className="ml-3 text-xs text-neutral-500">
                  Read some slides first — the proposal is made from their readings.
                </span>
              )}
            </form>
            <form action={saveSectionsAction} className="space-y-2">
              <input type="hidden" name="kbId" value={kb!.kbId} />
              <input type="hidden" name="sourceId" value={source!.sourceId} />
              <input type="hidden" name="model" value={modelId} />
              {sections.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No sections yet — propose them, or add one by hand.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sections.map((section, index) => (
                    <li key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        name={`section:${index}:title`}
                        defaultValue={section.title}
                        aria-label={`Section ${index + 1} title`}
                        className="min-w-48 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <label className="text-xs text-neutral-500">
                        pages{" "}
                        <input
                          type="number"
                          name={`section:${index}:from`}
                          min={1}
                          max={pageCount}
                          defaultValue={section.fromPage}
                          aria-label={`Section ${index + 1} first page`}
                          className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-neutral-500">
                        to{" "}
                        <input
                          type="number"
                          name={`section:${index}:to`}
                          min={1}
                          max={pageCount}
                          defaultValue={section.toPage}
                          aria-label={`Section ${index + 1} last page`}
                          className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        name="remove"
                        value={index}
                        className="text-xs text-neutral-400 hover:text-[var(--madder)]"
                        title="Remove this section from the map"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="submit" className={primary}>
                  Save the section map
                </button>
                <button type="submit" name="add" value="1" className={secondary}>
                  Add a section
                </button>
              </div>
            </form>
          </div>
        )}
      </Stage>

      {/* ---- 5. per-section extraction ------------------------------------ */}
      <Stage
        n={5}
        title="Extract one section at a time"
        state={
          sections.length === 0
            ? "waiting for the section map"
            : `${draftedTotal} draft item(s) so far`
        }
        done={draftedTotal > 0}
      >
        {sections.length === 0 ? (
          <p className="text-sm text-neutral-500">Agree the section map first.</p>
        ) : (
          <div className="space-y-2">
            <p className="max-w-2xl text-sm text-neutral-600">
              Extraction sees the real slides, not the transcription. Items land as{" "}
              <b>drafts</b> citing the pages they came from, and the compiler validates every one
              — a window it can&apos;t structure is reported here instead of half-landing. Settle
              one section, then move to the next.
            </p>
            <ul className="space-y-2">
              {sections.map((section, index) => {
                const progress = progressBySection[index]!;
                // Extraction reads the pages, but the section's PASSAGES are
                // what its items cite — so a section with no reading yet can't
                // be extracted at all (it would have nothing to cite).
                const pagesHere = section.toPage - section.fromPage + 1;
                const readHere = pagesRead.filter(
                  (page) => page >= section.fromPage && page <= section.toPage,
                ).length;
                return (
                  <li key={index} className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="font-serif text-[15px] font-medium">{section.title}</span>
                      <span className="text-xs text-neutral-400">
                        pages {section.fromPage}–{section.toPage}
                        {readHere < pagesHere && ` · ${readHere}/${pagesHere} read`}
                      </span>
                      <span
                        className={
                          progress.drafted === 0
                            ? "rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600"
                            : "rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-800"
                        }
                      >
                        {sectionChip(progress)}
                      </span>
                      <span className="ml-auto flex flex-wrap items-center gap-3">
                        {progress.drafted > 0 && (
                          <Link
                            href={`${base}/sources/review?source=${encodeURIComponent(source!.sourceId)}`}
                            className="text-xs text-emerald-700 underline-offset-2 hover:underline"
                            title={`Opens everything this source added; the items from “${section.title}” are the ones citing pages ${section.fromPage}–${section.toPage}`}
                          >
                            review this section →
                          </Link>
                        )}
                        <form action={extractSectionAction}>
                          <input type="hidden" name="kbId" value={kb!.kbId} />
                          <input type="hidden" name="sourceId" value={source!.sourceId} />
                          <input type="hidden" name="model" value={modelId} />
                          <input type="hidden" name="sectionIndex" value={index} />
                          <button
                            type="submit"
                            disabled={!llmReady || readHere === 0}
                            title={
                              readHere === 0
                                ? "None of these slides has been read yet — run the reading pass first"
                                : `Reads pages ${section.fromPage}–${section.toPage} as slides and drafts the items they show`
                            }
                            className={secondary}
                          >
                            {progress.runs > 0 ? "Extract again" : "Extract this section"}
                          </button>
                        </form>
                      </span>
                    </div>
                    {progress.failures.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {progress.failures.map((failure, i) => (
                          <li key={i} className="text-[11px] text-[color:var(--color-draft)]">
                            needed a person — {failure.anchor}: {failure.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-neutral-500">
              The review board lists everything this source added (it filters by source, not by
              page range) — the items from a section are the ones citing that section&apos;s
              slides, and each one links straight to the slide it came from.
            </p>
          </div>
        )}
      </Stage>

      {/* ---- 6. make it playable ------------------------------------------ */}
      <Stage
        n={6}
        title="Make it playable"
        state={kb ? "available any time" : "waiting for the knowledge base"}
        done={sp.playable !== undefined}
      >
        {!kb ? (
          <p className="text-sm text-neutral-500">Create the knowledge base first.</p>
        ) : (
          <div className="space-y-3">
            <p className="max-w-2xl text-sm text-neutral-600">
              A document almost never states its floor. This adds the three fallback items
              (auction → pass, lead → low from longest, play → lowest legal card) and a standard
              signal agreement — signals being the one completeness category no fallback can
              satisfy — then puts every item into one set named{" "}
              <b>Full {kb.systemLabel}</b>, marked <i>intended to be complete</i> so the
              17-category checklist scores it. Safe to run more than once: items match by title
              and the set by name.
            </p>
            <form action={makePlayableAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="kbId" value={kb.kbId} />
              <input type="hidden" name="sourceId" value={source?.sourceId ?? ""} />
              <input type="hidden" name="model" value={modelId} />
              <button type="submit" className={primary}>
                Make it playable
              </button>
              <span className="text-xs text-neutral-500">
                adds the floor, builds “Full {kb.systemLabel}”, and recompiles once
              </span>
            </form>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href={`${base}/items`} className="text-emerald-700 underline-offset-2 hover:underline">
                Master →
              </Link>
              <Link href={packHref} className="text-emerald-700 underline-offset-2 hover:underline">
                completeness checklist →
              </Link>
              <Link href={`${base}/test`} className="text-emerald-700 underline-offset-2 hover:underline">
                Test bench →
              </Link>
              <Link href={`${base}/findings`} className="text-emerald-700 underline-offset-2 hover:underline">
                Findings →
              </Link>
              {source && (
                <Link href={readerHref} className="text-emerald-700 underline-offset-2 hover:underline">
                  the slides →
                </Link>
              )}
            </p>
          </div>
        )}
      </Stage>
    </div>
  );
}
