import { resolveGap } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";

const SEVERITY_STYLE: Record<string, string> = {
  blocking: "bg-red-50 text-red-700",
  important: "bg-amber-50 text-amber-800",
  minor: "bg-neutral-100 text-neutral-600",
};

export default async function GapsPage() {
  const gaps = await knowledgeStore().listGaps();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Gap registry</h1>
      <p className="text-sm text-neutral-500">
        Unresolved ambiguities, deviations, and level decisions — explicit,
        never silently filled (Bridge plan §12.6).
      </p>
      <ul className="space-y-2">
        {gaps.map((g) => (
          <li key={g.gapId} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{g.gapId}</span>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${SEVERITY_STYLE[g.severity]}`}>
                {g.severity} · {g.resolutionStatus}
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-600">{g.description}</p>
            {g.expertResolution && (
              <p className="mt-1 text-sm text-emerald-800">Resolution: {g.expertResolution}</p>
            )}
            {(g.resolutionStatus === "open" ||
              g.resolutionStatus === "expert_decision_needed") && (
              <form action={resolveGap} className="mt-2 flex gap-2">
                <input type="hidden" name="gapId" value={g.gapId} />
                <input type="hidden" name="resolutionStatus" value="resolved" />
                <input
                  name="expertResolution"
                  placeholder="Expert resolution…"
                  required
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                />
                <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800">
                  Resolve
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
