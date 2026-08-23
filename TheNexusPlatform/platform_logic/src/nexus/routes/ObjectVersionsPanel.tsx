/**
 * One object's version history, as everybody in the program sees it.
 *
 * WHY THIS IS SERVER-SIDE AND THE STUDIO'S IS NOT. The Studio keeps a version
 * list too, in the authoring browser's localStorage — so the person who made v11
 * is the only one who can see it, and only on that machine. A reviewer given a
 * folder could read the current pipeline and nothing else, which makes "what
 * changed since I looked?" unanswerable. These rows are on the server, so a
 * reviewer, an editor and a club member are looking at the same history.
 *
 * TWO KINDS OF ENTRY, and the distinction is the point:
 *
 *   Saved   somebody pressed Save to Content Library. They are saying this is
 *           the version they mean.
 *   Draft   they closed the editor with edits that were never committed. The
 *           work is kept — losing it to a mis-clicked X would be indefensible —
 *           but nobody declared it, and showing an accident beside a decision
 *           would make the decisions unfindable.
 */
import { useEffect, useState } from "react";
import { Check, FileClock, Loader2, PenLine } from "lucide-react";

import { getObjectVersions, type ObjectVersion } from "@/services/api";
import { cn } from "@/app/components/ui/utils";

export function ObjectVersionsPanel({
  programId,
  objectId,
}: {
  programId: string;
  objectId: string;
}) {
  const [data, setData] = useState<{ current_version: number | null; versions: ObjectVersion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    getObjectVersions(programId, objectId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Couldn't read the history"); });
    return () => { live = false; };
  }, [programId, objectId]);

  if (error) {
    return (
      <div className="p-6 text-sm">
        <p className="font-medium text-foreground">The history didn&rsquo;t load</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Reading the history…
      </div>
    );
  }
  if (!data.versions.length) {
    return (
      <div className="p-6 text-sm">
        <p className="font-medium text-foreground">No versions yet</p>
        {/* Said plainly, because the object is ALREADY at some version number —
            the counter predates this history, so an empty list is expected on
            anything last saved before it existed, not a sign of loss. */}
        <p className="mt-1 max-w-prose text-muted-foreground">
          A version is recorded when somebody presses <strong>Save to Content Library</strong> in
          the pipeline, or when they close it with unsaved edits (kept as a draft). Editing without
          saving no longer records one, so this list stays a record of decisions.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        {data.versions.length} version{data.versions.length === 1 ? "" : "s"}
        {data.current_version != null && <> · the library is carrying v{data.current_version}</>}
      </p>
      <ol className="space-y-2">
        {data.versions.map((v) => {
          const isCurrent = v.version_number === data.current_version;
          return (
            <li
              key={v.version_number}
              className={cn(
                "rounded-xl border p-3",
                isCurrent && "border-emerald-500/50 bg-emerald-500/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">v{v.version_number}</span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    v.status === "committed"
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                  )}
                >
                  {v.status === "committed" ? <Check className="size-3" /> : <PenLine className="size-3" />}
                  {v.status === "committed" ? "Saved" : "Draft"}
                </span>
                {isCurrent && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium">
                    live
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <FileClock className="size-3" />
                  {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {v.created_by_name ?? "Someone"} · {v.block_count} block
                {v.block_count === 1 ? "" : "s"}
                {v.title ? ` · “${v.title}”` : ""}
              </p>
              {v.note && <p className="mt-1 text-xs italic text-muted-foreground">{v.note}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
