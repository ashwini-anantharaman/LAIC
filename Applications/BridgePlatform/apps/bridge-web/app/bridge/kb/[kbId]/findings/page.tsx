// Findings (KB tools §3): the two mechanical knowledge-quality detectors run
// over a seeded self-play pass — continuation gaps ("nothing answers this
// auction": the missing 2♣ follow-up class) and outcome anomalies ("fired but
// wrong": the missed-3NT / slam-off-two-aces class). Every finding reproduces
// live ("Deal this board") and files into the Suggestions queue in one click.

import {
  analyzeSelfPlay,
  createKbDecider,
  type KbPlayerConfig,
} from "@bridge/engine";
import { callLabel, type Call } from "@bridge/events";
import Link from "next/link";
import { createSuggestionAction } from "../../actions";
import { kbService } from "@/lib/kb";
import { dealFindingBoardAction } from "./actions";

const DEALS_CAP = 500;

const ANOMALY_EXPLAIN: Record<string, string> = {
  missed_game: "26+ combined HCP but the auction stopped below game.",
  slam_missing_aces: "A slam was bid while the declaring side held two or fewer aces.",
  no_fit: "A suit contract on six or fewer combined trumps — no 8-card fit.",
  game_values_passed_out: "The deal was passed out with 25+ combined HCP on one side.",
};

type Search = { deals?: string; seed?: string; set?: string };

function prefixGlyphs(prefix: string): string {
  if (prefix === "") return "(the opening seat)";
  return prefix
    .split("-")
    .map((c) => callLabel(c as Call))
    .join(" – ");
}

