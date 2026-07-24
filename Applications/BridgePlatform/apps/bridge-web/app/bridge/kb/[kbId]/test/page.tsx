// Decision bench (KB tools §1): a shareable, GET-driven page — type a hand and
// an auction and see the exact call the knowledge makes, phrased from the
// working compile's rule labels and provenance (mirrors the table's trace
// drawer, but never touches a session). Bidding only; card play needs a board.

import type { SettingValue } from "@bridge/config";
import { callLabel, type Card, type Seat, type Vul } from "@bridge/events";
import {
  createKbDecider,
  initialState,
  type GameState,
  type KbPlayerConfig,
} from "@bridge/engine";
import Link from "next/link";
import {
  becauseClause,
  buildRuleIndex,
  humanReason,
  ruleLabel,
} from "@/components/table/decisionText";
import { kbService, kbStore } from "@/lib/kb";
import { parseAuction, parseHand } from "@/lib/testBench";

const SEATS: Seat[] = ["N", "E", "S", "W"];
const VULS: { value: Vul; label: string }[] = [
  { value: "none", label: "None" },
  { value: "ns", label: "N-S" },
  { value: "ew", label: "E-W" },
  { value: "both", label: "Both" },
];

type Search = {
  hand?: string;
  auction?: string;
  dealer?: string;
  vul?: string;
  player?: string;
};

