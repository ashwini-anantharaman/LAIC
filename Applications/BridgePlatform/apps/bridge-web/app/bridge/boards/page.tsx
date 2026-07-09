import { defaultSettingValues } from "@bridge/config";
import {
  generateConstrainedBoards,
  specFromTeachingScope,
  verifyBoards,
  type DealGenerationReport,
  type TeachingScopeFields,
} from "@bridge/dealer";
import { rankLabel, type Card } from "@bridge/events";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { latestPublishedPackage } from "@/lib/sessions";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const handString = (hand: Card[]): string =>
  (["S", "H", "D", "C"] as const)
    .map(
      (s) =>
        GLYPH[s] +
        (hand
          .filter((c) => c.suit === s)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank))
          .join("") || "—"),
    )
    .join(" ");

export default async function BoardsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ seed?: string; count?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const isAdmin = canAccessAdminArea(context);
  const { seed, count } = await searchParams;

  const scopeItem = await knowledgeStore().getItem("ki_bn_scope_level1");

  let report: DealGenerationReport | null = null;
  let violations = 0;
  if (isAdmin && seed && scopeItem) {
    const pkg = await latestPublishedPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const ctx = { pkg, values: defaultSettingValues(pkg.settings) };
    const spec = specFromTeachingScope(
      scopeItem.itemId,
      scopeItem.structuredFields.scope as TeachingScopeFields,
      {
        seed: Number(seed),
        count: Math.min(Number(count) || 10, 50),
        dealer: "S",
        namePrefix: "L1",
      },
    );
    report = generateConstrainedBoards(spec, ctx);
    violations = verifyBoards(report.boards, spec, ctx).length;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Boards & Deals</h1>

      {scopeItem && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-1 font-medium">{scopeItem.title}</h2>
          <p className="text-sm text-neutral-600">{scopeItem.humanReadableRule}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Teaching scope{" "}
            <Link
              href={`/bridge/admin/knowledge/${scopeItem.itemId}`}
              className="text-emerald-700 hover:underline"
            >
              {scopeItem.itemId}
            </Link>{" "}
            ({scopeItem.status}) — used by “Practice at my level” on the Play page.
          </p>
        </section>
      )}

      {isAdmin && (
        <form className="flex items-center gap-2 rounded-lg border border-neutral-200 p-4">
          <label className="text-sm text-neutral-600">Generate Level-1 set — seed</label>
          <input name="seed" type="number" defaultValue={seed ?? 7} className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <label className="text-sm text-neutral-600">count</label>
          <input name="count" type="number" defaultValue={count ?? 10} className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            Generate
          </button>
          <span className="text-xs text-neutral-500">Deterministic per (seed, spec, package version).</span>
        </form>
      )}

      {report && (
        <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <p className="text-sm">
            <span className="font-medium">{report.boards.length} boards</span> from{" "}
            {report.attempts} candidates — acceptance rate{" "}
            {(report.acceptanceRate * 100).toFixed(1)}% · re-verified violations:{" "}
            <span className={violations === 0 ? "text-emerald-700" : "text-red-700"}>{violations}</span>{" "}
            · package {report.packageRef?.packageId}@{report.packageRef?.version}
          </p>
          <ul className="space-y-2 text-xs">
            {report.boards.map((b) => (
              <li key={b.name} className="rounded border border-neutral-200 p-2 font-mono">
                <p className="mb-1 font-sans font-medium">{b.name} — dealer {b.dealer}</p>
                {(["N", "E", "S", "W"] as const).map((seat) => (
                  <p key={seat}>
                    {seat}: {handString(b.hands[seat])}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isAdmin && (
        <p className="text-sm text-neutral-500">
          Saved boards, PBN/LIN import, and shared board libraries land in Phase 7.
        </p>
      )}
    </div>
  );
}
