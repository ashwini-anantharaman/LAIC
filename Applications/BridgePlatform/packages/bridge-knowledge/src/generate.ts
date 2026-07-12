// Generation runs (Bridge plan §12.10 steps 7-8): active readable knowledge
// items -> generated artifacts -> an assembled, immediately usable
// BridgeRulePackage version, with lineage on every artifact and a diff
// against the previous version. There is no separate publish step (revised
// decision 3): every generated version is immutable and carries its
// golden-board baseline; citation gaps surface as warnings, never blockers.

import {
  createPackageDecider,
  GOLDEN_BOARDS,
  KNOWN_PREDICATES,
  KNOWN_PRIMITIVES,
  runBoards,
  validatePackage,
  type BidRuleEntry,
  type BridgeRulePackage,
  type ConfigPresetEntry,
  type PlayRuleEntry,
} from "@bridge/engine";
import { defaultSettingValues } from "@bridge/config";
import type { Setting } from "@bridge/config";
import { unknownConceptIds, unknownSkillIds } from "@bridge/taxonomy";
import type {
  BidRulePayload,
  BridgeGeneratedArtifact,
  BridgeGenerationRun,
  GenerationDiff,
  PlayRulePayload,
  RulePackageRecord,
  RuleDiffEntry,
  SystemFamily,
} from "./model";
import type { KnowledgeStore } from "./store";

export interface GenerationRequest {
  systemFamily: SystemFamily;
  requestedBy: string;
  bump?: "major" | "minor" | "patch";
  /** Injected so generation stays deterministic and replayable. */
  now: string;
  runId: string;
}

const bumpVersion = (prev: string | null, bump: "major" | "minor" | "patch"): string => {
  if (!prev) return "0.1.0";
  const [ma = 0, mi = 0, pa = 0] = prev.split(".").map(Number);
  if (bump === "major") return `${ma + 1}.0.0`;
  if (bump === "patch") return `${ma}.${mi}.${pa + 1}`;
  return `${ma}.${mi + 1}.0`;
};

function diffEntries<T extends object>(
  before: T[],
  after: T[],
  idOf: (t: T) => string,
): RuleDiffEntry[] {
  const out: RuleDiffEntry[] = [];
  const beforeById = new Map(before.map((r) => [idOf(r), r]));
  const afterById = new Map(after.map((r) => [idOf(r), r]));
  for (const [id, b] of beforeById) {
    const a = afterById.get(id);
    if (!a) out.push({ id, change: "removed" });
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ id, change: "changed" });
  }
  for (const id of afterById.keys()) {
    if (!beforeById.has(id)) out.push({ id, change: "added" });
  }
  return out;
}

/**
 * Run a generation: collect this system's ACTIVE items, assemble the package,
 * validate structurally, diff against the latest version, measure the
 * golden-board baseline, and persist the new immutable version + the run
 * (with full input-item snapshot and citation warnings).
 */
