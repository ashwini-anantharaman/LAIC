"use client";

// The typed item editor (spec §6): purpose-built controls per knowledgeType,
// generated payload underneath, raw JSON behind an "advanced" disclosure.
// Reverse-mapping: conditions the typed subset can express prefill the
// fields; anything deeper prefills the per-rule JSON box instead — nothing
// is ever silently dropped. Only the payload section for the SELECTED type
// renders (the server reads just that section on save — fields typed into a
// non-matching section would be silently ignored, so we don't show them).

import type {
  AuctionRuleSpec,
  CallPattern,
  HandCondition,
  ItemPayload,
  KnowledgeItem,
  KnowledgeType,
  NumParam,
} from "@bridge/kb";
import { useState, type ReactNode } from "react";
import { TYPE_LABEL } from "./badges";

const showNum = (p: NumParam | undefined): string =>
  p === undefined ? "" : typeof p === "number" ? String(p) : `$${p.$setting}${p.field ? `.${p.field}` : ""}`;

interface TypedConditions {
  hcpMin?: NumParam;
  hcpMax?: NumParam;
  tpMin?: NumParam;
  tpMax?: NumParam;
  balanced?: boolean;
  suits: { suit: string; min?: NumParam; max?: NumParam }[];
  /** Set when the tree exceeds the typed subset — goes to the JSON box. */
  overflow?: HandCondition;
}

/** Decompose a condition tree into the typed subset, or overflow to JSON. */
function decompose(cond: HandCondition): TypedConditions {
  const out: TypedConditions = { suits: [] };
  const parts = "all" in cond ? cond.all : [cond];
  if (!Array.isArray(parts)) return { suits: [], overflow: cond };
  const leftovers: HandCondition[] = [];
  for (const part of parts) {
    if ("hcp" in part) {
      out.hcpMin = part.hcp.min;
      out.hcpMax = part.hcp.max;
    } else if ("totalPoints" in part) {
      out.tpMin = part.totalPoints.min;
      out.tpMax = part.totalPoints.max;
    } else if ("balanced" in part) {
      out.balanced = part.balanced;
    } else if ("suitLength" in part && out.suits.length < 2 && typeof part.suitLength.suit === "string") {
      out.suits.push({
        suit: part.suitLength.suit,
        min: part.suitLength.min,
        max: part.suitLength.max,
      });
    } else {
      leftovers.push(part);
    }
  }
  if (leftovers.length)
    out.overflow = leftovers.length === 1 ? leftovers[0]! : { all: leftovers };
  return out;
}

const input =
  "w-full rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50";
const label = "mb-0.5 block text-[11px] text-neutral-500";

// ---------------------------------------------------------------------------
// Rule cards (2026-07-20 UX pass). Every input is controlled by a draft
// object so the card can narrate itself: a live plain-English sentence in the
// header ("When partner opened 1NT and I hold 8+ HCP, then bid 2♣"), fields
// that appear only when the chosen kind/action uses them, and collapsible
// cards so a many-rule item scans as a list of sentences. Field NAMES are the
// stable form contract with lib/itemForm.ts — do not rename them.
// ---------------------------------------------------------------------------

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redGlyph = (s: string) => s === "H" || s === "D";

function Glyph({ s }: Readonly<{ s: string }>) {
  return <span className={redGlyph(s) ? "text-[var(--madder)]" : ""}>{SUIT_GLYPH[s] ?? s}</span>;
}

interface PatternDraft {
  kind: string;
  levelMin: string;
  levelMax: string;
  strains: string;
}
interface SuitDraft {
  suit: string;
  min: string;
  max: string;
}
interface RuleDraft {
  label: string;
  key: string;
  priority: string;
  role: string;
  contested: string;
  roundMin: string;
  roundMax: string;
  opening: PatternDraft;
  partnerLast: PatternDraft;
  rhoLast: PatternDraft;
  ownLast: PatternDraft;
  lhoLast: PatternDraft;
  ownFirst: PatternDraft;
  partnerFirst: PatternDraft;
  hcpMin: string;
  hcpMax: string;
  tpMin: string;
  balanced: string;
  suits: [SuitDraft, SuitDraft];
  actionType: string;
  actionLevel: string;
  actionStrain: string;
  actionAmong: string;
  actionSuit: string;
  /** Serialized action for types beyond the dropdown (first_legal_of…). */
  actionJson: string;
  remove: boolean;
}

/** Action types the dropdown edits directly; others round-trip as JSON. */
const TYPED_ACTIONS = new Set([
  "bid", "pass", "double", "redouble", "raise_partner", "bid_longest", "bid_suit",
]);

const patternDraft = (p?: CallPattern): PatternDraft => ({
  kind: p?.kind ?? "unset",
  levelMin: p?.levelMin?.toString() ?? "",
  levelMax: p?.levelMax?.toString() ?? "",
  strains: p?.strains?.join(",") ?? "",
});