export default async function KbTestPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<Search>;
}>) {
  const { kbId } = await params;
  const sp = await searchParams;
  const base = `/bridge/kb/${kbId}`;

  const handInput = sp.hand ?? "";
  const auctionInput = sp.auction ?? "";
  const dealer: Seat = (SEATS as string[]).includes(sp.dealer ?? "") ? (sp.dealer as Seat) : "N";
  const vul: Vul = VULS.some((v) => v.value === sp.vul) ? (sp.vul as Vul) : "none";
  const playerSel = sp.player ?? "defaults";
  const submitted = Boolean(sp.hand !== undefined);

  const [compiled, players] = await Promise.all([
    kbService().liveCompile(kbId),
    kbStore().listPlayersForKb(kbId),
  ]);

  // Build the results block (or an error) when the form was submitted.
  let result: React.ReactNode = null;
  if (submitted) {
    if (!compiled) {
      result = errorBox("This knowledge base has no working compile yet — add some items first.");
    } else {
      const handParsed = parseHand(handInput);
      const auctionParsed = parseAuction(auctionInput, dealer);
      if ("error" in handParsed) {
        result = errorBox(`Hand: ${handParsed.error}`);
      } else if ("error" in auctionParsed) {
        result = errorBox(`Auction: ${auctionParsed.error}`);
      } else {
        const { toAct, auction } = auctionParsed;
        const chosen = playerSel === "defaults" ? null : players.find((p) => p.playerId === playerSel);
        const config: KbPlayerConfig = chosen
          ? {
              enabledPackIds: chosen.enabledPackIds,
              settingOverrides: chosen.settingOverrides,
              decisionPolicyId: chosen.decisionPolicyId,
              levelOrdinal: compiled.packs.find((p) => p.levelId === chosen.levelId)?.ordinal,
            }
          : { enabledPackIds: [], settingOverrides: {}, decisionPolicyId: "first_match" };

        const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
        hands[toAct] = handParsed.hand;
        const state: GameState = initialState("bench", dealer, vul, hands);
        state.auction = auction;
        state.turn = toAct;

        const decider = createKbDecider({ compiled, player: config });
        const decision = await decider.decideBid(state, toAct);

        const index = buildRuleIndex(compiled);
        const matched = decision.matchedRuleId ? index.get(decision.matchedRuleId) : undefined;
        const itemId = matched?.rule.provenance.itemId ?? decision.matchedRuleId?.split(".")[0];
        const values: Record<string, SettingValue> = {
          ...compiled.defaults,
          ...Object.fromEntries(decision.citedSettings.map((s) => [s.key, s.value])),
        };
        const floor = decision.reason.startsWith("ENGINE FLOOR");

        result = (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-[var(--card)] p-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  {toAct} to act
                </p>
                {floor ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-invalid)]">
                    engine floor
                  </span>
                ) : decision.fallback ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-draft)]">
                    fallback item
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-5xl font-semibold tracking-tight">
                {callLabel(decision.action)}
              </p>

              <p className="mt-3 text-sm text-neutral-700">
                {matched && matched.kind === "fallback" ? (
                  <>
                    No agreement covered this — the fallback item{" "}
                    <b>&ldquo;{matched.rule.provenance.itemTitle}&rdquo;</b> chose{" "}
                    {callLabel(decision.action)}.
                  </>
                ) : matched && matched.kind === "forcing" ? (
                  <>
                    <b>{callLabel(decision.action)}</b> — pass wasn&apos;t available —{" "}
                    {matched.rule.label}.
                  </>
                ) : matched ? (
                  <>
                    <b>{callLabel(decision.action)}</b> — {ruleLabel(matched)} (from &ldquo;
                    {matched.rule.provenance.itemTitle}&rdquo;): {becauseClause(matched, values)}.
                  </>
                ) : (
                  <>
                    <b>{callLabel(decision.action)}</b> — {decision.reason}
                  </>
                )}
                {decision.facts.hcp !== undefined && (
                  <>
                    {" "}
                    Held: {decision.facts.hcp} HCP
                    {decision.facts.shape && `, ${decision.facts.shape.join("=")} shape`}.
                  </>
                )}
                {itemId && !floor && (
                  <>
                    {" · "}
                    <Link
                      href={`${base}/items/${itemId}?mode=edit`}
                      className="font-medium text-emerald-700 underline-offset-4 hover:underline"
                    >
                      open the item →
                    </Link>
                  </>
                )}
              </p>

              {decision.citedSettings.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Settings consulted:{" "}
                  {decision.citedSettings
                    .map((s) => `${s.label} = ${JSON.stringify(s.value)}`)
                    .join("; ")}
                </p>
              )}

              <p className="mt-3 text-xs">
                <Link
                  href={`${base}/auction-rules?${new URLSearchParams({
                    auction: auctionInput,
                    hand: handInput,
                    dealer,
                    vul,
                  }).toString()}`}
                  className="font-medium text-emerald-700 underline-offset-4 hover:underline"
                >
                  see every rule at this point →
                </Link>
              </p>
            </div>

            {decision.trace.length > 0 && (
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <p className="border-b border-neutral-200 bg-neutral-100/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Rules considered ({decision.trace.length})
                  <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
                    click a rule to edit it
                  </span>
                </p>
                <ul className="divide-y divide-neutral-100 bg-white">
                  {decision.trace.map((t, i) => {
                    const info = index.get(t.ruleId);
                    const traceItemId = info?.rule.provenance.itemId ?? t.ruleId.split(".")[0];
                    return (
                      <li
                        key={i}
                        className={t.matched ? "bg-emerald-50/70" : i % 2 ? "bg-neutral-50/60" : ""}
                      >
                        <Link
                          href={`${base}/items/${traceItemId}?mode=edit`}
                          title={`Edit this rule (${t.ruleId})`}
                          className="flex items-baseline gap-1.5 px-3 py-1.5 text-xs hover:bg-emerald-50"
                        >
                          <span
                            aria-hidden
                            className={`w-3 flex-none text-center ${t.matched ? "font-bold text-emerald-700" : "text-neutral-300"}`}
                          >
                            {t.matched ? "✓" : "·"}
                          </span>
                          <span
                            className={`flex-none ${t.matched ? "font-medium text-neutral-800" : "text-neutral-600"}`}
                          >
                            {info ? ruleLabel(info) : t.ruleId.split(".").pop()}
                          </span>
                          <span className="min-w-0 flex-1 text-neutral-400">— {humanReason(t)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="text-xs text-neutral-500">
              Bidding decisions only — for card play,{" "}
              <Link href="/bridge/table" className="underline underline-offset-4">
                deal a board
              </Link>
              .
            </p>
          </div>
        );
      }
    }
  }

  const example = (label: string, q: Search, hand: string, auction: string) => {
    const usp = new URLSearchParams({
      hand,
      auction,
      dealer: q.dealer ?? "N",
      vul: "none",
      player: "defaults",
    });
    return (
      <Link
        href={`${base}/test?${usp.toString()}`}
        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-emerald-400"
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Test a decision</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Give a hand and (optionally) the auction so far. The knowledge decides the next call,
          and shows every rule it considered. Shareable — the URL carries the question.
        </p>
      </div>

      <form method="get" className="space-y-4 rounded-lg border border-neutral-200 bg-[var(--card)] p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Hand (13 cards)</span>
          <input
            name="hand"
            defaultValue={handInput}
            placeholder="AKQ2.T94.532.A87 or SA SK …"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Auction so far</span>
          <input
            name="auction"
            defaultValue={auctionInput}
            placeholder="1N P  (from dealer; empty tests an opening)"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Dealer</span>
            <select
              name="dealer"
              defaultValue={dealer}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {SEATS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Vulnerability</span>
            <select
              name="vul"
              defaultValue={vul}
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {VULS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-sm font-medium">Player</span>
            <select
              name="player"
              defaultValue={playerSel}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="defaults">Full knowledge (defaults)</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name} — {p.validationStatus}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          What would it do?
        </button>
      </form>

      {result}

      <div className="rounded-lg border border-dashed border-neutral-300 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Try an example
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {example("Opening bid", { dealer: "N" }, "AKQ2.AT94.K32.A7", "")}
          {example("Response to 1NT", { dealer: "N" }, "KQ72.T9843.5.A87", "1N P")}
        </div>
      </div>
    </div>
  );
}

function errorBox(message: string): React.ReactNode {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--color-invalid)]">
      {message}
    </div>
  );
}
