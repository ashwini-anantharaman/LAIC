import { stubDisplayName } from "@bridge/nexus-client";
import type { KbPlayer, KnowledgeBase } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChipRow, UnderlineTabs } from "@/components/ChipTabs";
import { ValidityBadge } from "@/components/kb/badges";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { suggestPlayersAction } from "../kb/actions";
import { createRungPlayerAction, tryPlayerAction } from "./actions";

/** Players area (2026-07-16 rework): Configured (per-system, per-creator
 *  facets, one-click rung creation) | AI (reserved for BEN). */
export default async function PlayersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string; kb?: string; by?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();
  const { tab, kb: kbParam, by } = await searchParams;

  const store = kbStore();
  const kbs = await store.listKbs();
  const withPlayers: { kb: KnowledgeBase; players: KbPlayer[] }[] = [];
  for (const kb of kbs) {
    withPlayers.push({ kb, players: await store.listPlayersForKb(kb.kbId) });
  }

  const aiTab = tab === "ai";
  const activeKb =
    withPlayers.find(({ kb }) => kb.kbId === kbParam) ?? withPlayers[0];

  const myId = context.nexusUserId;
  const ownerOf = (p: KbPlayer) => p.ownerId ?? p.ownerType;
  const creators = activeKb ? [...new Set(activeKb.players.map(ownerOf))] : [];
  const others = creators.filter((c) => c !== myId);
  const creatorLabel = (id: string) =>
    id === myId ? "Mine" : (stubDisplayName(id) ?? (id === "system" ? "System" : id));
  const myCount = activeKb ? activeKb.players.filter((p) => ownerOf(p) === myId).length : 0;

  // Creator facet is a MULTI-select: `by` carries a comma-separated set of
  // creator ids; an empty set (`by=all`) means Everyone. Default: just Mine
  // (falling back to Everyone when I have no players here).
  const requested = (by ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = requested.filter((id) => creators.includes(id));
  const selected = requested.includes("all")
    ? []
    : chosen.length
      ? chosen
      : myCount > 0
        ? [myId]
        : [];
  const selectedSet = new Set(selected);
  const visible = (activeKb?.players ?? []).filter(
    (p) => selectedSet.size === 0 || selectedSet.has(ownerOf(p)),
  );

  const compiled = activeKb ? await kbService().liveCompile(activeKb.kb.kbId) : null;
  const packById = new Map((compiled?.packs ?? []).map((p) => [p.packId, p]));
  const sets = [...(compiled?.packs ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const playersHref = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/bridge/players?${s}` : "/bridge/players";
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Bridge</p>
        <h1 className="mt-1 text-3xl font-medium">Players</h1>
      </header>

      <UnderlineTabs
        tabs={[
          { label: "Configured players", href: playersHref({}), active: !aiTab },
          { label: "AI players", href: playersHref({ tab: "ai" }), active: aiTab },
        ]}
      />

      {aiTab ? (
        <section className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="font-serif text-lg text-neutral-600">Neural players arrive here.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            This tab is reserved for engine-backed players (BEN). They won&apos;t be assembled
            from knowledge packs — they play from a trained model, and the platform will label
            their decisions accordingly.
          </p>
          <span className="mt-4 inline-block rounded-full border border-neutral-300 px-3 py-1 text-xs uppercase tracking-wide text-neutral-400">
            coming later
          </span>
        </section>
      ) : !activeKb ? (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge bases yet — players are assembled from a knowledge base.{" "}
          <Link href="/bridge/kb" className="text-emerald-700 underline-offset-4 hover:underline">
            Create one in the workspace.
          </Link>
        </p>
      ) : (
        <>
          {/* System facet (SAYC, 2/1, …) */}
          <div className="mt-6">
            <ChipRow
              tabs={withPlayers.map(({ kb, players }) => ({
                label: kb.systemLabel,
                href: playersHref({ kb: kb.kbId }),
                active: kb.kbId === activeKb.kb.kbId,
                count: players.length,
              }))}
            />
          </div>

          {/* Creator facet — multi-select chips: tap to add/remove a creator;
              Everyone clears the selection. */}
          {activeKb.players.length > 0 &&
            (() => {
              const byHref = (ids: string[]) =>
                playersHref({ kb: activeKb.kb.kbId, by: ids.length ? ids.join(",") : "all" });
              const toggleHref = (id: string) =>
                byHref(
                  selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id],
                );
              return (
                <div className="mt-3">
                  <ChipRow
                    tabs={[
                      {
                        label: "Everyone",
                        href: byHref([]),
                        active: selectedSet.size === 0,
                        count: activeKb.players.length,
                      },
                      ...(myCount > 0
                        ? [
                            {
                              label: "Mine",
                              href: toggleHref(myId),
                              active: selectedSet.has(myId),
                              count: myCount,
                            },
                          ]
                        : []),
                      ...others.map((c) => ({
                        label: creatorLabel(c),
                        href: toggleHref(c),
                        active: selectedSet.has(c),
                        count: activeKb.players.filter((p) => ownerOf(p) === c).length,
                      })),
                    ]}
                  />
                </div>
              );
            })()}

          {/* Make a player: one click per set, the wizard, or by hand */}
          <section className="mt-6 rounded-lg border border-neutral-200 bg-[var(--card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">New player</p>
              <div className="flex flex-wrap gap-2">
                <form action={suggestPlayersAction}>
                  <input type="hidden" name="kbId" value={activeKb.kb.kbId} />
                  <button
                    type="submit"
                    disabled={!compiled}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    Suggest minimal players
                  </button>
                </form>
                <Link
                  href={`/bridge/kb/${activeKb.kb.kbId}/players/new`}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-500 hover:bg-emerald-50"
                >
                  Build by hand
                </Link>
              </div>
            </div>
            {sets.length > 0 && (
              <>
                <p className="mt-3 text-xs text-neutral-500">
                  Or one click — choose the {activeKb.kb.systemLabel} knowledge set it plays
                  from; name, validation and report happen automatically.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sets.map((pack) => (
                    <form key={pack.packId} action={createRungPlayerAction}>
                      <input type="hidden" name="kbId" value={activeKb.kb.kbId} />
                      <input type="hidden" name="packId" value={pack.packId} />
                      <button
                        type="submit"
                        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-500 hover:bg-emerald-50"
                      >
                        {pack.name}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* The roster */}
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {visible.map((p) => (
              <li key={p.playerId} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/bridge/kb/${p.kbId}/players/${p.playerId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <ValidityBadge status={p.validationStatus} />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {p.enabledPackIds
                    .map((id) => packById.get(id)?.name ?? id)
                    .join(" + ") || "no packs"}
                  {" · "}
                  {p.decisionPolicyId.replace("_", " ")}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  by {creatorLabel(p.ownerId ?? p.ownerType)}
                </p>
                <div className="mt-3 flex gap-2">
                  <form action={tryPlayerAction}>
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <button
                      type="submit"
                      className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Play
                    </button>
                  </form>
                  <form action={tryPlayerAction}>
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <input type="hidden" name="watch" value="1" />
                    <button
                      type="submit"
                      className="rounded border border-neutral-300 px-3 py-1 text-xs hover:border-emerald-400"
                    >
                      Watch 4 copies
                    </button>
                  </form>
                  <Link
                    href={`/bridge/kb/${p.kbId}/players/${p.playerId}`}
                    className="rounded border border-neutral-300 px-3 py-1 text-xs hover:border-emerald-400"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 sm:col-span-2">
                No players here yet — create one from a knowledge set above.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
