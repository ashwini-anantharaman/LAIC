import type { KnowledgeItem } from "@bridge/kb";
import Link from "next/link";
import { SetItemPicker } from "@/components/kb/SetItemPicker";
import { kbStore } from "@/lib/kb";
import { whenRoles } from "@/lib/whenFacet";
import { savePackAction } from "../../../actions";

/** Executable rules an item carries (0 = teaching prose) — mirrors the Master
 *  viewer's ruleCount so the picker's "most rules" sort agrees with it. */
function ruleCount(item: KnowledgeItem): number {
  const p = item.payload;
  switch (p.kind) {
    case "auction_rules":
    case "forcing_rules":
    case "play_rules":
      return p.rules.length;
    case "lead_rules":
      return p.leads.length;
    case "signals":
    case "fallback":
      return 1;
    default:
      return 0;
  }
}

/** Dedicated set-creation page — the roster picker needs room to breathe. */
export default async function NewSetPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const { kbId } = await params;
  const { error } = await searchParams;
  const store = kbStore();
  const [packs, items] = await Promise.all([
    store.listPacksForKb(kbId),
    store.listItemsForKb(kbId),
  ]);
  const base = `/bridge/kb/${kbId}`;
  const hiddenDeprecatedCount = items.filter((i) => i.status === "deprecated").length;
  const pickerItems = items
    .filter((i) => i.status !== "deprecated")
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((i) => ({
      itemId: i.itemId,
      title: i.title,
      knowledgeType: i.knowledgeType,
      roles: [...whenRoles(i)],
      phase: i.phase,
      ruleCount: ruleCount(i),
    }));

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm">
        <Link href={`${base}/sets`} className="text-neutral-500 underline-offset-4 hover:underline">
          Knowledge sets
        </Link>{" "}
        <span className="text-neutral-400">/ new</span>
      </p>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form action={savePackAction} className="space-y-4">
        <input type="hidden" name="kbId" value={kbId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input
              name="name"
              required
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
            <input
              name="description"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="intendedComplete" className="mt-0.5" />
          <span>
            <span className="font-medium">Intended to be complete</span>
            <span className="block text-xs text-neutral-500">
              Check this when the set (with anything it includes) should cover a full game on
              its own — the workspace then shows the completeness checklist while you build.
            </span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Knowledge items in this set</legend>
          <SetItemPicker
            items={pickerItems}
            packs={packs}
            hiddenDeprecatedCount={hiddenDeprecatedCount}
          />
        </fieldset>

        <button
          type="submit"
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Create set
        </button>
      </form>
    </div>
  );
}
