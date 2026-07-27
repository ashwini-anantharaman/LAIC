"use client";

// Bulk selection over server-rendered item rows: the page renders plain
// checkboxes named "itemIds" inside this form; we count them via event
// delegation and float a sticky action bar (select all shown / clear /
// two-step confirm) once anything is ticked. The verb/warning are
// configurable so the same bar drives delete (augmentation drafts) and
// deprecate (everywhere else); the action is a server action either way.

import { useRef, useState } from "react";

export function BulkItemsForm({
  kbId,
  returnTo,
  action,
  verb = "Delete",
  warning,
  children,
}: Readonly<{
  kbId: string;
  returnTo: string;
  action: (formData: FormData) => Promise<void>;
  verb?: string;
  warning?: string;
  children: React.ReactNode;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  const boxes = () =>
    Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>('input[name="itemIds"]') ?? [],
    );
  const recount = () => {
    setCount(boxes().filter((b) => b.checked).length);
    setArming(false);
  };
  const setAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    recount();
  };

  return (
    <form
      ref={formRef}
      action={action}
      onChange={recount}
      onSubmit={() => setBusy(true)}
      className="relative"
    >
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      {count > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-300 bg-[var(--card,#fff)] px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium tabular-nums">
            {count} selected
          </span>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-xs text-neutral-500 underline-offset-2 hover:underline"
          >
            Select all shown
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="text-xs text-neutral-500 underline-offset-2 hover:underline"
          >
            Clear
          </button>
          {arming ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs text-red-700">
                {verb} {count} item{count > 1 ? "s" : ""}?{" "}
                {warning ??
                  "Sets that list them are updated; this can't be undone."}
              </span>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? `${verb.replace(/e$/, "")}ing…` : `Yes, ${verb.toLowerCase()}`}
              </button>
              <button
                type="button"
                onClick={() => setArming(false)}
                className="text-xs text-neutral-500 underline-offset-2 hover:underline"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setArming(true)}
              className="ml-auto rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
            >
              {verb} selected…
            </button>
          )}
        </div>
      )}
    </form>
  );
}