export async function runGeneration(
  store: KnowledgeStore,
  req: GenerationRequest,
): Promise<BridgeGenerationRun> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const active = await store.listItems({
    systemFamily: req.systemFamily,
    status: "active",
  });

  const fail = async (why: string[]): Promise<BridgeGenerationRun> => {
    const run: BridgeGenerationRun = {
      runId: req.runId,
      systemFamily: req.systemFamily,
      requestedBy: req.requestedBy,
      createdAt: req.now,
      status: "failed",
      inputItems: active.map((i) => ({ itemId: i.itemId, version: i.version })),
      diff: null,
      errors: why,
    };
    await store.saveRun(run);
    return run;
  };

  const systemItem = active.find((i) => i.itemType === "system");
  if (!systemItem) return fail([`no active "system" item for family ${req.systemFamily}`]);
  const packageId = systemItem.structuredFields.packageId as string | undefined;
  if (!packageId) return fail([`system item ${systemItem.itemId} has no structuredFields.packageId`]);

  // Citation coverage: visibility, not a gate (revised decision 3).
  const warnUncited = (itemId: string, citations: unknown[], sourceIds: string[]): void => {
    if (!citations.length || !sourceIds.length)
      warnings.push(`${itemId}: uncited — no source citations; rule will be badged in the UI`);
  };

  // §13.5 taxonomy tags: unknown ids and untagged rules are warnings, never
  // gates. No-agreement catch-alls are exempt — they exercise no skill.
  const warnTags = (
    item: { itemId: string; relatedSkillIds?: string[]; relatedConceptIds?: string[] },
    noAgreement?: boolean,
  ): void => {
    const badSkills = unknownSkillIds(item.relatedSkillIds ?? []);
    const badConcepts = unknownConceptIds(item.relatedConceptIds ?? []);
    if (badSkills.length)
      warnings.push(`${item.itemId}: unknown skill ids [${badSkills.join(", ")}] — not in @bridge/taxonomy`);
    if (badConcepts.length)
      warnings.push(`${item.itemId}: unknown concept ids [${badConcepts.join(", ")}] — not in @bridge/taxonomy`);
    if (!noAgreement && !(item.relatedSkillIds ?? []).length)
      warnings.push(`${item.itemId}: no relatedSkillIds — progress can't attribute this rule to skills`);
  };

  const settings: Setting[] = [];
  const settingArtifactSources = new Map<string, string>(); // setting key -> itemId
  for (const item of active.filter((i) => i.itemType === "setting_definition")) {
    const setting = item.structuredFields.setting as Setting | undefined;
    if (!setting) errors.push(`${item.itemId}: setting_definition without structuredFields.setting`);
    else {
      settings.push(setting);
      settingArtifactSources.set(setting.key, item.itemId);
    }
  }

  const bidRules: BidRuleEntry[] = [];
  for (const item of active.filter((i) => i.itemType === "bidding_rule")) {
    const payload = item.structuredFields.rule as BidRulePayload | undefined;
    if (!payload) {
      errors.push(`${item.itemId}: bidding_rule without structuredFields.rule`);
      continue;
    }
    warnUncited(item.itemId, item.citations, item.sourceIds);
    warnTags(item, payload.noAgreement);
    bidRules.push({
      ...payload,
      relatedSkillIds: item.relatedSkillIds ?? [],
      relatedConceptIds: item.relatedConceptIds ?? [],
      provenance: {
        knowledgeItemIds: [item.itemId, ...(item.relatedItemIds ?? [])],
        sourceIds: item.sourceIds,
      },
      explanationItemId: item.itemId,
    });
  }

  const playRules: PlayRuleEntry[] = [];
  for (const item of active.filter((i) => i.itemType === "play_rule" || i.itemType === "lead_rule")) {
    const payload = item.structuredFields.rule as PlayRulePayload | undefined;
    if (!payload) {
      errors.push(`${item.itemId}: ${item.itemType} without structuredFields.rule`);
      continue;
    }
    warnUncited(item.itemId, item.citations, item.sourceIds);
    warnTags(item);
    playRules.push({
      ...payload,
      relatedSkillIds: item.relatedSkillIds ?? [],
      relatedConceptIds: item.relatedConceptIds ?? [],
      provenance: {
        knowledgeItemIds: [item.itemId, ...(item.relatedItemIds ?? [])],
        sourceIds: item.sourceIds,
      },
      explanationItemId: item.itemId,
    });
  }

  // §11.3 presets are content: explicit value maps from knowledge items.
  const presets: ConfigPresetEntry[] = [];
  const presetArtifactSources = new Map<string, string>(); // presetId -> itemId
  for (const item of active.filter((i) => i.itemType === "configuration_preset")) {
    const preset = item.structuredFields.preset as ConfigPresetEntry | undefined;
    if (!preset) {
      errors.push(`${item.itemId}: configuration_preset without structuredFields.preset`);
      continue;
    }
    warnUncited(item.itemId, item.citations, item.sourceIds);
    presets.push(preset);
    presetArtifactSources.set(preset.presetId, item.itemId);
  }

  const previous = await store.getLatest(packageId);
  const version = bumpVersion(previous?.version ?? null, req.bump ?? "minor");

  const pkg: BridgeRulePackage = {
    packageId,
    systemFamily: req.systemFamily,
    version,
    status: "active",
    settings,
    bidRules,
    playRules,
    presets,
  };
  errors.push(...validatePackage(pkg, KNOWN_PREDICATES, KNOWN_PRIMITIVES));
  if (errors.length) return fail(errors);

  // §19.3 quality checks (non-blocking warnings, surfaced on the run view):
  // every setting must be referenced by >=1 rule gate or marked UI-only.
  const referencedKeys = new Set(
    [...bidRules, ...playRules].flatMap((r) => r.settingGates.map((g) => g.key)),
  );
  warnings.push(
    ...settings
      .filter((s) => !referencedKeys.has(s.key) && !s.uiOnly)
      .map((s) => `§19.3: setting "${s.key}" is referenced by no rule and not marked uiOnly`),
  );

  const diff: GenerationDiff = {
    previousVersion: previous?.version ?? null,
    bidRules: diffEntries(previous?.pkg.bidRules ?? [], bidRules, (r) => r.ruleId),
    playRules: diffEntries(previous?.pkg.playRules ?? [], playRules, (r) => r.ruleId),
    settings: diffEntries(previous?.pkg.settings ?? [], settings, (s) => s.key),
    presets: diffEntries(previous?.pkg.presets ?? [], presets, (p) => p.presetId),
  };

  const artifacts: BridgeGeneratedArtifact[] = [
    ...bidRules.map((r) => ({
      artifactId: `${packageId}@${version}/${r.ruleId}`,
      artifactType: "bidding_rule" as const,
      generatedFromKnowledgeItemIds: r.provenance.knowledgeItemIds,
      generatedFromSourceIds: r.provenance.sourceIds,
      packageId,
      version,
      status: "active" as const,
      artifactPayload: r,
    })),
    ...playRules.map((r) => ({
      artifactId: `${packageId}@${version}/${r.ruleId}`,
      artifactType: "play_rule" as const,
      generatedFromKnowledgeItemIds: r.provenance.knowledgeItemIds,
      generatedFromSourceIds: r.provenance.sourceIds,
      packageId,
      version,
      status: "active" as const,
      artifactPayload: r,
    })),
    ...presets.map((p) => ({
      artifactId: `${packageId}@${version}/preset:${p.presetId}`,
      artifactType: "ai_player_default" as const,
      generatedFromKnowledgeItemIds: [presetArtifactSources.get(p.presetId)!],
      generatedFromSourceIds:
        active.find((i) => i.itemId === presetArtifactSources.get(p.presetId))?.sourceIds ?? [],
      packageId,
      version,
      status: "active" as const,
      artifactPayload: p,
    })),
    ...settings.map((s) => ({
      artifactId: `${packageId}@${version}/setting:${s.key}`,
      artifactType: "setting_registry_entry" as const,
      generatedFromKnowledgeItemIds: [settingArtifactSources.get(s.key)!],
      generatedFromSourceIds:
        active.find((i) => i.itemId === settingArtifactSources.get(s.key))?.sourceIds ?? [],
      packageId,
      version,
      status: "active" as const,
      artifactPayload: s,
    })),
  ];

  // §19.3: measure the golden-board fallback baseline at generation so every
  // usable version carries a quality number.
  const harness = await runBoards(
    GOLDEN_BOARDS,
    createPackageDecider({ pkg, values: defaultSettingValues(pkg.settings) }),
  );

  // §19.3 test-hand linkage: which golden boards exercise which rules —
  // computed from the actual harness decisions, not manual declarations.
  const boardsByRule = new Map<string, string[]>();
  for (const b of harness.boards)
    for (const ruleId of b.matchedRuleIds)
      boardsByRule.set(ruleId, [...(boardsByRule.get(ruleId) ?? []), b.name]);
  const untestedRuleIds = [...bidRules, ...playRules]
    .map((r) => r.ruleId)
    .filter((id) => !boardsByRule.has(id));
  warnings.push(
    ...untestedRuleIds.map(
      (id) => `§19.3: no golden board exercises rule "${id}" — add a test hand where feasible`,
    ),
  );
  const changedRuleIds = [...diff.bidRules, ...diff.playRules]
    .filter((d) => d.change !== "removed")
    .map((d) => d.id);
  const testCoverage = {
    untestedRuleIds,
    affectedTests: changedRuleIds.map((ruleId) => ({
      ruleId,
      boards: boardsByRule.get(ruleId) ?? [],
    })),
  };

  const record: RulePackageRecord = {
    packageId,
    version,
    status: "active",
    createdAt: req.now,
    pkg,
    artifacts,
    baseline: {
      boards: harness.totals.boards,
      bidFallbackRate: harness.totals.bidFallbackRate,
      playFallbackRate: harness.totals.playFallbackRate,
    },
  };
  await store.savePackage(record);

  const run: BridgeGenerationRun = {
    runId: req.runId,
    systemFamily: req.systemFamily,
    requestedBy: req.requestedBy,
    createdAt: req.now,
    status: "completed",
    inputItems: active.map((i) => ({ itemId: i.itemId, version: i.version })),
    diff,
    errors: [],
    warnings,
    testCoverage,
    resultPackageId: packageId,
    resultVersion: version,
  };
  await store.saveRun(run);
  return run;
}

/**
 * Attach generated test boards to a package version (Bridge plan §22 Q8).
 * Boards are artifacts with their own lineage payload; appending them never
 * touches the version's rule content (which stays immutable).
 */
export async function attachTestBoardArtifacts(
  store: KnowledgeStore,
  packageId: string,
  version: string,
  boards: readonly unknown[],
  generatedFromKnowledgeItemIds: string[],
): Promise<void> {
  const record = await store.getPackage(packageId, version);
  if (!record) throw new Error(`No package ${packageId}@${version}`);
  await store.savePackage({
    ...record,
    artifacts: [
      ...record.artifacts,
      ...boards.map((board, i) => ({
        artifactId: `${packageId}@${version}/test_board:${i}`,
        artifactType: "test_board_reference" as const,
        generatedFromKnowledgeItemIds,
        generatedFromSourceIds: [],
        packageId,
        version,
        status: "active" as const,
        artifactPayload: board,
      })),
    ],
  });
}
