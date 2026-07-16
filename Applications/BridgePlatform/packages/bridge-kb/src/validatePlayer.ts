// Static player validation (Knowledge Rework §3): the capability checklist
// gates `valid`. A player is minimally complete when every category of the
// minimum full-game set is satisfied by an applicable item or an explicit
// fallback in its EFFECTIVE item set (packs union + enable-setting gates),
// no two activated items conflict, and every requires edge is satisfied.
// The self-play simulation (engine side) is a report, never a gate.

import { CAPABILITY_CATEGORIES } from "./capabilities";
import type { CompiledKb } from "./compiled";
import type {
  CapabilityResult,
  KbPlayer,
  PlayerValidationReport,
} from "./model";

interface Activated {
  /** Items allowed by the enabled packs (before rule filtering). */
  allowed: Set<string>;
  itemIds: Set<string>;
  /** Live auction/lead/play rules after pack + gate filtering. */
  auction: CompiledKb["auctionRules"];
  leads: CompiledKb["leadRules"];
  plays: CompiledKb["playRules"];
  fallbackPhases: Set<string>;
  fallbackItemByPhase: Map<string, string>;
}

function activatedSurface(compiled: CompiledKb, player: KbPlayer): Activated {
  const enabled = new Set(
    player.enabledPackIds.length ? player.enabledPackIds : compiled.packs.map((p) => p.packId),
  );
  const allowed = new Set<string>();
  for (const pack of compiled.packs) {
    if (enabled.has(pack.packId)) for (const id of pack.itemIds) allowed.add(id);
  }
  if (compiled.packs.length === 0) for (const i of compiled.items) allowed.add(i.itemId);

  const values = { ...compiled.defaults, ...player.settingOverrides };
  const gatesOpen = (gates: string[]) => gates.every((key) => Boolean(values[key]));

  const auction = compiled.auctionRules.filter(
    (r) => allowed.has(r.provenance.itemId) && gatesOpen(r.settingGates),
  );
  const leads = compiled.leadRules.filter(
    (r) => allowed.has(r.provenance.itemId) && gatesOpen(r.settingGates),
  );
  const plays = compiled.playRules.filter(
    (r) => allowed.has(r.provenance.itemId) && gatesOpen(r.settingGates),
  );

  const fallbackPhases = new Set<string>();
  const fallbackItemByPhase = new Map<string, string>();
  for (const f of compiled.fallbacks) {
    if (!allowed.has(f.provenance.itemId)) continue;
    fallbackPhases.add(f.fallback.phase);
    fallbackItemByPhase.set(f.fallback.phase, f.provenance.itemId);
  }

  const itemIds = new Set<string>();
  for (const r of auction) itemIds.add(r.provenance.itemId);
  for (const r of leads) itemIds.add(r.provenance.itemId);
  for (const r of plays) itemIds.add(r.provenance.itemId);
  for (const id of fallbackItemByPhase.values()) itemIds.add(id);

  return { allowed, itemIds, auction, leads, plays, fallbackPhases, fallbackItemByPhase };
}

/** Which capability category (if any) an auction rule speaks to. */
function auctionCategories(rule: CompiledKb["auctionRules"][number]): string[] {
  const { context, action } = rule;
  const out: string[] = [];
  if (context.role === "opening" || context.role === "any") out.push("auction.opening");
  if (action.type === "pass") out.push("auction.pass");
  if (context.role === "responder" || context.role === "any") {
    const strains = context.opening?.strains;
    const isNt = strains?.length === 1 && strains[0] === "N";
    out.push(isNt ? "auction.responses_nt" : "auction.responses_suit");
    if (!strains && !context.opening) out.push("auction.responses_nt");
  }
  if ((context.role === "opener" || context.role === "any") && (context.roundMin ?? 2) >= 2)
    out.push("auction.opener_rebids");
  if (context.role === "responder" && (context.roundMin ?? 0) >= 2)
    out.push("auction.responder_rebids");
  if (context.role === "overcaller" || context.role === "advancer" || context.contested)
    out.push("auction.competitive");
  if (action.type === "double" || action.type === "redouble") out.push("auction.doubles");
  if (
    context.rhoLast?.kind === "bid" &&
    (context.rhoLast.levelMin ?? 1) >= 2
  )
    out.push("auction.preempts");
  return out;
}

