// The ACBL-style convention card (owner requirement: cards are ALWAYS ACBL
// style). Derived from the configuration — never hand-edited. Buckets the
// player's carried rules into the classic card sections structurally (role,
// opening pattern, action) with a keyword assist only for slam conventions.
// Conventions the packs carry but the player has toggled OFF still appear,
// struck — a real card shows the option space, not just the choices.

import type { SettingValue } from "@bridge/config";
import type { CompiledAuctionRule, CompiledKb } from "./compiled";
import type { AuctionAction, CallPattern } from "./language";
import type { KbPlayer } from "./model";

export interface CardEntry {
  ruleId: string;
  label: string;
  itemId: string;
  itemTitle: string;
  /** Enable gate open (off entries render struck, like an unchecked box). */
  on: boolean;
}

export interface CardSettingChip {
  key: string;
  label: string;
  value: SettingValue;
  offDefault: boolean;
}

export interface CardSection {
  id: string;
  title: string;
  entries: CardEntry[];
  /** Ranges/toggles whose declaring item landed in this section. */
  settings: CardSettingChip[];
}

export interface AcblCard {
  playerName: string;
  systemLabel: string;
  kbName: string;
  compileVersion: number;
  sections: CardSection[];
  /** Carding block (leads + signals), rendered like the card's bottom panel. */
  leads: { versus: string; style: string; on: boolean; itemId: string }[];
  signals: { attitude: string; count: string; firstDiscard: string };
  fallbacks: { label: string; itemId: string }[];
}

const SECTION_ORDER: { id: string; title: string }[] = [
  { id: "general", title: "General Approach" },
  { id: "notrump", title: "Notrump Opening Bids" },
  { id: "majors", title: "Major Suit Openings" },
  { id: "minors", title: "Minor Suit Openings" },
  { id: "two_level", title: "2-Level Openings" },
  { id: "slam", title: "Slam Conventions" },
  { id: "overcalls", title: "Overcalls" },
  { id: "doubles", title: "Doubles" },
  { id: "other", title: "Other Agreements" },
];

const SLAM_RE = /blackwood|gerber|rkc|king[\s-]?ask|slam|4nt|5nt/i;

const strains = (p?: CallPattern) => p?.strains ?? [];
const subset = (xs: string[], allowed: string[]) =>
  xs.length > 0 && xs.every((x) => allowed.includes(x));

function actionStrains(action: AuctionAction): string[] {
  if (action.type === "bid") return [action.strain];
  if (action.type === "bid_longest") return action.among;
  if (action.type === "first_legal_of") return action.calls.map((c) => c.strain);
  return [];
}

function bucketOf(rule: CompiledAuctionRule, itemTitle: string): string {
  if (SLAM_RE.test(rule.label) || SLAM_RE.test(itemTitle)) return "slam";
  const { context, action } = rule;

  if (context.role === "overcaller" || context.role === "advancer" || context.contested === true)
    return action.type === "double" || action.type === "redouble" ? "doubles" : "overcalls";
  if (action.type === "double" || action.type === "redouble") return "doubles";

  if (context.role === "opening") {
    const s = actionStrains(action);
    const level = action.type === "bid" ? action.level : undefined;
    if (subset(s, ["N"])) return "notrump";
    if (level !== undefined && level >= 2) return "two_level";
    if (subset(s, ["H", "S"])) return "majors";
    if (subset(s, ["C", "D"])) return "minors";
    return "general";
  }

  // Responses/rebids follow the family of the partnership's opening.
  const opening = strains(context.opening);
  if (subset(opening, ["N"])) return "notrump";
  if (subset(opening, ["H", "S"])) return "majors";
  if (subset(opening, ["C", "D"])) return "minors";
  if (
    context.opening?.levelMin !== undefined &&
    context.opening.levelMin >= 2
  )
    return "two_level";
  return "other";
}

export function acblConventionCard(
  compiled: CompiledKb,
  player: KbPlayer,
  meta: { systemLabel: string; kbName: string },
): AcblCard {
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

  const sections = new Map<string, CardSection>(
    SECTION_ORDER.map((s) => [s.id, { ...s, entries: [], settings: [] }]),
  );

  // Carried rules bucket into sections; the enable gate drives on/off.
  const sectionOfItem = new Map<string, string>();
  for (const rule of compiled.auctionRules) {
    if (!allowed.has(rule.provenance.itemId)) continue;
    const bucket = bucketOf(rule, rule.provenance.itemTitle);
    sectionOfItem.set(rule.provenance.itemId, bucket);
    sections.get(bucket)!.entries.push({
      ruleId: rule.ruleId,
      label: rule.label,
      itemId: rule.provenance.itemId,
      itemTitle: rule.provenance.itemTitle,
      on: gatesOpen(rule.settingGates),
    });
  }

  // Settings land next to the rules of their declaring item.
  for (const spec of compiled.settings) {
    if (!allowed.has(spec.itemId)) continue;
    const bucket = sectionOfItem.get(spec.itemId) ?? "general";
    sections.get(bucket)!.settings.push({
      key: spec.key,
      label: spec.label,
      value: values[spec.key]!,
      offDefault: JSON.stringify(values[spec.key]) !== JSON.stringify(spec.default),
    });
  }

  const leads = compiled.leadRules
    .filter((r) => allowed.has(r.provenance.itemId))
    .map((r) => ({
      versus: r.lead.versus,
      style: r.lead.style.replace(/_/g, " "),
      on: gatesOpen(r.settingGates),
      itemId: r.provenance.itemId,
    }));

  const fallbacks = compiled.fallbacks
    .filter((f) => allowed.has(f.provenance.itemId))
    .map((f) => ({
      label: `${f.fallback.phase.replace(/_/g, " ")}: ${f.fallback.behavior.replace(/_/g, " ")}`,
      itemId: f.provenance.itemId,
    }));

  return {
    playerName: player.name,
    systemLabel: meta.systemLabel,
    kbName: meta.kbName,
    compileVersion: compiled.version,
    sections: SECTION_ORDER.map((s) => sections.get(s.id)!).filter(
      (s) => s.entries.length > 0 || s.settings.length > 0,
    ),
    leads,
    signals: {
      attitude: compiled.signalDefaults.attitude ?? "standard",
      count: compiled.signalDefaults.count ?? "standard",
      firstDiscard: compiled.signalDefaults.firstDiscard ?? "attitude",
    },
    fallbacks,
  };
}
