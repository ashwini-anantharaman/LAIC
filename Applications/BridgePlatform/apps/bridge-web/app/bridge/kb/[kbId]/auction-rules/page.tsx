// Decision-point explorer (Pillar D): the fellows said "it's very hard to
// locate the exact rules that should apply" to a given auction. This page,
// GET-driven like the test bench, takes an auction prefix (+ dealer/vul/set and
// an optional hand) and lists EVERY auction rule in the chosen set whose
// CONTEXT matches the decision point, in true firing order (band+priority — the
// order effectiveSurface / the decider iterate). Each rule shows its English
// sentence, its Shows line, an item link, and — when a hand is given —
// per-condition pass/fail with the winning rule highlighted. A partnership
// panel reports what each side has shown (from the Pillar A inference layer),
// and the forcing rules in effect are listed too.

import type { SettingValue } from "@bridge/config";
import { callLabel, type Card, type Seat, type Suit, type Vul } from "@bridge/events";
import {
  createKbDecider,
  effectiveSurface,
  evalCondition,
  inferPartnership,
  initialState,
  matchContext,
  analyzeSeat,
  type ConditionEnv,
  type GameState,
  type PartnershipInference,
  type ShownState,
} from "@bridge/engine";
import { deriveShows, type CompiledAuctionRule, type HandCondition, type RuleShows } from "@bridge/kb";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  actionSentence,
  conditionPhrases,
  contextPhrases,
  Glyph,
  joinNodes,
  SUIT_GLYPH,
} from "@/components/kb/ruleEnglish";
import { drillPlayerConfig } from "@/lib/drills";
import { kbService, kbStore } from "@/lib/kb";
import { parseAuction, parseHand } from "@/lib/testBench";
import { saveDrillAction } from "../drills/actions";

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
  set?: string;
};

