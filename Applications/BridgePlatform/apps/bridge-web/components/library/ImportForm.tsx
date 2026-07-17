"use client";

// LIN/PBN import: disabled until a file is chosen, pending state while the
// server action parses (same pattern as the KB UploadForm).

import { useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({ ready }: Readonly<{ ready: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      {pending ? "Importing…" : "Import"}
    </button>
  );
}

export function ImportForm({
  action,
}: Readonly<{ action: (formData: FormData) => Promise<void> }>) {
  const [fileName, setFileName] = useState("");
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="cursor-pointer rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-emerald-400">
        {fileName || "Choose .lin / .pbn…"}
        <input
          type="file"
          name="file"
          accept=".lin,.pbn,text/plain"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>
      <SubmitButton ready={!!fileName} />
    </form>
  );
}
