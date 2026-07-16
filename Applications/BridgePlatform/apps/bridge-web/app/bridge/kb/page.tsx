import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { ensureSeeds, kbStore } from "@/lib/kb";
import { createKbAction } from "./actions";

/** The knowledge-base list: every system the platform knows, at a glance. */
export default async function KbListPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  await ensureSeeds();

  const kbs = await kbStore().listKbs();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-medium">Knowledge bases</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          A knowledge base holds one system&apos;s agreements — items, their
          relationships, and the pack ladder players are built from. Everything
          inside a KB is mutually compatible by construction.
        </p>
      </header>

      {kbs.length === 0 ? (
        <section className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge bases yet. Create one below, then upload its source
          document and run extraction.
        </section>
      ) : (
        <ul className="space-y-3">
          {kbs.map((kb) => (
            <li key={kb.kbId}>
              <Link
                href={`/bridge/kb/${kb.kbId}`}
                className="flex items-baseline justify-between rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4 hover:border-emerald-400"
              >
                <span>
                  <span className="font-serif text-lg font-medium">{kb.name}</span>
                  <span className="ml-3 text-xs uppercase tracking-wide text-neutral-400">
                    {kb.systemLabel}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">
                  {kb.lastCompileError ? (
                    <span className="text-[var(--madder)]">latest edit doesn&apos;t compile</span>
                  ) : kb.liveCompileId ? (
                    "live"
                  ) : (
                    "empty"
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 rounded-lg border border-neutral-200 p-5">
        <h2 className="font-medium">New knowledge base</h2>
        <form action={createKbAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input
              name="name"
              required
              placeholder="SAYC"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">System label</span>
            <input
              name="systemLabel"
              required
              placeholder="SAYC"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
            <input
              name="description"
              placeholder="Standard American Yellow Card, from the official document"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <p className="sm:col-span-2">
            <button
              type="submit"
              className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Create knowledge base
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