export default async function KbFindingsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<Search>;
}>) {
  const { kbId } = await params;
  const sp = await searchParams;
  const base = `/bridge/kb/${kbId}`;

  const deals = Math.min(DEALS_CAP, Math.max(1, Number(sp.deals) || 200));
  const seed = Number(sp.seed) || 7;

  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--color-invalid)]">
        This knowledge base has no working compile yet — add some items first.
      </div>
    );
  }
  if (compiled.packs.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-medium">Findings</h1>
        <p className="text-sm text-neutral-600">
          This knowledge base has no knowledge sets yet. Group items into a set on the{" "}
          <Link href={`${base}/sets`} className="underline underline-offset-4">
            Knowledge sets
          </Link>{" "}
          tab, then come back to hunt for gaps and anomalies.
        </p>
      </div>
    );
  }

  const largest = [...compiled.packs].sort((a, b) => b.itemIds.length - a.itemIds.length)[0]!;
  const pack = compiled.packs.find((p) => p.packId === sp.set) ?? largest;

  const config: KbPlayerConfig = {
    enabledPackIds: [pack.packId],
    settingOverrides: {},
    decisionPolicyId: "first_match",
  };
  createKbDecider({ compiled, player: config }); // surface a broken compile here
  const report = await analyzeSelfPlay({ compiled, player: config, deals, seed });

  const byKind = new Map<string, typeof report.anomalies>();
  for (const a of report.anomalies) {
    byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  }
  const kinds = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length);

  const stat = (value: string | number, label: string) => (
    <div className="min-w-24">
      <p className="text-2xl font-medium leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );

  const setHref = (packId: string) =>
    `${base}/findings?set=${encodeURIComponent(packId)}&deals=${deals}&seed=${seed}`;

  const dealButton = (dealSeed: number) => (
    <form action={dealFindingBoardAction}>
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="packId" value={pack.packId} />
      <input type="hidden" name="dealSeed" value={dealSeed} />
      <button
        type="submit"
        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-emerald-400"
        title="Re-deal this exact board against the same lineup and watch it live"
      >
        Deal this board
      </button>
    </form>
  );

  const suggestButton = (text: string) => (
    <form action={createSuggestionAction}>
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="text" value={text} />
      <button
        type="submit"
        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-emerald-400"
        title="File this finding into the Suggestions queue"
      >
        File as suggestion
      </button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Findings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Playing <b>{pack.name}</b> across {deals} random deals (seed {seed}), hunting for
          auctions nothing answers and results that look wrong on their face.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4">
        {stat(report.dealsPlayed, "deals played")}
        {stat(report.gaps.length, "missing continuations")}
        {stat(report.anomalies.length, "outcome anomalies")}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Knowledge set:</span>
        {compiled.packs.map((p) => (
          <Link
            key={p.packId}
            href={setHref(p.packId)}
            className={
              p.packId === pack.packId
                ? "rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                : "rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-emerald-400"
            }
          >
            {p.name}
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-1 text-sm font-medium">
          Missing continuations ({report.gaps.length})
        </h2>
        <p className="mb-2 text-xs text-neutral-500">
          Auction positions where the AI almost always fell through to the fallback — the
          knowledge has nothing to say there. Collapsed to the shortest gappy prefix.
        </p>
        {report.gaps.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No gappy auction prefixes across {deals} deals — every sampled position found a rule.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] rounded-lg border border-neutral-200 bg-[var(--card)]">
            {report.gaps.map((g) => (
              <li key={g.prefix} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="font-medium">
                  {prefixGlyphs(g.prefix)} <span className="text-neutral-400">→ ?</span>
                </span>
                <span className="text-xs text-neutral-500">
                  {g.samples} decision{g.samples === 1 ? "" : "s"} ·{" "}
                  {Math.round(g.fallbackShare * 100)}% fell through
                </span>
                <span className="ml-auto flex gap-2">
                  {dealButton(g.example.dealSeed)}
                  {suggestButton(
                    `[findings] Missing continuation: nothing answers the auction ${
                      g.prefix || "(opening)"
                    } — ${g.samples} sampled decisions, ${Math.round(
                      g.fallbackShare * 100,
                    )}% fell to the fallback (set ${pack.name}, example seed ${g.example.dealSeed}).`,
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-1 text-sm font-medium">
          Outcome anomalies ({report.anomalies.length})
        </h2>
        <p className="mb-2 text-xs text-neutral-500">
          Heuristic flags over completed deals — a flag is a lead for review, never a verdict.
        </p>
        {report.anomalies.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No outcome flags across {deals} deals with this set.
          </p>
        ) : (
          <div className="space-y-3">
            {kinds.map(([kind, list]) => (
              <details
                key={kind}
                className="rounded-lg border border-neutral-200 bg-[var(--card)] px-4 py-2.5"
                open={kinds.length <= 2}
              >
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium">{kind.replace(/_/g, " ")}</span>
                  <span className="text-xs text-neutral-400">{list.length}</span>
                  <span className="text-xs text-neutral-500">{ANOMALY_EXPLAIN[kind]}</span>
                </summary>
                <ul className="mt-2 space-y-2 border-t border-[var(--line)] pt-2">
                  {list.map((a, i) => (
                    <li
                      key={`${a.dealSeed}-${i}`}
                      className="flex flex-wrap items-center gap-3 text-sm"
                    >
                      <span className="text-neutral-700">{a.detail}</span>
                      <span className="text-xs text-neutral-400">
                        {prefixGlyphs(a.auction)}
                      </span>
                      <span className="ml-auto flex gap-2">
                        {dealButton(a.dealSeed)}
                        {suggestButton(
                          `[findings] ${a.kind} on seed ${a.dealSeed}: ${a.detail} Auction: ${
                            a.auction || "(passed out)"
                          } (set ${pack.name}).`,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Heuristic flags on random deals — a flag is a lead, not a verdict; raise the deal count
        for more coverage. See also{" "}
        <Link href={`${base}/coverage`} className="underline underline-offset-4">
          Coverage
        </Link>{" "}
        (rules that never fire) and the{" "}
        <Link href={`${base}/test`} className="underline underline-offset-4">
          decision bench
        </Link>
        .
      </p>
    </div>
  );
}