function draftFrom(rule: AuctionRuleSpec | null, index: number): RuleDraft {
  const c = rule ? decompose(rule.conditions) : { suits: [] as TypedConditions["suits"] };
  const a = rule?.action;
  return {
    label: rule?.label ?? "",
    key: rule?.key ?? `r${index}`,
    priority: String(rule?.priority ?? 10),
    role: rule?.context.role ?? "opening",
    contested: rule?.context.contested === true ? "yes" : rule?.context.contested === false ? "no" : "",
    roundMin: rule?.context.roundMin?.toString() ?? "",
    roundMax: rule?.context.roundMax?.toString() ?? "",
    opening: patternDraft(rule?.context.opening),
    partnerLast: patternDraft(rule?.context.partnerLast),
    rhoLast: patternDraft(rule?.context.rhoLast),
    ownLast: patternDraft(rule?.context.ownLast),
    lhoLast: patternDraft(rule?.context.lhoLast),
    ownFirst: patternDraft(rule?.context.ownFirst),
    partnerFirst: patternDraft(rule?.context.partnerFirst),
    hcpMin: showNum(c.hcpMin),
    hcpMax: showNum(c.hcpMax),
    tpMin: showNum(c.tpMin),
    balanced: c.balanced === true ? "yes" : c.balanced === false ? "no" : "",
    suits: [
      { suit: c.suits[0]?.suit ?? "", min: showNum(c.suits[0]?.min), max: showNum(c.suits[0]?.max) },
      { suit: c.suits[1]?.suit ?? "", min: showNum(c.suits[1]?.min), max: showNum(c.suits[1]?.max) },
    ],
    actionType: a ? (TYPED_ACTIONS.has(a.type) ? a.type : "json") : "bid",
    actionLevel:
      a && "level" in a && a.level !== undefined
        ? String(a.level)
        : a?.type === "raise_partner"
          ? String(a.toLevel)
          : "",
    actionStrain: a?.type === "bid" ? a.strain : "N",
    actionAmong: a?.type === "bid_longest" ? a.among.join(",") : "",
    actionSuit: a?.type === "bid_suit" ? a.suit : "rho_bid_suit",
    actionJson: a && !TYPED_ACTIONS.has(a.type) ? JSON.stringify(a) : "",
    remove: false,
  };
}

/** "$nt_range.low" shows as-is; it reads better than hiding the dial. */
const numText = (v: string) => v.trim();

// ---- the live sentence -----------------------------------------------------

function strainList(text: string): ReactNode {
  const parts = text
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.map((s, i) => (
    <span key={i}>
      {i > 0 && "/"}
      {s === "N" ? "NT" : <Glyph s={s} />}
    </span>
  ));
}

function callDesc(p: PatternDraft): ReactNode | null {
  if (!p.kind || p.kind === "unset") return null;
  if (p.kind === "pass") return "a pass";
  if (p.kind === "double") return "a double";
  if (p.kind === "redouble") return "a redouble";
  if (p.kind === "none") return "no call yet";
  const strains = strainList(p.strains);
  const min = p.levelMin.trim();
  const max = p.levelMax.trim();
  // The crisp special case: exactly one level and strains → "1NT".
  if (min && min === max && strains)
    return (
      <>
        {min}
        {strains}
      </>
    );
  return (
    <>
      a bid
      {min && max && min !== max && ` at the ${min}–${max} level`}
      {min && !max && ` at the ${min} level or higher`}
      {!min && max && ` up to the ${max} level`}
      {min && min === max && ` at the ${min} level`}
      {strains && <> in {strains}</>}
    </>
  );
}

function suitName(s: string): ReactNode | null {
  if (!s) return null;
  if (s === "partner_last_bid_suit") return "partner's suit";
  if (s === "partner_first_bid_suit") return "partner's first suit";
  if (s === "own_longest_suit") return "my longest suit";
  if (s === "own_first_bid_suit") return "my first suit";
  if (s === "own_last_bid_suit") return "my last bid suit";
  if (s === "rho_bid_suit") return "RHO's suit";
  return <Glyph s={s} />;
}

const joinNodes = (parts: ReactNode[], sep = ", "): ReactNode =>
  parts.map((part, i) => (
    <span key={i}>
      {i > 0 && sep}
      {part}
    </span>
  ));