/** Compact text for one inclusive bound — "15–17", "6+", "at most 9". */
function boundText(b: { min?: number; max?: number }): string | null {
  if (b.min !== undefined && b.max !== undefined) return b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`;
  if (b.min !== undefined) return `${b.min}+`;
  if (b.max !== undefined) return `at most ${b.max}`;
  return null;
}

/** What a bid SHOWS, as a short review line (mirrors ItemView). */
function showsText(shows: RuleShows): string {
  const parts: string[] = [];
  const hcp = shows.hcp && boundText(shows.hcp);
  if (hcp) parts.push(`${hcp} HCP`);
  const tp = shows.tp && boundText(shows.tp);
  if (tp) parts.push(`${tp} total points`);
  for (const s of shows.suits ?? []) {
    const t = boundText(s);
    if (t) parts.push(`${t} ${SUIT_GLYPH[s.suit] ?? s.suit}`);
  }
  if (shows.forcing) parts.push("forcing");
  return parts.join(", ");
}

const SUIT_ORDER: Suit[] = ["S", "H", "D", "C"];

/** A side's shown state as review text, or null when it has shown nothing. */
function shownStateText(state: ShownState): ReactNode | null {
  const parts: ReactNode[] = [];
  const hcp = boundText({ min: state.hcpMin, max: state.hcpMax });
  if (hcp) parts.push(`${hcp} HCP`);
  const tp = boundText({ min: state.tpMin, max: state.tpMax });
  if (tp) parts.push(`${tp} total points`);
  for (const suit of SUIT_ORDER) {
    const t = boundText({ min: state.suitMin[suit], max: state.suitMax[suit] });
    if (t) parts.push(<> {t} <Glyph s={suit} /></>);
  }
  return parts.length ? joinNodes(parts, ", ") : null;
}

/** Flatten a rule's top-level `all` conditions for per-condition display. */
function topLevelConditions(cond: HandCondition | undefined): HandCondition[] {
  if (!cond) return [];
  if ("all" in cond) return cond.all;
  return [cond];
}

export default async function AuctionRulesPage({
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
  const setSel = sp.set ?? "all";
  const submitted = sp.auction !== undefined;

  const compiled = await kbService().liveCompile(kbId);

  let result: ReactNode = null;
  if (submitted) {
    if (!compiled) {
      result = errorBox("This knowledge base has no working compile yet — add some items first.");
    } else {
      const auctionParsed = parseAuction(auctionInput, dealer);
      const handParsed = handInput.trim() ? parseHand(handInput) : null;
      if ("error" in auctionParsed) {
        result = errorBox(`Auction: ${auctionParsed.error}`);
      } else if (handParsed && "error" in handParsed) {
        result = errorBox(`Hand: ${handParsed.error}`);
      } else {
        const { auction, toAct } = auctionParsed;
        const hand: Card[] | null = handParsed ? handParsed.hand : null;

        const config = drillPlayerConfig(setSel === "all" ? undefined : setSel);
        const surface = effectiveSurface({ compiled, player: config });

        // Enrich the facts with partnership inference BEFORE matching context —
        // askInProgress and agreed_suit are read during the match / realization.
        const facts = analyzeSeat(auction, toAct, vul);
        const inference: PartnershipInference = inferPartnership(auction, toAct, vul, {
          auctionRules: surface.auctionRules,
        });
        facts.inference = inference;

        // Rules whose CONTEXT matches, in firing order (surface order = band + priority).
        const matching = surface.auctionRules.filter((r) => matchContext(r.context, facts));
        const forcing = surface.forcingRules.filter((r) => matchContext(r.context, facts));

        // With a hand, the decider names the actual winner — highlight that ruleId.
        let winnerRuleId: string | undefined;
        let winnerCall: string | undefined;
        if (hand) {
          const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
          hands[toAct] = hand;
          const state: GameState = initialState("explorer", dealer, vul, hands);
          state.auction = auction;
          state.turn = toAct;
          const decision = await createKbDecider({ compiled, player: config }).decideBid(state, toAct);
          winnerRuleId = decision.matchedRuleId;
          winnerCall = callLabel(decision.action);
        }

        result = (
          <div className="space-y-5">
            <PartnershipPanel inference={inference} toAct={toAct} />

            {forcing.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-draft)]">
                  Forcing here — pass is not available
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-neutral-700">
                  {forcing.map((r) => (
                    <li key={r.ruleId}>
                      <b>{r.label}</b> — applies when{" "}
                      {joinNodes(contextPhrases(r.context)) || "it's this seat's turn"}.
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2 className="text-sm font-medium">
                {toAct} to act · {matching.length} rule{matching.length === 1 ? "" : "s"} match this
                context
                {winnerCall && (
                  <span className="ml-2 font-normal text-neutral-500">
                    — the knowledge would {winnerCall}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                In true firing order (band, then priority). {hand ? "Each shows per-condition pass/fail against the hand; the winner is highlighted." : "Add a hand above to see per-condition pass/fail and the winner."}
              </p>
            </div>

            {matching.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
                No auction rule in this set has a context that matches this decision point. The
                decider would fall back (pass) unless a forcing rule applies.
              </p>
            ) : (
              <ol className="space-y-3">
                {matching.map((rule, i) => (
                  <RuleCard
                    key={rule.ruleId}
                    rule={rule}
                    order={i + 1}
                    base={base}
                    values={surface.values}
                    hand={hand}
                    facts={facts}
                    winner={rule.ruleId === winnerRuleId}
                  />
                ))}
              </ol>
            )}

            {hand && winnerCall && (
              <SaveDrillForm
                kbId={kbId}
                hand={handInput}
                auction={auctionInput}
                dealer={dealer}
                vul={vul}
                expected={winnerCall}
                setSel={setSel}
              />
            )}
          </div>
        );
      }
    }
  }

  const packs = compiled?.packs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Auction rules at a decision point</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Type the auction so far and see <b>every</b> rule whose context applies here, in the order
          the decider fires them. Add a hand to see which conditions pass or fail and which rule
          wins. Shareable — the URL carries the question.
        </p>
      </div>

      <form method="get" className="space-y-4 rounded-lg border border-neutral-200 bg-[var(--card)] p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Auction so far</span>
          <input
            name="auction"
            defaultValue={auctionInput}
            placeholder="1C P  (from dealer; empty tests an opening)"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Hand (optional — enables pass/fail)</span>
          <input
            name="hand"
            defaultValue={handInput}
            placeholder="AKQ2.T94.532.A87 or SA SK …"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Dealer</span>
            <select name="dealer" defaultValue={dealer} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              {SEATS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Vulnerability</span>
            <select name="vul" defaultValue={vul} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              {VULS.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-52 flex-1">
            <span className="mb-1 block text-sm font-medium">Knowledge set</span>
            <select name="set" defaultValue={setSel} className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="all">Full knowledge (all sets)</option>
              {packs.map((p) => (
                <option key={p.packId} value={p.packId}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Show the rules
        </button>
      </form>

      {result}
    </div>
  );
}

function PartnershipPanel({
  inference,
  toAct,
}: Readonly<{ inference: PartnershipInference; toAct: Seat }>) {
  const self = shownStateText(inference.selfShown);
  const partner = shownStateText(inference.partnerShown);
  const combinedMin =
    (inference.selfShown.hcpMin ?? 0) + (inference.partnerShown.hcpMin ?? 0) || undefined;
  const combinedMax =
    inference.selfShown.hcpMax !== undefined && inference.partnerShown.hcpMax !== undefined
      ? inference.selfShown.hcpMax + inference.partnerShown.hcpMax
      : undefined;
  const combined = boundText({ min: combinedMin, max: combinedMax });

  return (
    <div className="rounded-lg border border-neutral-200 bg-[var(--card)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Partnership so far ({toAct} to act)
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        <Row label="I have shown">{self ?? <span className="text-neutral-400">nothing yet</span>}</Row>
        <Row label="Partner has shown">
          {partner ?? <span className="text-neutral-400">nothing yet</span>}
        </Row>
        <Row label="Combined HCP">
          {combined ?? <span className="text-neutral-400">unknown</span>}
        </Row>
        <Row label="Agreed suit">
          {inference.agreedSuit ? <Glyph s={inference.agreedSuit} /> : <span className="text-neutral-400">none</span>}
        </Row>
        {inference.partnerShownKeycards && (
          <Row label="Partner's keycards">{inference.partnerShownKeycards.join(" or ")}</Row>
        )}
        {inference.partnerShownKings && (
          <Row label="Partner's kings">{inference.partnerShownKings.join(" or ")}</Row>
        )}
        {inference.askInProgress && (
          <Row label="Ask in progress">
            <span className="font-mono text-xs">{inference.askInProgress}</span> awaiting my reply
          </Row>
        )}
      </dl>
    </div>
  );
}

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex gap-2">
      <dt className="w-40 flex-none text-neutral-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-neutral-800">{children}</dd>
    </div>
  );
}

function RuleCard({
  rule,
  order,
  base,
  values,
  hand,
  facts,
  winner,
}: Readonly<{
  rule: CompiledAuctionRule;
  order: number;
  base: string;
  values: Record<string, SettingValue>;
  hand: Card[] | null;
  facts: ConditionEnv["facts"];
  winner: boolean;
}>) {
  const shows = rule.shows ?? deriveShows(rule.conditions);
  const showsLine = shows ? showsText(shows) : "";
  const when = contextPhrases(rule.context);
  const handPhrases = conditionPhrases(rule.conditions, values);

  // Per-condition pass/fail against the given hand (top-level `all` split).
  let checks: { node: ReactNode; ok: boolean }[] | null = null;
  if (hand) {
    checks = [];
    for (const cond of topLevelConditions(rule.conditions)) {
      const phrases = conditionPhrases(cond, values);
      if (phrases.length === 0) continue;
      const ok = evalCondition(cond, hand, { values, facts, consulted: new Set() });
      checks.push({ node: joinNodes(phrases), ok });
    }
  }

  return (
    <li
      className={`rounded-lg border p-4 ${
        winner ? "border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-300" : "border-neutral-200 bg-[var(--card)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-neutral-400">#{order}</span>
        <h3 className="text-sm font-medium">{rule.label}</h3>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">
          {actionSentence(rule.action)}
        </span>
        {winner && (
          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            winner
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        <b>When</b> {when.length ? joinNodes(when) : "it's my turn (no constraints)"}
        {handPhrases.length > 0 && (
          <>
            , <b>and I hold</b> {joinNodes(handPhrases)}
          </>
        )}
        , <b>then</b> {actionSentence(rule.action)}.
      </p>

      {showsLine && (
        <p className="mt-1.5 text-xs text-neutral-500">
          <span className="font-medium text-neutral-600">Shows:</span> {showsLine}
          {rule.shows ? "" : " (derived)"}
          {rule.ask ? ` · asks (${rule.ask.id})` : ""}
        </p>
      )}

      {checks && checks.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? "text-emerald-700" : "text-[color:var(--color-invalid)]"}>
              <span aria-hidden className="mr-1 font-bold">
                {c.ok ? "✓" : "✗"}
              </span>
              {c.node}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-neutral-400">
        <Link
          href={`${base}/items/${rule.provenance.itemId}?mode=edit`}
          className="font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          open the item →
        </Link>{" "}
        · from &ldquo;{rule.provenance.itemTitle}&rdquo; ·{" "}
        <span className="font-mono">{rule.ruleId}</span>
      </p>
    </li>
  );
}

function SaveDrillForm({
  kbId,
  hand,
  auction,
  dealer,
  vul,
  expected,
  setSel,
}: Readonly<{
  kbId: string;
  hand: string;
  auction: string;
  dealer: Seat;
  vul: Vul;
  expected: string;
  setSel: string;
}>) {
  return (
    <form
      action={saveDrillAction}
      className="rounded-lg border border-dashed border-neutral-300 bg-[var(--card)] p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Save as a regression drill
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Locks this decision point in. The runner re-checks it on every recompile — the expected
        call is prefilled with the knowledge&apos;s current answer; edit it to the target.
      </p>
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="hand" value={hand} />
      <input type="hidden" name="auction" value={auction} />
      <input type="hidden" name="dealer" value={dealer} />
      <input type="hidden" name="vul" value={vul} />
      <input type="hidden" name="set" value={setSel} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-0.5 block text-neutral-500">Name</span>
          <input
            name="name"
            defaultValue={`${auction || "opening"} — ${dealer}`}
            className="w-56 rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="mb-0.5 block text-neutral-500">Expected call(s)</span>
          <input
            name="expected"
            defaultValue={expected}
            className="w-32 rounded border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="min-w-40 flex-1 text-xs">
          <span className="mb-0.5 block text-neutral-500">Note</span>
          <input
            name="note"
            placeholder="what this drill documents"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Save drill
        </button>
      </div>
    </form>
  );
}

function errorBox(message: string): ReactNode {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--color-invalid)]">
      {message}
    </div>
  );
}
