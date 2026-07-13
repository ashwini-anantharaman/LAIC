import { writeFileSync } from "node:fs";
// @ts-ignore
import { SETTINGS } from "/Users/aryan/Documents/CodeProjects/bridgebot/src/vendor/config/data/registry.ts";
// @ts-ignore
import { VALUE_PRESETS } from "/Users/aryan/Documents/CodeProjects/bridgebot/src/vendor/config/data/valuePresets.ts";

// Prototype keys already represented by (or aliased to) platform settings.
const ALIAS: Record<string, string> = {
  nt1_range: "nt1_range", // defined as wired level2 content, not imported
  nt_stayman: "bn2_stayman",
  nt_jacoby_transfers: "bn2_transfers",
  open_2hs: "bn2_weak_twos",
  open_2c: "bn2_strong_2c",
};
// Settings a platform rule genuinely consumes (everything else is uiOnly —
// browsable, configurable, and honestly marked "not yet wired to rules").
const WIRED = new Set<string>();

const items = SETTINGS.filter((s: any) => !ALIAS[s.key]).map((s: any) => {
  const setting: Record<string, unknown> = {
    key: s.key, label: s.label, control: s.control,
    ...(s.options ? { options: s.options } : {}),
    default: s.default, module: s.module,
    ...(s.group ? { group: s.group } : {}),
    exclusive_group: s.exclusive_group ?? null,
    depends_on: s.depends_on ? (ALIAS[s.depends_on.key] ? { ...s.depends_on, key: ALIAS[s.depends_on.key] } : s.depends_on) : null,
    skill_level: s.skill_level, coach_supported: s.coach_supported,
    binds_to: s.binds_to, aliases: s.aliases ?? [],
    description: s.description,
    ...(s.min !== undefined ? { min: s.min } : {}),
    ...(s.max !== undefined ? { max: s.max } : {}),
    origin: s.origin ?? "bridgebot prototype",
    ...(WIRED.has(s.key) ? {} : { uiOnly: true }),
  };
  return {
    itemId: `ki_proto_${s.key}`,
    itemType: "setting_definition",
    title: `Setting: ${s.label}`,
    humanReadableRule: s.description,
    structuredFields: { setting },
    sourceIds: ["src_claude"],
    citations: [{
      sourceId: "src_claude",
      passage: `paraphrase: ported from the bridgebot prototype registry (origin tag: ${s.origin ?? "TB"}); ${WIRED.has(s.key) ? "wired to rules" : "not yet consumed by a rule — display/agreement only until rules land"}`,
    }],
    gapIds: [],
  };
});

const presets = VALUE_PRESETS.map((p: any) => {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p.values)) values[ALIAS[k] ?? k] = v;
  return {
    itemId: `ki_proto_preset_${p.id}`,
    itemType: "configuration_preset",
    title: `Preset: ${p.label ?? p.id}`,
    humanReadableRule: p.description ?? `The prototype's "${p.label ?? p.id}" value preset.`,
    structuredFields: {
      preset: { presetId: `proto_${p.id}`, name: p.label ?? p.id, description: p.description ?? "Ported prototype preset.", values },
    },
    sourceIds: ["src_claude"],
    citations: [{ sourceId: "src_claude", passage: "paraphrase: preset values ported verbatim from the bridgebot prototype" }],
    gapIds: [],
  };
});

const header = `// GENERATED port of the bridgebot prototype's full setting registry
// (${items.length} settings, ${presets.length} presets) — regenerate with
// scratchpad/gen-registry.mts if the prototype registry changes.
//
// Sourcing (owner decision 2026-07-12): the registry has no external
// publication, so every item cites src_claude — Claude named as the source.
// Settings a platform rule does not yet consume are marked uiOnly and their
// citation says so honestly; they become "wired" as rules land.

import type { BridgeReadableKnowledgeItem } from "../model";

const NOW = "2026-07-12T00:00:00.000Z";

const base = { systemFamily: "natural", status: "active", version: "1", createdBy: "bridge_workstream_dev", createdAt: NOW } as const;

export const PROTOTYPE_REGISTRY_ITEMS: BridgeReadableKnowledgeItem[] = ([
`;
const body = [...items, ...presets].map((i: any) => "  " + JSON.stringify(i)).join(",\n");
const footer = `
] as const).map((i) => ({ ...base, ...i })) as unknown as BridgeReadableKnowledgeItem[];
`;
writeFileSync(
  "/Users/aryan/Documents/CodeProjects/nexus/Applications/BridgePlatform/packages/bridge-knowledge/src/content/prototypeRegistry.ts",
  header + body + footer,
);
console.log("generated:", items.length, "settings,", presets.length, "presets");
