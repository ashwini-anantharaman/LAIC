import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createLevelPracticeSession,
  createPracticeSession,
  saveTableProfile,
} from "@/app/bridge/play/actions";
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
  const me = await service.getUserProfile(context);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Play & Practice</h1>

      <form
        action={createPracticeSession}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-4"
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
        <select
          name="humanSeat"
          defaultValue={me?.preferredSeat ?? "S"}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="S">Sit South</option>
          <option value="N">Sit North (dealer on seeded boards)</option>
          <option value="E">Sit East</option>
          <option value="W">Sit West</option>
          <option value="watch">Watch 4 AI seats</option>
        </select>
        <button
          type="submit"
          className="whitespace-nowrap rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
        >
          Deal a board
        </button>
        <span className="text-xs text-neutral-500">
          Latest Beginner Natural package version.
        </span>
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-neutral-500">
            Per-seat AIs — sit different players at each seat (NS one system, EW another…)
          </summary>
          <div className="mt-2 flex flex-wrap gap-3">
            {(["N", "E", "S", "W"] as const).map((seat) => (
              <label key={seat} className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-800 text-[11px] font-bold text-emerald-50">
                  {seat}
                </span>
                <select
                  name={`profile_${seat}`}
                  className="rounded border border-neutral-300 px-1.5 py-1 text-xs"
                >
                  <option value="">table default</option>
                  {profiles.map((p) => (
                    <option key={p.aiPlayerProfileId} value={p.aiPlayerProfileId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <span className="self-center text-[11px] text-neutral-400">
              Your seat ignores its AI pick; every AI decision still cites its own profile’s rules.
            </span>
          </div>
        </details>
      </form>

      <form
        action={createLevelPracticeSession}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/40 p-4"
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
          className="whitespace-nowrap rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
        >
          Practice at this level
        </button>
        <span className="text-xs text-neutral-600">
          Levels are coach judgment, not system truth — customize scopes on the
          Players page. You deal; boards are evaluator-filtered to the scope.
        </span>
      </form>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-neutral-500">
          You at the table
        </h2>
        <form action={saveTableProfile} className="flex flex-wrap items-center gap-2">
          <input
            name="displayNameAtTable"
            defaultValue={me?.displayNameAtTable ?? ""}
            placeholder="Name shown at your seat"
            className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <select
            name="preferredSeat"
            defaultValue={me?.preferredSeat ?? ""}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">No preferred seat</option>
            <option value="N">Prefer North</option>
            <option value="E">Prefer East</option>
            <option value="S">Prefer South</option>
            <option value="W">Prefer West</option>
          </select>
          <select
            name="preferredFeedbackMode"
            defaultValue={me?.preferredFeedbackMode ?? "full_trace"}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="full_trace">Show every AI decision + trace</option>
            <option value="hints_only">Show decisions, hide rule traces</option>
            <option value="minimal">Minimal — decisions only after the board</option>
          </select>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Save
          </button>
        </form>
      </section>

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
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-neutral-200 bg-[#fffefb] px-3 py-2 text-sm shadow-sm hover:border-emerald-400 hover:shadow"
              >
                <span className="font-medium">{s.board.name}</span>
                <span
                  className={
                    s.status === "completed"
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                      : "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                  }
                >
                  {s.status === "completed" ? "completed" : "in play"}
                </span>
                <span className="text-xs text-neutral-400">
                  {s.packageRef.packageId}@{s.packageRef.version} · by {s.createdBy} ·{" "}
                  <span className="font-mono">{s.bridgeSessionId}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
