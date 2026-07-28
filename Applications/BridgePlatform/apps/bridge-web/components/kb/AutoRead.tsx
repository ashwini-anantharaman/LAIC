"use client";

// Auto-drain the reading pass (2026-07-25): fires one batch after another
// against /api/bridge/kbs/:kbId/read-pages until every slide is read — the
// same tab-open, resumable pattern as AutoExtract and the table's AutoAdvance.
// Sequential (awaits each batch, so a page never double-reads), pausable, and
// resumes on revisit because already-read pages are skipped server-side.
// An 88-slide deck is ~11 batches, so this saves babysitting the button.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRead({
  kbId,
  sourceId,
  model,
  total,
  remaining,
  disabled,
}: Readonly<{
  kbId: string;
  sourceId: string;
  model: string;
  total: number;
  remaining: number;
  /** No key / no storage — the parent explains why; keep the control inert. */
  disabled?: boolean;
}>) {
  const router = useRouter();
  const [left, setLeft] = useState(remaining);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const drain = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    try {
      while (runningRef.current) {
        const res = await fetch(`/api/bridge/kbs/${kbId}/read-pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceId, model }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const r = (await res.json()) as { remaining: number; read: number; done: boolean };
        setLeft(r.remaining);
        router.refresh(); // live-update the slide count + unlock the next stage
        if (r.done || r.remaining === 0) break;
        // A batch that reads nothing would spin — stop and let the person retry.
        if (r.read === 0) throw new Error("a batch read no pages — click to retry");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "reading failed");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
  };

  if (total === 0 || left === 0) return null;
  const done = total - left;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <button
            type="button"
            onClick={pause}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
          >
            ❚❚ reading slides… ({done}/{total})
          </button>
        ) : (
          <button
            type="button"
            onClick={drain}
            disabled={disabled}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400 disabled:opacity-40"
          >
            {done > 0 ? "Read the rest automatically" : "Read the whole deck automatically"}
          </button>
        )}
        <span className="text-xs text-neutral-500">
          keeps going batch by batch while this tab stays open — pause any time.
        </span>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-[color:var(--color-invalid)]">
          {error} — progress is saved; nothing was lost.
        </p>
      )}
    </div>
  );
}
