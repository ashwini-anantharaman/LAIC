import { canAccessAdminArea } from "@bridge/nexus-client";
import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import { notFound, redirect } from "next/navigation";
import { TabLink } from "@/components/kb/TabLink";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";

/**
 * The KB dashboard shell (spec §6): health strip + tabs. The health strip is
 * the fellow's instrument panel — live compile state (incl. the last-good
 * divergence banner), item counts by status, player validity, suggestions.
 */
export default async function KbLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ kbId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  await ensureSeeds();

  const { kbId } = await params;
  const store = kbStore();
  const kb = await store.getKb(kbId);
  if (!kb) notFound();

  const [items, suggestions, players, compiled] = await Promise.all([
    store.listItemsForKb(kbId),
    store.listSuggestionsForKb(kbId),
    store.listPlayersForKb(kbId),
    kbService().liveCompile(kbId),
  ]);

  const byStatus = (s: string) => items.filter((i) => i.status === s).length;
  const openSuggestions = suggestions.filter((s) => s.status === "open").length;
  const validPlayers = compiled
    ? players.filter((p) => playerIsValid(validatePlayerStatic(compiled, p))).length
    : 0;

  const base = `/bridge/kb/${kbId}`;
  const stat = (value: string | number, label: string) => (
    <div className="min-w-20">
      <p className="text-lg font-medium leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">
          Knowledge base · {kb.systemLabel}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-medium">{kb.name}</h1>
          <p className="text-xs text-neutral-500">
            {compiled ? (
              <>
                live compile <span className="font-medium">v{compiled.version}</span>
              </>
            ) : (
              "no compile yet"
            )}
          </p>
        </div>

        {kb.lastCompileError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--color-invalid)]">
            <p className="font-medium">
              The latest edit doesn&apos;t compile — the previous version is still serving.
            </p>
            <p className="mt-1 font-mono text-xs">{kb.lastCompileError.message}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-3">
          {stat(items.length, "capabilities")}
          {stat(byStatus("draft"), "draft")}
          {stat(byStatus("approved"), "approved")}
          {stat(compiled?.packs.length ?? 0, "packs")}
          {stat(
            players.length ? `${validPlayers}/${players.length}` : "0",
            "complete players",
          )}
          {stat(openSuggestions, "open flags")}
          {stat(compiled?.settings.length ?? 0, "settings")}
        </div>

        <nav className="mt-6 flex flex-wrap gap-5 border-b border-[var(--line)]">
          <TabLink href={base} exact label="Overview" />
          <TabLink href={`${base}/items`} label="Capabilities" />
          <TabLink href={`${base}/ladder`} label="Ladder" />
          <TabLink href={`${base}/sources`} label="Sources" />
          <TabLink href={`${base}/players`} label="Players" />
          <TabLink href={`${base}/suggestions`} label="Suggestions" />
          <TabLink href={`${base}/activity`} label="Activity" />
        </nav>
      </header>
      {children}
    </div>
  );
}
