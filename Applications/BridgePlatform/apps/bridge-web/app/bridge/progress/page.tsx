import { BRIDGE_SKILLS } from "@bridge/progress";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { progressService } from "@/lib/progress";

const SIGNAL_STYLE: Record<string, string> = {
  correct_action: "bg-emerald-50 text-emerald-800",
  questionable_action: "bg-amber-50 text-amber-800",
  rule_mismatch: "bg-red-50 text-red-700",
  fallback_context: "bg-neutral-100 text-neutral-500",
  illegal_attempt: "bg-red-100 text-red-800",
};

export default async function ProgressPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Domain context is explicit even internally — the service refuses anything
  // but "bridge" (isolation invariant, LM doc §6).
  const summary = await progressService().getSummary(context.nexusUserId, context, "bridge");
  const skillName = (id: string) => BRIDGE_SKILLS.find((s) => s.skillId === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="text-xs text-neutral-500">
          domain: bridge · profile {summary.profile.domainProfileId} · system{" "}
          {summary.profile.activeLearningSystem} · level {summary.profile.bridgeExperienceLevel}.
          Evidence layer only — signals derived from your play, rebuildable from events.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {Object.entries(summary.totals).map(([type, n]) => (
          <div key={type} className={`rounded-lg p-3 text-center ${SIGNAL_STYLE[type] ?? ""}`}>
            <p className="text-2xl font-semibold">{n}</p>
            <p className="text-xs">{type.replace(/_/g, " ")}</p>
          </div>
        ))}
        {Object.keys(summary.totals).length === 0 && (
          <p className="col-span-4 text-sm text-neutral-500">
            No signals yet — play a board with a human seat on the Play page.
          </p>
        )}
      </section>

      {summary.bySkill.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">By skill</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1">Skill</th><th>Aligned</th><th>Mismatches</th><th>Observations</th>
              </tr>
            </thead>
            <tbody>
              {summary.bySkill.map((s) => (
                <tr key={s.skillId} className="border-t border-neutral-100">
                  <td className="py-1">{skillName(s.skillId)}</td>
                  <td>{s.correct}</td><td>{s.mismatches}</td><td>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {summary.patterns.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Recurring patterns
          </h2>
          <ul className="space-y-1 text-sm">
            {summary.patterns.map((p) => (
              <li key={p.patternId}>
                <span className="font-mono">{p.patternType}</span> — observed {p.observationCount}×
                ({p.status}) · skills: {p.relatedSkillIds.map(skillName).join(", ") || "—"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Recent signals
        </h2>
        <ul className="space-y-1 text-sm">
          {summary.recentSignals.map((s) => (
            <li key={s.progressSignalId} className="flex items-baseline gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs ${SIGNAL_STYLE[s.signalType]}`}>
                {s.signalType.replace(/_/g, " ")}
              </span>
              <span>
                {s.seat}: {s.evaluation.evaluatedAction}
                {s.evaluation.judgment === "not_system_aligned" &&
                  ` (system: ${s.evaluation.systemAction})`}
              </span>
              <Link
                href={`/bridge/play/${s.bridgeSessionId}?why=${s.evaluation.actionEventSeq - 1}`}
                className="text-xs text-emerald-700 hover:underline"
              >
                view
              </Link>
              <span className="text-xs text-neutral-400">confidence {s.confidence}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