function playCategories(rule: CompiledKb["playRules"][number]): string[] {
  const out: string[] = [];
  const spec = rule.spec;
  const declarer = spec.side === "declarer" || spec.side === "any" || spec.side === undefined;
  const defense = spec.side === "defense" || spec.side === "any" || spec.side === undefined;
  if (declarer) {
    out.push("declarer.legal_card");
    if (spec.behavior === "cash_winners") out.push("declarer.cash_winners");
    if (spec.behavior === "lowest_legal" || spec.behavior === "lowest_following")
      out.push("declarer.fallback");
  }
  if (defense) {
    if (spec.position === "second" || spec.behavior === "second_hand_low")
      out.push("defense.second_hand");
    if (spec.position === "third" || spec.behavior === "third_hand_high")
      out.push("defense.third_hand");
    if (
      spec.behavior === "lowest_following" ||
      spec.behavior === "discard_lowest" ||
      spec.behavior === "lowest_legal"
    )
      out.push("defense.follow_discard");
  }
  return out;
}

export function validatePlayerStatic(
  compiled: CompiledKb,
  player: KbPlayer,
): PlayerValidationReport {
  const surface = activatedSurface(compiled, player);

  const satisfiers = new Map<string, string[]>();
  const add = (categoryId: string, itemId: string) => {
    const list = satisfiers.get(categoryId) ?? [];
    if (!list.includes(itemId)) list.push(itemId);
    satisfiers.set(categoryId, list);
  };

  for (const rule of surface.auction)
    for (const cat of auctionCategories(rule)) add(cat, rule.provenance.itemId);
  for (const rule of surface.plays)
    for (const cat of playCategories(rule)) add(cat, rule.provenance.itemId);
  for (const rule of surface.leads) add("lead.policy", rule.provenance.itemId);

  // Signals: any live signal item, or the explicit "none" policy in defaults.
  const signalItem = compiled.items.find(
    (i) => i.knowledgeType === "signal_agreement" && surface.allowed.has(i.itemId),
  );
  if (signalItem) add("defense.signals", signalItem.itemId);

  const staticResults: CapabilityResult[] = CAPABILITY_CATEGORIES.map((cat) => {
    let satisfiedBy = satisfiers.get(cat.categoryId) ?? [];
    if (!satisfiedBy.length && cat.fallbackPhase) {
      const fb = surface.fallbackItemByPhase.get(cat.fallbackPhase);
      if (fb) satisfiedBy = [fb];
    }

    return {
      categoryId: cat.categoryId,
      ok: satisfiedBy.length > 0,
      satisfiedBy: satisfiedBy.length ? satisfiedBy : undefined,
      explanation: satisfiedBy.length
        ? `covered by ${satisfiedBy.length} item(s)`
        : `nothing in the enabled packs covers "${cat.name}"`,
    };
  });

  // Conflicts bite at the player (decision 13): both endpoints activated.
  const conflicts = compiled.conflicts
    .filter((c) => surface.itemIds.has(c.aItemId) && surface.itemIds.has(c.bItemId))
    .map((c) => ({
      aItemId: c.aItemId,
      bItemId: c.bItemId,
      explanation: "both items are active in this configuration but conflict",
    }));

  // requires edges: an activated item's requirement must be carried — and,
  // when the target actually bears rules, those rules must be live (a carried
  // prose/concept target satisfies; a carried-but-toggled-off rule target is
  // a real incoherence and flags).
  const ruleBearing = new Set(
    [...compiled.auctionRules, ...compiled.leadRules, ...compiled.playRules, ...compiled.fallbacks].map(
      (r) => r.provenance.itemId,
    ),
  );
  const missingRequires = compiled.requires
    .filter((r) => {
      if (!surface.itemIds.has(r.itemId)) return false; // source not active
      if (!surface.allowed.has(r.requiresItemId)) return true; // not carried
      return ruleBearing.has(r.requiresItemId) && !surface.itemIds.has(r.requiresItemId);
    })
    .map((r) => ({ itemId: r.itemId, requiresItemId: r.requiresItemId }));

  return { static: staticResults, conflicts, missingRequires };
}

/** `valid` iff every category ok, no conflicts, no missing requires. */
export function playerIsValid(report: PlayerValidationReport): boolean {
  return (
    report.static.every((r) => r.ok) &&
    report.conflicts.length === 0 &&
    report.missingRequires.length === 0
  );
}
