import { defaultSettingValues } from "@bridge/config";
import {
  generateConstrainedBoards,
  specFromTeachingScope,
  verifyBoards,
  type DealGenerationReport,
} from "@bridge/dealer";
import { rankLabel, type Card } from "@bridge/events";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { latestPackage, sessionService } from "@/lib/sessions";
import {
  createBoardShareLink,
  importBoard,
  playSavedBoard,
  resumePositionSnapshot,
} from "../play/actions";

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
}: Readonly<{
  searchParams: Promise<{ seed?: string; count?: string; scopeId?: string; shared?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const isAdmin = canAccessAdminArea(context);
  const { seed, count, scopeId, shared } = await searchParams;

  const sessions = sessionService();
  const savedBoards = await sessions.listBoards(context);
  const snapshots = await sessions.listSnapshots(context);

  const service = await profileService();
  const scopes = await service.listScopes(context);
  const scopeRec = scopes.find((s) => s.teachingScopeId === (scopeId ?? "ts_system_bn_level1")) ?? scopes[0];

  let report: DealGenerationReport | null = null;
  let violations = 0;
  if (isAdmin && seed && scopeRec) {
    const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const ctx = { pkg, values: defaultSettingValues(pkg.settings) };
    const spec = specFromTeachingScope(
      scopeRec.teachingScopeId,
      { scopeId: scopeRec.teachingScopeId, evaluatorFilter: scopeRec.evaluatorFilter, targetConceptIds: scopeRec.targetConceptIds },
      { seed: Number(seed), count: Math.min(Number(count) || 10, 50), dealer: "S", namePrefix: scopeRec.name },
    );
    report = generateConstrainedBoards(spec, ctx);
    violations = verifyBoards(report.boards, spec, ctx).length;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Boards & Deals</h1>

      {scopeRec && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-1 font-medium">{scopeRec.name}</h2>
          <p className="text-sm text-neutral-600">
            {scopeRec.description ?? "Coach-defined teaching scope."} Levels are
            coach judgment — manage yours on the{" "}
            <Link href="/bridge/players" className="text-emerald-700 hover:underline">
              Players page
            </Link>
            .
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

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">Import a board</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Paste PBN or LIN. Any recorded auction/play is imported as history —
          without decision traces, since those calls weren’t made at this table.
        </p>
        <form action={importBoard} className="space-y-2">
          <textarea
            name="text"
            rows={5}
            required
            placeholder={'[Dealer "S"]\n[Vulnerable "None"]\n[Deal "S:AKQ2.876... "]\n…'}
            className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
          />
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            Import & open at the table
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 font-medium">Board library</h2>
        {shared && (
          <p className="mb-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Share link created:{" "}
            <Link href={`/shared/${shared}`} className="font-mono underline">
              /shared/{shared}
            </Link>{" "}
            — anyone with this link can view the board.
          </p>
        )}
        {savedBoards.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No saved boards yet — save one from the table after a deal you want to keep.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {savedBoards.map((b) => (
              <li key={b.boardId} className="rounded border border-neutral-200 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">
                    {b.name} <span className="font-normal text-neutral-500">— dealer {b.board.dealer}, vul {b.board.vul}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <form action={playSavedBoard}>
                      <input type="hidden" name="boardId" value={b.boardId} />
                      <input type="hidden" name="humanSeat" value="S" />
                      <button type="submit" className="rounded bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-800">
                        Play as South
                      </button>
                    </form>
                    <form action={createBoardShareLink}>
                      <input type="hidden" name="boardId" value={b.boardId} />
                      <button type="submit" className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50">
                        Share link
                      </button>
                    </form>
                  </div>
                </div>
                <div className="font-mono">
                  {(["N", "E", "S", "W"] as const).map((seat) => (
                    <p key={seat}>
                      {seat}: {handString(b.board.hands[seat])}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {snapshots.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-1 font-medium">Position snapshots</h2>
          <p className="mb-2 text-sm text-neutral-600">
            Mid-board positions saved from the table. Resuming replays the exact
            events under the exact package version they were made with.
          </p>
          <ul className="space-y-2 text-xs">
            {snapshots.map((s) => (
              <li key={s.snapshotId} className="flex items-center justify-between rounded border border-neutral-200 p-2">
                <p>
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-neutral-500">
                    — {s.events.length} events · {s.packageRef.packageId}@{s.packageRef.version}
                  </span>
                </p>
                <form action={resumePositionSnapshot}>
                  <input type="hidden" name="snapshotId" value={s.snapshotId} />
                  <input type="hidden" name="humanSeat" value="S" />
                  <button type="submit" className="rounded bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-800">
                    Resume as South
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
