import Link from "next/link";
import { redirect } from "next/navigation";
import { createLevelPracticeSession, createPracticeSession } from "@/app/bridge/play/actions";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { sessionService } from "@/lib/sessions";

export default async function PlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const sessions = (await sessionService().listSessions(context)).slice().reverse();
  const service = await profileService();
  const profiles = await service.listProfiles(context);
  const scopes = await service.listScopes(context);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Play & Practice</h1>

      <form
        action={createPracticeSession}
        className="flex items-center gap-2 rounded-lg border border-neutral-200 p-4"
      >
        <label className="text-sm text-neutral-600">Deal seed</label>
        <input
          name="seed"
          type="number"
          defaultValue={1}
          className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select name="profileId" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {profiles.map((p) => (
            <option key={p.aiPlayerProfileId} value={p.aiPlayerProfileId}>
              AI: {p.name}
            </option>
          ))}
        </select>
        <select name="humanSeat" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          <option value="S">Sit South</option>
          <option value="N">Sit North (dealer on seeded boards)</option>
          <option value="E">Sit East</option>
          <option value="W">Sit West</option>
          <option value="watch">Watch 4 AI seats</option>
        </select>
        <button
          type="submit"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Deal a board
        </button>
        <span className="text-xs text-neutral-500">
          Latest published Beginner Natural package.
        </span>
      </form>

      <form
        action={createLevelPracticeSession}
        className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/40 p-4"
      >
        <select name="scopeId" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {scopes.map((s) => (
            <option key={s.teachingScopeId} value={s.teachingScopeId}>
              {s.name}
              {s.ownerType === "system" ? " (suggested default)" : " (yours)"}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Practice at this level
        </button>
        <span className="text-xs text-neutral-600">
          Levels are coach judgment, not system truth — customize scopes on the
          Players page. You deal; boards are evaluator-filtered to the scope.
        </span>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Sessions in your scope
        </h2>
        {sessions.length === 0 && (
          <p className="text-sm text-neutral-500">No sessions yet — deal a board above.</p>
        )}
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.bridgeSessionId}>
              <Link
                href={`/bridge/play/${s.bridgeSessionId}`}
                className="block rounded border border-neutral-200 px-3 py-2 text-sm hover:border-emerald-400"
              >
                <span className="font-mono">{s.bridgeSessionId}</span> · {s.board.name} ·{" "}
                <span className={s.status === "completed" ? "text-emerald-700" : "text-amber-700"}>
                  {s.status}
                </span>{" "}
                · {s.packageRef.packageId}@{s.packageRef.version} · by {s.createdBy}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
