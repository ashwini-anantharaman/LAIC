import { canAccessAdminArea } from "@bridge/nexus-client";
import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import { notFound, redirect } from "next/navigation";
import { TabLink } from "@/components/kb/TabLink";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";

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

  const [items, suggestions, players, compiled, derivation] = await Promise.all([
    store.listItemsForKb(kbId),
    store.listSuggestionsForKb(kbId),
    store.listPlayersForKb(kbId),
    kbService().liveCompile(kbId),
    kbService().derivationStatus(kbId),
  ]);

  const byStatus = (s: string) => items.filter((i) => i.status === s).length;
  const openSuggestions = suggestions.filter((s) => s.status === "open").length;

  // Drills count for the health strip. We show only the COUNT here, never the
  // pass-rate: running every drill means a decideBid per drill, and the layout
  // renders on every KB page — too heavy for a shell. The pass-rate lives on
  // the Drills page, which runs the suite once, on demand. The library table
  // may not be provisioned on every backend, so this is best-effort.
  let drillCount = 0;
  try {
    drillCount = (await libraryStore().listEntries("drill")).filter((e) => e.kbId === kbId).length;
  } catch {
    drillCount = 0;
  }
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
          {derivation.derived && <> · derived</>}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-medium">{kb.name}</h1>
          <p className="text-xs text-neutral-500">
            {kb.latestVersionNumber ? (
              <>
                <span title="Releases are frozen, numbered publications of the whole KB">
                  release <span className="font-medium">v{kb.latestVersionNumber}</span>
                </span>{" "}
                ·{" "}
              </>
            ) : null}
            {compiled ? (
              <span title="The working compile updates on every save — what new boards play from">
                working compile <span className="font-medium">v{compiled.version}</span>
              </span>
            ) : (
              "no compile yet"
            )}
          </p>
        </div>

        {derivation.derived && derivation.upgradeAvailable && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-[color:var(--color-draft)]">
            The master this KB was derived from has a newer published version —
            see the <a href={`${base}/versions`} className="font-medium underline">Versions</a> tab.
          </div>
        )}

        {kb.lastCompileError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--color-invalid)]">
            <p className="font-medium">
              The latest edit doesn&apos;t compile — the previous version is still serving.
            </p>
            <p className="mt-1 font-mono text-xs">{kb.lastCompileError.message}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-3">
          {stat(items.length, "knowledge items")}
          {stat(byStatus("draft"), "draft")}
          {stat(byStatus("approved"), "approved")}
          {stat(compiled?.packs.length ?? 0, "knowledge sets")}
          {stat(
            players.length ? `${validPlayers}/${players.length}` : "0",
            "complete players",
          )}
          {stat(openSuggestions, "open flags")}
          {stat(compiled?.settings.length ?? 0, "settings")}
          {drillCount > 0 && stat(drillCount, "drills")}
        </div>

        <nav className="mt-6 flex flex-wrap gap-5 border-b border-[var(--line)]">
          <TabLink href={base} exact label="Overview" />
          <TabLink href={`${base}/items`} label="Master" />
          <TabLink href={`${base}/test`} label="Test" />
          <TabLink href={`${base}/auction-rules`} label="Auction rules" />
          <TabLink href={`${base}/drills`} label="Drills" />
          <TabLink href={`${base}/coverage`} label="Coverage" />
          <TabLink href={`${base}/findings`} label="Findings" />
          <TabLink href={`${base}/source-audit`} label="Source audit" />
          <TabLink href={`${base}/benchmark`} label="Benchmark" />
          <TabLink href={`${base}/sets`} label="Knowledge sets" />
          <TabLink href={`${base}/sources`} label="Sources" />
          <TabLink href={`${base}/versions`} label="Versions" />
          <TabLink href={`${base}/suggestions`} label="Suggestions" />
          <TabLink href={`${base}/activity`} label="Activity" />
        </nav>
      </header>
      {children}
    </div>
  );
}
