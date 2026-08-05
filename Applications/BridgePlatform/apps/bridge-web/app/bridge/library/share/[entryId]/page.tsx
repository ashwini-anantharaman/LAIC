import Link from "next/link";
import { redirect } from "next/navigation";
import { canShareLibrary } from "@/lib/libraryComponent";
import { getBridgeContext, getMyLearners, getProgramCoaches } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import { shareEntryAction } from "../actions";

/** Distribution surface: an admin makes a program-library item available to
 *  people — each picked person receives their own copy (provenance `shared`)
 *  in their personal library. Groups arrive with a Nexus group listing. */
export default async function ShareEntryPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!(await canShareLibrary(context))) redirect("/bridge/library");

  const { entryId } = await params;
  const { error } = await searchParams;
  const entry = await libraryStore().getEntry(entryId);
  if (!entry) redirect("/bridge/library?scope=program");

  const [learners, coaches] = await Promise.all([getMyLearners(), getProgramCoaches()]);
  const people = learners.filter((p) => p.user_id);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Library</p>
        <h1 className="mt-1 text-2xl font-medium">Share “{entry.name}”</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everyone you pick receives their own copy in their personal library —
          the original stays in the program library. Re-sharing is safe: people
          who already have this item are skipped.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {people.length === 0 && coaches.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          No people in this program yet.
        </p>
      ) : (
        <form action={shareEntryAction}>
          <input type="hidden" name="entryId" value={entry.entryId} />
          {coaches.length > 0 && (
            <>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Coaches
              </p>
              <ul className="mb-4 space-y-1 rounded-lg border border-neutral-200 p-3">
                {coaches.map((co) => (
                  <li key={co.coach_id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        name="recipient"
                        value={co.coach_id}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">
                        {co.name ?? co.coach_id}
                        <span className="ml-2 text-xs text-neutral-400">
                          coach · {co.learner_count} learner{co.learner_count === 1 ? "" : "s"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {people.length > 0 && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Learners
            </p>
          )}
          <ul className="space-y-1 rounded-lg border border-neutral-200 p-3">
            {people.map((p) => (
              <li key={p.user_id}>
                <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    name="recipient"
                    value={p.user_id ?? ""}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    {p.name ?? p.email ?? p.user_id}
                    {p.name && p.email && (
                      <span className="ml-2 text-xs text-neutral-400">{p.email}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="rounded bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800"
            >
              Share copies
            </button>
            <Link
              href="/bridge/library?scope=program"
              className="text-sm text-neutral-500 underline-offset-4 hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
