"use client";

// Whole-PDF upload (2026-07-20): the PDF's text is extracted in the BROWSER
// with pdf.js (unpdf), so a 48 MB / 500-page book never hits Vercel's ~4.5 MB
// request-body limit — only the ~sub-MB text is posted to the server action.
// Plain .txt/.md are read directly. On success the server redirects with
// extract=auto and the Sources tab starts draining sections on its own.

import { useState } from "react";
import { useRouter } from "next/navigation";

type UploadResult =
  | { ok: true; passageCount: number; sectionCount: number }
  | { ok: false; error: string };

export function PdfUploadForm({
  kbId,
  sourceId,
  replace,
  action,
}: Readonly<{
  kbId: string;
  sourceId: string;
  replace: boolean;
  action: (formData: FormData) => Promise<UploadResult>;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      let text: string;
      let mediaType = file.type || "text/plain";

      if (isPdf) {
        setStatus("Reading the PDF in your browser…");
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
        const result = await extractText(pdf, { mergePages: true });
        text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
        mediaType = "application/pdf";
        setStatus(
          `Read ${result.totalPages} pages (${Math.round(text.length / 1024)} KB of text). Uploading…`,
        );
      } else {
        text = await file.text();
        setStatus("Uploading…");
      }

      if (!text.trim()) {
        setStatus(
          "No text came out of that file — a scanned/image-only PDF has no text layer to read.",
        );
        setBusy(false);
        return;
      }

      const fd = new FormData();
      fd.set("kbId", kbId);
      fd.set("sourceId", sourceId);
      fd.set("fileName", file.name);
      fd.set("mediaType", mediaType);
      fd.set("text", text);
      const result = await action(fd);
      if (!result.ok) {
        setStatus(result.error);
        setBusy(false);
        return;
      }
      // Navigate client-side; extraction auto-starts on arrival.
      router.push(
        `/bridge/kb/${kbId}/sources?uploaded=${result.passageCount}&sections=${result.sectionCount}&extract=auto`,
      );
      router.refresh();
    } catch (e) {
      setStatus(`Couldn't read that file: ${e instanceof Error ? e.message : "unknown error"}`);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:border-emerald-400">
        {file?.name ?? "Choose a file (.pdf, .md, .txt)…"}
        <input
          type="file"
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus(null);
          }}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!file || busy}
        className="rounded border border-neutral-300 px-3 py-1 text-sm enabled:hover:border-emerald-400 disabled:opacity-40"
      >
        {busy ? "Working…" : replace ? "Replace document" : "Upload document"}
      </button>
      {status ? (
        <span className="text-[11px] text-neutral-500">{status}</span>
      ) : (
        !file && <span className="text-[11px] text-neutral-400">the whole PDF is fine — text is read in your browser</span>
      )}
    </div>
  );
}
