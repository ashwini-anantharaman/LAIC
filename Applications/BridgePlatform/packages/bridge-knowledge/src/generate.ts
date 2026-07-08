// Generation runs (Bridge plan §12.10 steps 7-8): approved readable knowledge
// items -> generated artifacts -> an assembled BridgeRulePackage draft, with
// lineage on every artifact and a diff against the last published version.
// Publication (step 8) validates the publish gate and freezes the version.

import {
  KNOWN_PREDICATES,
  KNOWN_PRIMITIVES,
  validatePackage,
  type BidRuleEntry,
  type BridgeRulePackage,
  type PlayRuleEntry,
} from "@bridge/engine";
import type { Setting } from "@bridge/config";
import type {
  BidRulePayload,
  BridgeGeneratedArtifact,
  BridgeGenerationRun,
  GenerationDiff,
  PlayRulePayload,
  PublishedPackageRecord,
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
 * Run a generation: collect this system's APPROVED items, assemble the
 * package, validate, diff against the latest published version, and persist
 * a draft package record + the run (with full input-item snapshot).
 */
export async function runGeneration(
  store: KnowledgeStore,
  req: GenerationRequest,
): Promise<BridgeGenerationRun> {
  const errors: string[] = [];
  const approved = await store.listItems({
    systemFamily: req.systemFamily,
    status: "approved",
  });

  const fail = async (why: string[]): Promise<BridgeGenerationRun> => {
    const run: BridgeGenerationRun = {
      runId: req.runId,
      systemFamily: req.systemFamily,
      requestedBy: req.requestedBy,
      createdAt: req.now,
      status: "failed",
      inputItems: approved.map((i) => ({ itemId: i.itemId, version: i.version })),
      diff: null,
      errors: why,
    };
    await store.saveRun(run);
    return run;
  };

  const systemItem = approved.find((i) => i.itemType === "system");
  if (!systemItem) return fail([`no approved "system" item for family ${req.systemFamily}`]);
  const packageId = systemItem.structuredFields.packageId as string | undefined;
  if (!packageId) return fail([`system item ${systemItem.itemId} has no structuredFields.packageId`]);

  const settings: Setting[] = [];
  const settingArtifactSources = new Map<string, string>(); // setting key -> itemId
  for (const item of approved.filter((i) => i.itemType === "setting_definition")) {
    const setting = item.structuredFields.setting as Setting | undefined;
    if (!setting) errors.push(`${item.itemId}: setting_definition without structuredFields.setting`);
    else {
      settings.push(setting);
      settingArtifactSources.set(setting.key, item.itemId);
    }
  }

  const bidRules: BidRuleEntry[] = [];
  for (const item of approved.filter((i) => i.itemType === "bidding_rule")) {
    const payload = item.structuredFields.rule as BidRulePayload | undefined;
    if (!payload) {
      errors.push(`${item.itemId}: bidding_rule without structuredFields.rule`);
      continue;
    }
    bidRules.push({
      ...payload,
      provenance: {
        knowledgeItemIds: [item.itemId, ...(item.relatedItemIds ?? [])],
        sourceIds: item.sourceIds,
        reviewStatus: "approved",
      },
      explanationItemId: item.itemId,
    });
  }

  const playRules: PlayRuleEntry[] = [];
  for (const item of approved.filter((i) => i.itemType === "play_rule" || i.itemType === "lead_rule")) {
    const payload = item.structuredFields.rule as PlayRulePayload | undefined;
    if (!payload) {
      errors.push(`${item.itemId}: ${item.itemType} without structuredFields.rule`);
      continue;
    }
    playRules.push({
      ...payload,
      provenance: {
        knowledgeItemIds: [item.itemId, ...(item.relatedItemIds ?? [])],
        sourceIds: item.sourceIds,
        reviewStatus: "approved",
      },
      explanationItemId: item.itemId,
    });
  }

  const previous = await store.getLatestPublished(packageId);
  const version = bumpVersion(previous?.version ?? null, req.bump ?? "minor");

  const pkg: BridgeRulePackage = {
    packageId,
    systemFamily: req.systemFamily,
    version,
    status: "draft",
    settings,
    bidRules,
    playRules,
  };
  errors.push(...validatePackage(pkg, KNOWN_PREDICATES, KNOWN_PRIMITIVES));
  if (errors.length) return fail(errors);

  const diff: GenerationDiff = {
    previousVersion: previous?.version ?? null,
    bidRules: diffEntries(previous?.pkg.bidRules ?? [], bidRules, (r) => r.ruleId),
    playRules: diffEntries(previous?.pkg.playRules ?? [], playRules, (r) => r.ruleId),
    settings: diffEntries(previous?.pkg.settings ?? [], settings, (s) => s.key),
  };

  const artifacts: BridgeGeneratedArtifact[] = [
    ...bidRules.map((r) => ({
      artifactId: `${packageId}@${version}/${r.ruleId}`,
      artifactType: "bidding_rule" as const,
      generatedFromKnowledgeItemIds: r.provenance.knowledgeItemIds,
      generatedFromSourceIds: r.provenance.sourceIds,
      packageId,
      version,
      status: "draft" as const,
      artifactPayload: r,
    })),
    ...playRules.map((r) => ({
      artifactId: `${packageId}@${version}/${r.ruleId}`,
      artifactType: "play_rule" as const,
      generatedFromKnowledgeItemIds: r.provenance.knowledgeItemIds,
      generatedFromSourceIds: r.provenance.sourceIds,
      packageId,
      version,
      status: "draft" as const,
      artifactPayload: r,
    })),
    ...settings.map((s) => ({
      artifactId: `${packageId}@${version}/setting:${s.key}`,
      artifactType: "setting_registry_entry" as const,
      generatedFromKnowledgeItemIds: [settingArtifactSources.get(s.key)!],
      generatedFromSourceIds:
        approved.find((i) => i.itemId === settingArtifactSources.get(s.key))?.sourceIds ?? [],
      packageId,
      version,
      status: "draft" as const,
      artifactPayload: s,
    })),
  ];

  await store.savePackage({
    packageId,
    version,
    status: "draft",
    createdAt: req.now,
    pkg,
    artifacts,
  });

  const run: BridgeGenerationRun = {
    runId: req.runId,
    systemFamily: req.systemFamily,
    requestedBy: req.requestedBy,
    createdAt: req.now,
    status: "completed",
    inputItems: approved.map((i) => ({ itemId: i.itemId, version: i.version })),
    diff,
    errors: [],
    resultPackageId: packageId,
    resultVersion: version,
  };
  await store.saveRun(run);
  return run;
}

/**
 * Publish a generated draft (Bridge plan §12.8): re-validate with the
 * publish gate active, flip to published, freeze. Published versions are
 * immutable; corrections create new versions via edit -> re-approve ->
 * regenerate (§12.10 step 10).
 */
export async function publishPackage(
  store: KnowledgeStore,
  packageId: string,
  version: string,
  publishedBy: string,
  now: string,
): Promise<PublishedPackageRecord> {
  const record = await store.getPackage(packageId, version);
  if (!record) throw new Error(`No package ${packageId}@${version}`);
  if (record.status === "published") throw new Error(`${packageId}@${version} already published`);

  const publishedPkg: BridgeRulePackage = { ...record.pkg, status: "published" };
  const errors = validatePackage(publishedPkg, KNOWN_PREDICATES, KNOWN_PRIMITIVES);
  if (errors.length) throw new Error(`Publish gate failed:\n${errors.join("\n")}`);

  const published: PublishedPackageRecord = {
    ...record,
    status: "published",
    publishedBy,
    publishedAt: now,
    pkg: publishedPkg,
    artifacts: record.artifacts.map((a) => ({ ...a, status: "published" })),
  };
  await store.savePackage(published);
  return published;
}
