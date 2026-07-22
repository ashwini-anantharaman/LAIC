// Post-redirect report for a bulk sweep — delete (augmentation drafts) or
// deprecate (everywhere else): how many went, which sets were updated to
// drop them, and which items the release pin protected.

export function BulkResultBanner({
  deleted,
  deprecated,
  blocked,
  sets,
}: Readonly<{ deleted?: string; deprecated?: string; blocked?: string; sets?: string }>) {
  if (!deleted && !deprecated && !blocked) return null;
  const n = Number(deleted ?? 0);
  const d = Number(deprecated ?? 0);
  return (
    <div className="mb-4 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
      {n > 0 && (
        <p className="text-emerald-900">
          Deleted {n} item{n > 1 ? "s" : ""}.
          {sets && (
            <span className="text-emerald-800"> Removed from: {sets} (each set kept a snapshot).</span>
          )}
        </p>
      )}
      {d > 0 && (
        <p className="text-emerald-900">
          Deprecated {d} item{d > 1 ? "s" : ""} — they stop compiling and are hidden from the
          default view.
        </p>
      )}
      {blocked && (
        <p className="text-amber-800">
          Kept: {blocked} — items in a published release can&apos;t be deleted.
        </p>
      )}
    </div>
  );
}