function ruleSentence(d: RuleDraft): ReactNode {
  const when: ReactNode[] = [];
  const roleText: Record<string, string | null> = {
    opening: "nobody has bid yet",
    opener: "I opened and it's my rebid",
    responder: "partner opened",
    overcaller: "the opponents opened",
    advancer: "partner acted over their opening",
    any: null,
  };
  if (roleText[d.role]) when.push(roleText[d.role]);
  const opening = callDesc(d.opening);
  if (opening) when.push(<>our opening was {opening}</>);
  const partner = callDesc(d.partnerLast);
  if (partner) when.push(<>partner's last call was {partner}</>);
  const rho = callDesc(d.rhoLast);
  if (rho) when.push(<>RHO's last call was {rho}</>);
  const ownLast = callDesc(d.ownLast);
  if (ownLast) when.push(<>my last call was {ownLast}</>);
  const lho = callDesc(d.lhoLast);
  if (lho) when.push(<>LHO's last call was {lho}</>);
  const ownFirst = callDesc(d.ownFirst);
  if (ownFirst) when.push(<>my first call was {ownFirst}</>);
  const partnerFirst = callDesc(d.partnerFirst);
  if (partnerFirst) when.push(<>partner's first call was {partnerFirst}</>);
  if (d.contested === "yes") when.push("the auction is contested");
  if (d.contested === "no") when.push("the opponents are silent");
  if (d.roundMin || d.roundMax)
    when.push(
      d.roundMin && d.roundMax
        ? `in rounds ${d.roundMin}–${d.roundMax}`
        : d.roundMin
          ? `from round ${d.roundMin}`
          : `up to round ${d.roundMax}`,
    );

  const hand: ReactNode[] = [];
  const lo = numText(d.hcpMin);
  const hi = numText(d.hcpMax);
  if (lo && hi) hand.push(`${lo}–${hi} HCP`);
  else if (lo) hand.push(`${lo}+ HCP`);
  else if (hi) hand.push(`at most ${hi} HCP`);
  if (numText(d.tpMin)) hand.push(`${numText(d.tpMin)}+ total points`);
  if (d.balanced === "yes") hand.push("a balanced hand");
  if (d.balanced === "no") hand.push("an unbalanced hand");
  for (const su of d.suits) {
    const name = suitName(su.suit);
    if (!name) continue;
    const mn = numText(su.min);
    const mx = numText(su.max);
    if (mn && mx) hand.push(<>{mn}–{mx} cards in {name}</>);
    else if (mn) hand.push(<>{mn}+ cards in {name}</>);
    else if (mx) hand.push(<>at most {mx} cards in {name}</>);
    else hand.push(<>some length in {name}</>);
  }

  return (
    <>
      <b>When</b> {when.length ? joinNodes(when) : "it's my turn (no constraints)"}
      {hand.length > 0 && (
        <>
          , <b>and I hold</b> {joinNodes(hand)}
        </>
      )}
      , <b>then</b> {actionText(d)}.
    </>
  );
}

function actionText(d: RuleDraft): ReactNode {
  const lvl = d.actionLevel.trim();
  switch (d.actionType) {
    case "pass":
      return "pass";
    case "double":
      return "double";
    case "redouble":
      return "redouble";
    case "raise_partner":
      return <>raise partner to the {lvl || "2"} level</>;
    case "bid_longest":
      return (
        <>
          bid my longest of {strainList(d.actionAmong || "S,H")}
          {lvl && ` at the ${lvl} level`}
        </>
      );
    case "bid_suit":
      return (
        <>
          bid {suitName(d.actionSuit) ?? "?"}
          {lvl ? ` at the ${lvl} level` : " at the cheapest level"}
        </>
      );
    case "json":
      return <>make a custom call (see the action JSON)</>;
    default:
      return (
        <>
          bid {lvl || "?"}
          {d.actionStrain === "N" ? "NT" : <Glyph s={d.actionStrain} />}
        </>
      );
  }
}

/** The short chip in the card header — the call this rule makes. */
function actionChip(d: RuleDraft): ReactNode {
  switch (d.actionType) {
    case "pass":
      return "Pass";
    case "double":
      return "Dbl";
    case "redouble":
      return "Rdbl";
    case "raise_partner":
      return `raise → ${d.actionLevel.trim() || "2"}`;
    case "bid_longest":
      return <>longest {strainList(d.actionAmong || "S,H")}</>;
    case "bid_suit":
      return <>{suitName(d.actionSuit) ?? "suit"}{d.actionLevel.trim() && ` @${d.actionLevel.trim()}`}</>;
    case "json":
      return "custom";
    default:
      return (
        <>
          {d.actionLevel.trim() || "?"}
          {d.actionStrain === "N" ? "NT" : <Glyph s={d.actionStrain} />}
        </>
      );
  }
}

// ---- form pieces ------------------------------------------------------------

/** One call-pattern row: level/strain refinements appear only for bids. */
function PatternRow({
  p,
  field,
  title,
  value,
  onChange,
}: Readonly<{
  p: string;
  field:
    | "opening"
    | "partnerLast"
    | "rhoLast"
    | "ownLast"
    | "lhoLast"
    | "ownFirst"
    | "partnerFirst";
  title: string;
  value: PatternDraft;
  onChange: (patch: Partial<PatternDraft>) => void;
}>) {
  const isBid = value.kind === "bid" || value.kind === "any_bid";
  return (
    <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-1 sm:col-span-2">
      <label>
        <span className={label}>{title}</span>
        <select
          name={`${p}:${field}:kind`}
          value={value.kind}
          onChange={(e) => onChange({ kind: e.target.value })}
          className={input}
        >
          <option value="unset">anything / not set</option>
          <option value="bid">a bid…</option>
          <option value="any_bid">any suit/NT bid</option>
          <option value="pass">a pass</option>
          <option value="double">a double</option>
          <option value="redouble">a redouble</option>
          <option value="none">no call yet</option>
        </select>
      </label>
      {isBid ? (
        <>
          <label>
            <span className={label}>level ≥</span>
            <input
              name={`${p}:${field}:levelMin`}
              value={value.levelMin}
              onChange={(e) => onChange({ levelMin: e.target.value })}
              className={input}
            />
          </label>
          <label>
            <span className={label}>level ≤</span>
            <input
              name={`${p}:${field}:levelMax`}
              value={value.levelMax}
              onChange={(e) => onChange({ levelMax: e.target.value })}
              className={input}
            />
          </label>
          <label>
            <span className={label}>strains</span>
            <input
              name={`${p}:${field}:strains`}
              value={value.strains}
              onChange={(e) => onChange({ strains: e.target.value })}
              placeholder="N or S,H"
              className={input}
            />
          </label>
        </>
      ) : (
        <div className="col-span-3" />
      )}
    </div>
  );
}

/** A labeled band of the rule card: WHEN / AND MY HAND / THEN. */
function Band({
  tag,
  hint,
  rail,
  children,
}: Readonly<{ tag: string; hint: string; rail: string; children: ReactNode }>) {
  return (
    <div className={`border-t border-neutral-100 py-2.5 pl-3 pr-3 ${rail} border-l-[3px]`}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
        {tag} <span className="font-normal normal-case tracking-normal text-neutral-400">— {hint}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function RuleRow({ rule, index }: Readonly<{ rule: AuctionRuleSpec | null; index: number }>) {
  const p = `rule${index}`;
  const [d, setD] = useState<RuleDraft>(() => draftFrom(rule, index));
  const set = (patch: Partial<RuleDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const setSuit = (i: 0 | 1, patch: Partial<SuitDraft>) =>
    setD((prev) => {
      const suits: [SuitDraft, SuitDraft] = [prev.suits[0], prev.suits[1]];
      suits[i] = { ...suits[i], ...patch };
      return { ...prev, suits };
    });
  const c = rule ? decompose(rule.conditions) : { suits: [] as TypedConditions["suits"] };
  const showLevel = ["bid", "raise_partner", "bid_longest", "bid_suit"].includes(d.actionType);

  return (
    <details
      // First rule (and any new card) starts open; the rest collapse to their
      // sentences so a many-rule item scans as prose.
      open={!rule || index === 0}
      className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
    >
      {/* Collapsed, a rule reads as its sentence. */}
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="mt-1.5 h-2.5 w-2.5 flex-none text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path d="M3 1l6 5-6 5z" fill="currentColor" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {d.label || <span className="font-normal text-neutral-400">New rule — give it a label below</span>}
            {d.remove && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                will be removed on save
              </span>
            )}
          </p>
          {/* The sentence never truncates — it's the whole point. */}
          <p className={`mt-0.5 text-[13px] leading-relaxed ${d.remove ? "text-neutral-300 line-through" : "text-neutral-500"}`}>
            {ruleSentence(d)}
          </p>
        </div>
        <span className="flex-none rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 font-mono text-xs font-semibold">
          {actionChip(d)}
        </span>
      </summary>

      {/* Identity */}
      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 bg-neutral-50/70 px-3 py-2">
        <label className="min-w-40 flex-1">
          <span className={label}>Label — what the trace shows</span>
          <input
            name={`${p}:label`}
            value={d.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder={rule ? "" : "e.g. Open 1NT — blank rules are not saved"}
            className={input}
          />
        </label>
        <label className="w-28">
          <span className={label}>Key (stable id)</span>
          <input
            name={`${p}:key`}
            value={d.key}
            onChange={(e) => set({ key: e.target.value })}
            className={input}
          />
        </label>
        <label className="w-20">
          <span className={label} title="Tie-break within the type's band — lower fires first">
            Priority
          </span>
          <input
            name={`${p}:priority`}
            type="number"
            value={d.priority}
            onChange={(e) => set({ priority: e.target.value })}
            className={input}
          />
        </label>
        {rule && (
          <label className="mb-1.5 flex items-center gap-1 text-xs text-red-700">
            <input
              type="checkbox"
              name={`${p}:remove`}
              checked={d.remove}
              onChange={(e) => set({ remove: e.target.checked })}
            />{" "}
            remove
          </label>
        )}
      </div>

      <Band tag="When" hint="where in the auction this rule can fire" rail="border-l-emerald-600">
        <label>
          <span className={label}>My role</span>
          <select
            name={`${p}:role`}
            value={d.role}
            onChange={(e) => set({ role: e.target.value })}
            className={input}
          >
            <option value="opening">opening — nobody has bid yet</option>
            <option value="opener">opener — rebidding my opening</option>
            <option value="responder">responder — partner opened</option>
            <option value="overcaller">overcaller — they opened</option>
            <option value="advancer">advancer — partner overcalled</option>
            <option value="any">any</option>
          </select>
        </label>
        <label>
          <span className={label}>Contested?</span>
          <select
            name={`${p}:contested`}
            value={d.contested}
            onChange={(e) => set({ contested: e.target.value })}
            className={input}
          >
            <option value="">either</option>
            <option value="no">uncontested only</option>
            <option value="yes">contested only</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <label>
            <span className={label}>round ≥</span>
            <input
              name={`${p}:roundMin`}
              value={d.roundMin}
              onChange={(e) => set({ roundMin: e.target.value })}
              className={input}
            />
          </label>
          <label>
            <span className={label}>round ≤</span>
            <input
              name={`${p}:roundMax`}
              value={d.roundMax}
              onChange={(e) => set({ roundMax: e.target.value })}
              className={input}
            />
          </label>
        </div>
        <div className="hidden sm:block" />
        <PatternRow p={p} field="opening" title="Our opening was…" value={d.opening} onChange={(patch) => set({ opening: { ...d.opening, ...patch } })} />
        <PatternRow p={p} field="partnerLast" title="Partner's last call was…" value={d.partnerLast} onChange={(patch) => set({ partnerLast: { ...d.partnerLast, ...patch } })} />
        <PatternRow p={p} field="rhoLast" title="RHO's last call was…" value={d.rhoLast} onChange={(patch) => set({ rhoLast: { ...d.rhoLast, ...patch } })} />
        <details
          className="sm:col-span-4"
          open={[d.ownLast, d.lhoLast, d.ownFirst, d.partnerFirst].some((x) => x.kind !== "unset")}
        >
          <summary className="cursor-pointer text-[11px] text-neutral-500">
            More auction memory — my/LHO&apos;s last call, first calls (rebid sequences)
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <PatternRow p={p} field="ownLast" title="My last call was…" value={d.ownLast} onChange={(patch) => set({ ownLast: { ...d.ownLast, ...patch } })} />
            <PatternRow p={p} field="lhoLast" title="LHO's last call was…" value={d.lhoLast} onChange={(patch) => set({ lhoLast: { ...d.lhoLast, ...patch } })} />
            <PatternRow p={p} field="ownFirst" title="My first call was…" value={d.ownFirst} onChange={(patch) => set({ ownFirst: { ...d.ownFirst, ...patch } })} />
            <PatternRow p={p} field="partnerFirst" title="Partner's first call was…" value={d.partnerFirst} onChange={(patch) => set({ partnerFirst: { ...d.partnerFirst, ...patch } })} />
          </div>
        </details>
      </Band>

      <Band tag="And my hand" hint="all filled-in checks must hold; blank = no constraint" rail="border-l-amber-600">
        <label>
          <span className={label}>HCP min</span>
          <input
            name={`${p}:hcpMin`}
            value={d.hcpMin}
            onChange={(e) => set({ hcpMin: e.target.value })}
            placeholder="15 or $nt_range.low"
            className={input}
          />
        </label>
        <label>
          <span className={label}>HCP max</span>
          <input
            name={`${p}:hcpMax`}
            value={d.hcpMax}
            onChange={(e) => set({ hcpMax: e.target.value })}
            placeholder="17 or $nt_range.high"
            className={input}
          />
        </label>
        <label>
          <span className={label}>Points min (HCP+length)</span>
          <input
            name={`${p}:tpMin`}
            value={d.tpMin}
            onChange={(e) => set({ tpMin: e.target.value })}
            className={input}
          />
        </label>
        <label>
          <span className={label}>Shape</span>
          <select
            name={`${p}:balanced`}
            value={d.balanced}
            onChange={(e) => set({ balanced: e.target.value })}
            className={input}
          >
            <option value="">any shape</option>
            <option value="yes">balanced</option>
            <option value="no">unbalanced</option>
          </select>
        </label>
        {/* Two slots so one rule can require both suits at once ("4+ ♥ and
            4+ ♠"); the second appears only once the first is in use. */}
        {([0, 1] as const).map((i) => {
          if (i === 1 && !d.suits[0].suit && !d.suits[1].suit) return null;
          return (
          <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr] gap-1 sm:col-span-2">
            <label>
              <span className={label}>
                {i === 0 ? "Holding in suit…" : "…and also in suit (both must hold)"}
              </span>
              <select
                name={`${p}:suit${i}`}
                value={d.suits[i].suit}
                onChange={(e) => setSuit(i, { suit: e.target.value })}
                className={input}
              >
                <option value="">—</option>
                <option value="S">♠ spades</option>
                <option value="H">♥ hearts</option>
                <option value="D">♦ diamonds</option>
                <option value="C">♣ clubs</option>
                <option value="partner_last_bid_suit">partner&apos;s last bid suit</option>
                <option value="partner_first_bid_suit">partner&apos;s first bid suit</option>
                <option value="own_longest_suit">my longest suit</option>
                <option value="own_first_bid_suit">my first bid suit</option>
                <option value="own_last_bid_suit">my last bid suit</option>
                <option value="rho_bid_suit">RHO&apos;s bid suit</option>
              </select>
            </label>
            {d.suits[i].suit ? (
              <>
                <label>
                  <span className={label}>at least</span>
                  <input
                    name={`${p}:suit${i}Min`}
                    value={d.suits[i].min}
                    onChange={(e) => setSuit(i, { min: e.target.value })}
                    className={input}
                  />
                </label>
                <label>
                  <span className={label}>at most</span>
                  <input
                    name={`${p}:suit${i}Max`}
                    value={d.suits[i].max}
                    onChange={(e) => setSuit(i, { max: e.target.value })}
                    className={input}
                  />
                </label>
              </>
            ) : (
              <div className="col-span-2" />
            )}
          </div>
          );
        })}
      </Band>

      <Band tag="Then" hint="the call to make (skipped if illegal in the live auction)" rail="border-l-neutral-500">
        <label>
          <span className={label}>Action</span>
          <select
            name={`${p}:actionType`}
            value={d.actionType}
            onChange={(e) => set({ actionType: e.target.value })}
            className={input}
          >
            <option value="bid">bid exactly (level + strain)</option>
            <option value="pass">pass</option>
            <option value="double">double</option>
            <option value="redouble">redouble</option>
            <option value="raise_partner">raise partner&apos;s suit</option>
            <option value="bid_longest">bid my longest among…</option>
            <option value="bid_suit">bid a contextual suit (cue bid / rebid my suit)</option>
            <option value="json">advanced — raw action JSON</option>
          </select>
        </label>
        {showLevel && (
          <label>
            <span className={label}>
              {d.actionType === "raise_partner"
                ? "To level"
                : d.actionType === "bid_longest"
                  ? "At level (optional)"
                  : "Level"}
            </span>
            <input
              name={`${p}:actionLevel`}
              type="number"
              value={d.actionLevel}
              onChange={(e) => set({ actionLevel: e.target.value })}
              className={input}
            />
          </label>
        )}
        {d.actionType === "bid" && (
          <label>
            <span className={label}>Strain</span>
            <select
              name={`${p}:actionStrain`}
              value={d.actionStrain}
              onChange={(e) => set({ actionStrain: e.target.value })}
              className={input}
            >
              <option value="C">♣ clubs</option>
              <option value="D">♦ diamonds</option>
              <option value="H">♥ hearts</option>
              <option value="S">♠ spades</option>
              <option value="N">NT</option>
            </select>
          </label>
        )}
        {d.actionType === "bid_longest" && (
          <label>
            <span className={label}>Among suits</span>
            <input
              name={`${p}:actionAmong`}
              value={d.actionAmong}
              onChange={(e) => set({ actionAmong: e.target.value })}
              placeholder="S,H"
              className={input}
            />
          </label>
        )}
        {d.actionType === "bid_suit" && (
          <label>
            <span className={label}>Which suit</span>
            <select
              name={`${p}:actionSuit`}
              value={d.actionSuit}
              onChange={(e) => set({ actionSuit: e.target.value })}
              className={input}
            >
              <option value="rho_bid_suit">RHO&apos;s bid suit (cue bid)</option>
              <option value="own_first_bid_suit">my first bid suit (rebid it)</option>
              <option value="own_last_bid_suit">my last bid suit</option>
              <option value="partner_first_bid_suit">partner&apos;s first bid suit</option>
              <option value="partner_last_bid_suit">partner&apos;s last bid suit</option>
              <option value="own_longest_suit">my longest suit</option>
              <option value="S">♠ spades</option>
              <option value="H">♥ hearts</option>
              <option value="D">♦ diamonds</option>
              <option value="C">♣ clubs</option>
            </select>
          </label>
        )}
        {d.actionType === "json" && (
          <label className="sm:col-span-3">
            <span className={label}>Action JSON (e.g. first_legal_of)</span>
            <input
              name={`${p}:actionJson`}
              value={d.actionJson}
              onChange={(e) => set({ actionJson: e.target.value })}
              placeholder='{"type":"first_legal_of","calls":[{"level":3,"strain":"N"}]}'
              className={`${input} font-mono`}
            />
          </label>
        )}
      </Band>

      <details className="border-t border-neutral-100 px-3 py-2" open={Boolean(c.overflow)}>
        <summary className="cursor-pointer text-xs text-neutral-500">
          Extra conditions (JSON){c.overflow ? " — this rule uses conditions beyond the typed fields" : ""}
        </summary>
        <textarea
          name={`${p}:conditionsJson`}
          rows={3}
          defaultValue={c.overflow ? JSON.stringify(c.overflow, null, 1) : ""}
          className="mt-1 w-full rounded border border-neutral-300 p-2 font-mono text-xs"
        />
      </details>
    </details>
  );
}

export function ItemEditor({
  kbId,
  item,
  action,
  initialTitle,
  citation,
  hiddenFields,
}: Readonly<{
  kbId: string;
  item: KnowledgeItem | null;
  action: (formData: FormData) => Promise<void>;
  /** Prefill for the write-up-from-a-passage flow (failed extraction). */
  initialTitle?: string;
  citation?: { sourceId: string; passageId: string; anchor: string };
  /** Extra hidden inputs (fix-at-the-table passes returnTo + repinSessionId). */
  hiddenFields?: Record<string, string>;
}>) {
  const payload: ItemPayload = item?.payload ?? { kind: "auction_rules", rules: [] };
  const auctionSpecs = payload.kind === "auction_rules" ? payload.rules : [];
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>(
    item?.knowledgeType ?? "agreement",
  );
  // New items start with one blank rule card; more arrive via "Add a rule".
  const [extraRules, setExtraRules] = useState(item ? 0 : 1);
  const needsRules = ["bidding_rule", "convention", "agreement", "exception"].includes(knowledgeType);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kbId" value={kbId} />
      {item && <input type="hidden" name="itemId" value={item.itemId} />}
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {citation && (
        <>
          <input type="hidden" name="cite:sourceId" value={citation.sourceId} />
          <input type="hidden" name="cite:passageId" value={citation.passageId} />
          <input type="hidden" name="cite:anchor" value={citation.anchor} />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className={label}>Title</span>
          <input name="title" required defaultValue={item?.title ?? initialTitle ?? ""} className={input} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className={label}>What a player reads (the agreement, in plain words)</span>
          <textarea
            name="humanReadableText"
            rows={3}
            required
            defaultValue={item?.humanReadableText ?? ""}
            className={`${input} prose-knowledge`}
          />
        </label>
        <label className="text-sm">
          <span className={label}>Type</span>
          <select
            name="knowledgeType"
            value={knowledgeType}
            onChange={(e) => setKnowledgeType(e.target.value as KnowledgeType)}
            className={input}
          >
            {Object.entries(TYPE_LABEL).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Phase</span>
          <select name="phase" defaultValue={item?.phase ?? "auction"} className={input}>
            {["auction", "opening_lead", "declarer_play", "defense", "scoring"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Status (trust badge — never a gate)</span>
          <select name="status" defaultValue={item?.status ?? "draft"} className={input}>
            {["draft", "reviewed", "approved", "deprecated"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Level tags (comma-separated, advisory)</span>
          <input
            name="supportedLevels"
            defaultValue={item?.supportedLevels.join(", ") ?? ""}
            className={input}
          />
        </label>
      </div>

      {needsRules && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            Each rule is one sentence: <b>when</b> the auction looks like this, <b>and</b> my
            hand looks like that, <b>then</b> make this call. Blank parts don&apos;t constrain
            anything.
          </p>
          <input type="hidden" name="ruleCount" value={auctionSpecs.length + extraRules} />
          {auctionSpecs.map((rule, i) => (
            <RuleRow key={rule.key} rule={rule} index={i} />
          ))}
          {Array.from({ length: extraRules }, (_, j) => (
            <RuleRow key={`new${j}`} rule={null} index={auctionSpecs.length + j} />
          ))}
          <button
            type="button"
            onClick={() => setExtraRules((n) => n + 1)}
            className="rounded border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-emerald-500 hover:text-emerald-800"
          >
            + Add a rule
          </button>
        </div>
      )}

      {/* Per-type payload controls: only the section for the SELECTED type
          renders — the server reads just that section on save, so showing the
          others would invite edits that get silently ignored. */}
      {knowledgeType === "fallback_rule" && (
      <details open>
        <summary className="text-xs text-neutral-500">Fallback behavior (fallback_rule items)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-sm">
            <span className={label}>Phase</span>
            <select
              name="fb:phase"
              defaultValue={payload.kind === "fallback" ? payload.fallback.phase : "auction"}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="auction">auction (pass)</option>
              <option value="opening_lead">opening lead</option>
              <option value="card_play">card play (lowest legal)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className={label}>Lead style (opening-lead fallback)</span>
            <select
              name="fb:leadStyle"
              defaultValue={
                payload.kind === "fallback" && payload.fallback.phase === "opening_lead"
                  ? payload.fallback.behavior
                  : "low_from_longest"
              }
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {["low_from_longest", "fourth_best", "top_of_sequence", "low_from_honor", "top_of_nothing"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
      )}

      {knowledgeType === "signal_agreement" && (
      <details open>
        <summary className="text-xs text-neutral-500">Signals (signal_agreement items)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["attitude", ["standard", "upside_down", "none"]],
              ["count", ["standard", "reverse", "none"]],
              ["firstDiscard", ["attitude", "count", "none"]],
            ] as const
          ).map(([field, options]) => (
            <label key={field} className="text-sm">
              <span className={label}>{field}</span>
              <select
                name={`sig:${field}`}
                defaultValue={
                  payload.kind === "signals" ? (payload.signals[field] ?? options[0]) : options[0]
                }
                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      )}

      {knowledgeType === "lead_agreement" && (
      <details open>
        <summary className="text-xs text-neutral-500">Lead rules (lead_agreement items)</summary>
        <div className="mt-2 space-y-2">
          <input
            type="hidden"
            name="leadCount"
            value={(payload.kind === "lead_rules" ? payload.leads.length : 0) + 1}
          />
          {[...(payload.kind === "lead_rules" ? payload.leads : []), null].map((lead, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className={label}>Versus</span>
                <select
                  name={`lead${i}:versus`}
                  defaultValue={lead?.versus ?? (i === 0 ? "" : "")}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="">— (skip)</option>
                  <option value="suit">suit contracts</option>
                  <option value="notrump">notrump</option>
                  <option value="any">any</option>
                </select>
              </label>
              <label className="text-sm">
                <span className={label}>Style</span>
                <select
                  name={`lead${i}:style`}
                  defaultValue={lead?.style ?? "fourth_best"}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  {["fourth_best", "top_of_sequence", "low_from_honor", "top_of_nothing", "low_from_longest"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              {lead && (
                <label className="text-xs text-neutral-500">
                  <input type="checkbox" name={`lead${i}:remove`} className="mr-1" /> remove
                </label>
              )}
            </div>
          ))}
        </div>
      </details>
      )}

      {(knowledgeType === "declarer_technique" || knowledgeType === "defensive_technique") && (
      <details open>
        <summary className="text-xs text-neutral-500">Play rules (technique items)</summary>
        <div className="mt-2 space-y-2">
          <input
            type="hidden"
            name="playCount"
            value={(payload.kind === "play_rules" ? payload.rules.length : 0) + 1}
          />
          {[...(payload.kind === "play_rules" ? payload.rules : []), null].map((rule, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className={label}>Behavior</span>
                <select
                  name={`play${i}:behavior`}
                  defaultValue={rule?.behavior ?? ""}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="">— (skip)</option>
                  {[
                    "lowest_following",
                    "highest_following",
                    "win_cheaply",
                    "second_hand_low",
                    "third_hand_high",
                    "cover_honor",
                    "cash_winners",
                    "lowest_legal",
                    "discard_lowest",
                    "draw_trumps",
                    "finesse_toward_tenace",
                    "hold_up_stopper",
                    "duck_to_preserve_entry",
                    "establish_long_suit",
                    "ruff_loser",
                    "discard_loser_on_winner",
                    "cash_out_when_enough",
                    "return_partner_suit",
                    "hold_up_ace",
                    "overruff_or_discard",
                    "second_hand_rise_vs_honor",
                  ].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={label}>Position</span>
                <select
                  name={`play${i}:position`}
                  defaultValue={rule?.position ?? "any"}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  {["lead", "second", "third", "fourth", "any"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={label}>Side</span>
                <select
                  name={`play${i}:side`}
                  defaultValue={rule?.side ?? "any"}
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  {["declarer", "defense", "any"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={label}>Priority</span>
                <input
                  type="number"
                  name={`play${i}:priority`}
                  defaultValue={rule?.priority ?? 10}
                  className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
              {rule && (
                <label className="text-xs text-neutral-500">
                  <input type="checkbox" name={`play${i}:remove`} className="mr-1" /> remove
                </label>
              )}
            </div>
          ))}
        </div>
      </details>
      )}

      {(knowledgeType === "concept" || knowledgeType === "judgment_guideline") && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Teaching content — this type carries no rules. The plain-words text above is the
          whole item; nothing here plays at the table.
        </p>
      )}

      {/* Inline settings the item exposes */}
      <div className="space-y-2">
        <input type="hidden" name="settingCount" value={(item?.settings.length ?? 0) + 1} />
        {[...(item?.settings ?? []), null].map((spec, i) => (
          <fieldset key={spec?.key ?? `new${i}`} className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs text-neutral-500">
              {spec ? `Setting — ${spec.label}` : "New setting (leave key empty to skip)"}
            </legend>
            <div className="grid gap-2 sm:grid-cols-6">
              <label>
                <span className={label}>Key</span>
                <input name={`setting${i}:key`} defaultValue={spec?.key ?? ""} className={input} />
              </label>
              <label>
                <span className={label}>Label</span>
                <input name={`setting${i}:label`} defaultValue={spec?.label ?? ""} className={input} />
              </label>
              <label>
                <span className={label}>Control</span>
                <select name={`setting${i}:control`} defaultValue={spec?.control ?? "toggle"} className={input}>
                  {["toggle", "range_hcp", "number", "single_select", "multi_select"].map((c2) => (
                    <option key={c2}>{c2}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Role</span>
                <select name={`setting${i}:role`} defaultValue={spec?.role ?? "parameter"} className={input}>
                  <option value="enable">enable (on/off gate)</option>
                  <option value="parameter">parameter ($setting)</option>
                </select>
              </label>
              {spec?.control === "range_hcp" ? (
                <>
                  <label>
                    <span className={label}>Default low</span>
                    <input
                      name={`setting${i}:defaultLow`}
                      type="number"
                      defaultValue={(spec.default as { low: number }).low}
                      className={input}
                    />
                  </label>
                  <label>
                    <span className={label}>Default high</span>
                    <input
                      name={`setting${i}:defaultHigh`}
                      type="number"
                      defaultValue={(spec.default as { high: number }).high}
                      className={input}
                    />
                  </label>
                </>
              ) : (
                <label>
                  <span className={label}>Default</span>
                  {spec?.control === "toggle" || (!spec && true) ? (
                    <input
                      name={`setting${i}:default`}
                      type="checkbox"
                      defaultChecked={Boolean(spec?.default ?? true)}
                      className="mt-1.5 block"
                    />
                  ) : (
                    <input name={`setting${i}:default`} defaultValue={String(spec?.default ?? "")} className={input} />
                  )}
                </label>
              )}
              {spec && (
                <label className="self-end text-xs text-neutral-500">
                  <input type="checkbox" name={`setting${i}:remove`} className="mr-1" /> remove
                </label>
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <details>
        <summary className="text-xs text-neutral-500">
          Advanced: raw payload / settings JSON (overrides the typed fields when filled)
        </summary>
        <div className="mt-2 grid gap-2">
          <textarea
            name="payloadJson"
            rows={6}
            placeholder={JSON.stringify(item?.payload ?? { kind: "auction_rules", rules: [] })}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
          <textarea
            name="settingsJson"
            rows={3}
            placeholder={JSON.stringify(item?.settings ?? [])}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
        </div>
      </details>

      <p className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="saveAs"
          value="existing"
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {item ? "Save (recompiles the KB)" : "Create knowledge item"}
        </button>
        {item && (
          <>
            <button
              type="submit"
              name="saveAs"
              value="new"
              className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:border-emerald-400"
            >
              Save as a new knowledge item
            </button>
            <span className="text-xs text-neutral-400">
              — leaves &ldquo;{item.title}&rdquo; untouched
            </span>
          </>
        )}
        <span className="basis-full text-xs text-neutral-400">
          A broken save can&apos;t reach the table — the last good compile keeps serving.
        </span>
      </p>
    </form>
  );
}
