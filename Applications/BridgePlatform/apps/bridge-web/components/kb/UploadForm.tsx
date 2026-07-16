"use client";

// Document upload widget: the submit stays disabled until a file is chosen,
// shows the chosen name, and reports upload progress — no more pressing
// "Upload" into a full-page error.

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({ ready, replace }: Readonly<{ ready: boolean; replace: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="rounded border border-neutral-300 px-3 py-1 text-sm enabled:hover:border-emerald-400 disabled:opacity-40"
    >
      {pending ? "Uploading…" : replace ? "Replace document" : "Upload document"}
    </button>
  );
}

export function UploadForm({
  kbId,
  sourceId,
  replace,
  action,
}: Readonly<{
  kbId: string;
  sourceId: string;
  replace: boolean;
  action: (formData: FormData) => Promise<void>;
}>) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <label className="cursor-pointer rounded border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:border-emerald-400">
        {fileName ?? "Choose a file (.pdf, .md, .txt)…"}
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      <SubmitButton ready={Boolean(fileName)} replace={replace} />
      {!fileName && (
        <span className="text-[11px] text-neutral-400">pick the document first</span>
      )}
    </form>
  );
}
