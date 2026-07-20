"use client";

// Auto-drain extraction (2026-07-20): fires one batch after another against
// /api/bridge/kbs/:kbId/extract until no sections remain — the same
// tab-open, resumable pattern as the table's AutoAdvance. Sequential (awaits
// each batch before the next, so sections never double-process); pausable;
// resumes on revisit because completed sections are skipped server-side.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoExtract({
  kbId,
  sourceId,
  total,
  remaining,
  autostart,
}: Readonly<{
  kbId: string;
  sourceId: string;
  total: number;
  remaining: number;
  autostart: boolean;
}>) {
  const reviewHref = `/bridge/kb/${kbId}/sources/review?source=${encodeURIComponent(sourceId)}`;
  const router = useRouter();
  const [left, setLeft] = useState(remaining);
  const [running, setRunning] = useState(false);
  const [created, setCreated] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const started = useRef(false);

  const drain = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    try {
      while (runningRef.current) {
        const res = await fetch(`/api/bridge/kbs/${kbId}/extract`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const r = (await res.json()) as {
          remaining: number;
          extracted: number;
          failed: number;
          done: boolean;
        };
        setCreated((c) => c + r.extracted);
        setFailed((f) => f + r.failed);
        setLeft(r.remaining);
        router.refresh(); // live-update the item counts + write-up queue
        if (r.done || r.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "extraction failed");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
  };

  // Auto-start once when arriving straight from an upload.
  useEffect(() => {
    if (autostart && !started.current && remaining > 0) {
      started.current = true;
      void drain();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = total - left;

  if (total === 0) return null;

  return (
    <div className="mt-1 w-full">
      {left === 0 ? (
        <p className="text-sm text-[color:var(--color-approved)]">
          ✓ all {total} sections extracted
          {created > 0 && ` · ${created} items this run`}
          {" · "}
          <a href={reviewHref} className="text-emerald-700 underline-offset-2 hover:underline">
            review what was added →
          </a>
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={pause}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
              >
                ❚❚ extracting…
              </button>
            ) : (
              <button
                type="button"
                onClick={drain}
                className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800"
              >
                {done > 0 ? "Resume extraction" : "Extract in the background"}
              </button>
            )}
            <span className="text-sm text-neutral-600 tabular-nums">
              {done} / {total} sections
              {created > 0 && (
                <>
                  {" · "}
                  <a
                    href={reviewHref}
                    className="text-emerald-700 underline-offset-2 hover:underline"
                  >
                    {created} items →
                  </a>
                </>
              )}
              {failed > 0 && ` · ${failed} need a person`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Runs while this page is open — each batch is a minute or two. Close the tab to
            pause; reopen the Sources tab and click Resume to continue where it left off.
          </p>
          {error && (
            <p className="mt-1 text-xs text-[color:var(--color-invalid)]">
              Stopped: {error}. Click Resume to retry.
            </p>
          )}
        </>
      )}
    </div>
  );
}
