"use client";

// The augmentation drain (2026-07-21): fires one batch after another against
// /api/bridge/kbs/:kbId/augment until every section of the source has been
// merged. Same tab-open resumable pattern as AutoExtract; the board's panels
// refresh live after every batch.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AugmentRunner({
  kbId,
  total,
  remaining,
  autostart,
}: Readonly<{
  kbId: string;
  total: number;
  remaining: number;
  autostart: boolean;
}>) {
  const router = useRouter();
  const [left, setLeft] = useState(remaining);
  const [running, setRunning] = useState(false);
  const [created, setCreated] = useState(0);
  const [modified, setModified] = useState(0);
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
        const res = await fetch(`/api/bridge/kbs/${kbId}/augment`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const r = (await res.json()) as {
          remaining: number;
          extracted: number;
          modified: number;
          failed: number;
          done: boolean;
        };
        setCreated((c) => c + r.extracted);
        setModified((m) => m + r.modified);
        setFailed((f) => f + r.failed);
        setLeft(r.remaining);
        router.refresh(); // panels update live
        if (r.done || r.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "augmentation failed");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
  };

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
    <div className="w-full">
      {left === 0 ? (
        <p className="text-sm text-emerald-800">
          ✓ every section merged — review the panels below, then keep or discard the draft.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={pause}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
              >
                ❚❚ merging…
              </button>
            ) : (
              <button
                type="button"
                onClick={drain}
                className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800"
              >
                {done > 0 ? "Resume the merge" : "Start the merge"}
              </button>
            )}
            <span className="text-sm tabular-nums text-neutral-600">
              {done} / {total} sections
              {created > 0 && ` · ${created} new`}
              {modified > 0 && ` · ${modified} modified`}
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
            Runs while this page is open; close to pause, reopen and resume. Each batch is a
            minute or two.
          </p>
          {error && (
            <p className="mt-1 text-xs text-red-700">Stopped: {error}. Click Resume to retry.</p>
          )}
        </>
      )}
    </div>
  );
}
