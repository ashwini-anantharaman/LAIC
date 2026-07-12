import { skillName, conceptName } from "@bridge/taxonomy";
import type { SourcePassage } from "@bridge/knowledge";
import { notFound } from "next/navigation";
import { saveItemEdit, setItemStatus } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";

export default async function KnowledgeItemPage({
  params,
}: Readonly<{ params: Promise<{ itemId: string }> }>) {
  const { itemId } = await params;
  const store = knowledgeStore();
  const item = await store.getItem(itemId);
  if (!item) notFound();
  const revisions = await store.listItemRevisions(itemId);
  const gaps = (await Promise.all(item.gapIds.map((g) => store.getGap(g)))).filter(Boolean);

  // §12.7 side-by-side: resolve cited passageIds to their full uploaded text.
  const citedPassageIds = new Set(item.citations.map((c) => c.passageId).filter(Boolean));
  const passagesById = new Map<string, SourcePassage>();
  if (citedPassageIds.size) {
    for (const sourceId of new Set(item.citations.map((c) => c.sourceId))) {
      for (const p of await store.listPassages(sourceId))
        if (citedPassageIds.has(p.passageId)) passagesById.set(p.passageId, p);
    }
  }
  const sideBySide = [...citedPassageIds].map((id) => passagesById.get(id!)).filter(Boolean) as SourcePassage[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <p className="text-xs text-neutral-500">
          {item.itemId} · {item.itemType} · {item.systemFamily} · v{item.version} ·{" "}
          {item.status} · {revisions.length} prior revision{revisions.length === 1 ? "" : "s"}
          {item.citations.length === 0 && (
            <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-amber-800">uncited</span>
          )}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Where this rule comes from
        </h2>
        {item.citations.length ? (
          <ul className="space-y-1 text-sm">
            {item.citations.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.sourceId}:</span>{" "}
                <span className="text-neutral-600">{c.passage}</span>
                {c.passageId && (
                  <a
                    href={`/bridge/admin/sources/${c.sourceId}#${c.passageId.split("#")[1]}`}
                    className="ml-2 text-xs text-emerald-700 hover:underline"
                  >
                    open passage →
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-amber-700">
            No citations yet — rules from this item are badged "uncited" until a
            passage is matched.
          </p>
        )}
        {gaps.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            Linked gaps: {gaps.map((g) => `${g!.gapId} (${g!.resolutionStatus})`).join(", ")}
          </p>
        )}
        {(item.relatedSkillIds?.length || item.relatedConceptIds?.length) ? (
          <p className="mt-2 text-xs text-neutral-500">
            Skills: {(item.relatedSkillIds ?? []).map(skillName).join(", ") || "—"} · Concepts:{" "}
            {(item.relatedConceptIds ?? []).map(conceptName).join(", ") || "—"}
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            No skill tags — progress can’t attribute this rule to skills (tag it below).
          </p>
        )}
      </section>

      {/* §12.7: the reviewed statement next to the exact text it came from. */}
      {sideBySide.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Side by side — reviewed rule vs. source text
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded border border-emerald-200 bg-emerald-50/40 p-3">
              <p className="mb-1 text-xs font-medium text-emerald-900">This item says</p>
              <p>{item.humanReadableRule}</p>
            </div>
            <div className="space-y-2">
              {sideBySide.map((p) => (
                <div key={p.passageId} className="rounded border border-neutral-200 p-3">
                  <p className="mb-1 text-xs font-medium text-neutral-500">
                    {p.anchor}{" "}
                    <a
                      href={`/bridge/admin/sources/${p.sourceId}#${p.passageId.split("#")[1]}`}
                      className="text-emerald-700 hover:underline"
                    >
                      open in source →
                    </a>
                  </p>
                  <p className="whitespace-pre-wrap text-neutral-700">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <form action={saveItemEdit} className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Edit (bumps the version; existing package versions keep the old text)
        </h2>
        <input type="hidden" name="itemId" value={item.itemId} />
        <input
          name="title"
          defaultValue={item.title}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <textarea
          name="humanReadableRule"
          defaultValue={item.humanReadableRule}
          rows={4}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <textarea
          name="structuredFields"
          defaultValue={JSON.stringify(item.structuredFields, null, 2)}
          rows={12}
          className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-500">
            Skill tags (§13.5, comma-separated sk_… ids)
            <input
              name="relatedSkillIds"
              defaultValue={(item.relatedSkillIds ?? []).join(", ")}
              placeholder="sk_opening_bid_selection, sk_hand_evaluation"
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="text-xs text-neutral-500">
            Concept tags (comma-separated ids)
            <input
              name="relatedConceptIds"
              defaultValue={(item.relatedConceptIds ?? []).join(", ")}
              placeholder="bn_opening_bids"
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            />
          </label>
        </div>
        <textarea
          name="reviewerNotes"
          defaultValue={item.reviewerNotes}
          rows={2}
          placeholder="Notes"
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900">
          Save edit
        </button>
      </form>

      <div className="flex gap-2">
        {item.status === "active" ? (
          <form action={setItemStatus}>
            <input type="hidden" name="itemId" value={item.itemId} />
            <input type="hidden" name="status" value="deprecated" />
            <button type="submit" className="rounded border border-red-600 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
              Deprecate (exclude from future generations)
            </button>
          </form>
        ) : (
          <form action={setItemStatus}>
            <input type="hidden" name="itemId" value={item.itemId} />
            <input type="hidden" name="status" value="active" />
            <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Restore to active
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
