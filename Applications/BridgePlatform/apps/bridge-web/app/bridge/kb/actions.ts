"use server";

// KB workspace server actions (Knowledge Rework §6). Every mutation is
// audited; every content save recompiles via the service (last-good). The
// fellow permission gate is bridge.knowledge.edit; suggestions only need
// review access.

import { newId, type EdgeType, type KbSource } from "@bridge/kb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fileToText, uploadDocument } from "@/lib/documents";
import { createClaudeExtractor, extractionAvailable } from "@/lib/extraction";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { parseCommon, parsePayload, parseSettings } from "@/lib/itemForm";

const kbPath = (kbId: string, rest = "") => `/bridge/kb/${kbId}${rest}`;

export async function createKbAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kb = await kbService().createKb({
    name: String(formData.get("name") ?? "").trim(),
    systemLabel: String(formData.get("systemLabel") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.create", "kb", kb.kbId, { name: kb.name });
  redirect(kbPath(kb.kbId));
}

export async function createItemAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const common = parseCommon(formData);
  const item = await kbService().createItem(kbId, {
    ...common,
    payload: parsePayload(formData, common.knowledgeType),
    settings: parseSettings(formData),
    sourceReferences: [
      { sourceId: "src_claude", anchor: "fellow-authored in the workspace" },
    ],
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.item.create", "kb_item", item.itemId, { kbId });
  redirect(kbPath(kbId, `/items/${item.itemId}`));
}

export async function saveItemAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemId = String(formData.get("itemId"));
  const common = parseCommon(formData);
  const saved = await kbService().saveItem(
    kbId,
    itemId,
    {
      ...common,
      payload: parsePayload(formData, common.knowledgeType),
      settings: parseSettings(formData),
    },
    context.nexusUserId,
  );
  await audit(context, "kb.item.edit", "kb_item", saved.itemId, {
    kbId,
    forkedFrom: saved.forkedFromItemId,
    version: saved.version,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/items/${saved.itemId}?saved=1`));
}

export async function addEdgeAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const fromItemId = String(formData.get("fromItemId"));
  const edgeType = String(formData.get("edgeType")) as EdgeType;
  const target = String(formData.get("target") ?? "").trim();
  const edge = await kbService().addEdge(kbId, {
    fromItemId,
    edgeType,
    ...(edgeType === "teaches" ? { toConceptId: target } : { toItemId: target }),
    origin: "fellow",
    confirmed: true,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.edge.change", "kb_edge", edge.edgeId, { kbId, edgeType });
  revalidatePath(kbPath(kbId), "layout");
}

export async function removeEdgeAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const edgeId = String(formData.get("edgeId"));
  await kbService().removeEdge(kbId, edgeId);
  await audit(context, "kb.edge.change", "kb_edge", edgeId, { kbId, removed: true });
  revalidatePath(kbPath(kbId), "layout");
}

export async function savePackAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const pack = await kbService().savePack({
    packId: String(formData.get("packId") ?? "").trim() || undefined,
    kbId,
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    levelId: String(formData.get("levelId") ?? "").trim() || undefined,
    ordinal: Number(formData.get("ordinal") ?? 0),
    extendsPackId: String(formData.get("extendsPackId") ?? "").trim() || undefined,
    itemIds: formData.getAll("itemIds").map(String),
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.pack.save", "kb_pack", pack.packId, { kbId });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, "/ladder"));
}

export async function registerSourceAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const source: KbSource = {
    sourceId: `src_${String(formData.get("slug") ?? "").trim() || newId("s").slice(2)}`,
    title: String(formData.get("title") ?? "").trim(),
    sourceType: String(formData.get("sourceType")) as KbSource["sourceType"],
    rightsStatus: String(formData.get("rightsStatus")) as KbSource["rightsStatus"],
    locator: String(formData.get("locator") ?? "").trim() || undefined,
    registeredBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
  };
  await kbStore().putSource(source);
  await audit(context, "knowledge.source.register", "kb_source", source.sourceId, { kbId });
  revalidatePath(kbPath(kbId, "/sources"));
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("No file uploaded");
  if (file.size > 3_500_000)
    throw new Error(
      "That file is over 3.5 MB — the upload path caps at ~4 MB. Split the document or upload a text export.",
    );
  const text = await fileToText(file);
  const { passageCount } = await uploadDocument(sourceId, file.name, file.type || "text/plain", text);
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    passageCount,
  });
  revalidatePath(kbPath(kbId, "/sources"));
}

/** Batch size per click: keeps each run well inside serverless time limits;
 *  completed sections are skipped, so clicking through is resumable. */
const EXTRACTION_BATCH = 3;

export async function runExtractionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  if (!extractionAvailable())
    throw new Error("Extraction needs ANTHROPIC_API_KEY on the server");

  const { pendingSections } = await import("@/lib/documents");
  const { remaining } = await pendingSections(kbId, sourceId);
  if (!remaining.length) redirect(kbPath(kbId, "/sources?extracted=0&remaining=0"));

  const batch = remaining.slice(0, EXTRACTION_BATCH);
  const { runExtraction } = await import("@bridge/kb");
  const jobs = await runExtraction(kbStore(), kbService(), createClaudeExtractor(), {
    kbId,
    sourceId,
    requestedBy: context.nexusUserId,
    sections: batch,
  });
  const itemsCreated = jobs.reduce((n, j) => n + j.createdItemIds.length, 0);
  await audit(context, "kb.extraction.run", "kb_source", sourceId, {
    kbId,
    jobs: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    itemsCreated,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(
    kbPath(
      kbId,
      `/sources?extracted=${itemsCreated}&remaining=${remaining.length - batch.length}`,
    ),
  );
}

export async function createSuggestionAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const kbId = String(formData.get("kbId"));
  const suggestion = await kbService().createSuggestion({
    kbId,
    itemId: String(formData.get("itemId") ?? "").trim() || undefined,
    text: String(formData.get("text") ?? "").trim(),
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.suggestion.change", "kb_suggestion", suggestion.suggestionId, { kbId });
  revalidatePath(kbPath(kbId), "layout");
}

export async function resolveSuggestionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.review");
  const kbId = String(formData.get("kbId"));
  const suggestionId = String(formData.get("suggestionId"));
  await kbService().resolveSuggestion(suggestionId, context.nexusUserId);
  await audit(context, "kb.suggestion.change", "kb_suggestion", suggestionId, {
    kbId,
    resolved: true,
  });
  revalidatePath(kbPath(kbId, "/suggestions"));
}

// ---- players (Stage E) -----------------------------------------------------

export async function suggestPlayersAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("Compile the KB first (save any item)");

  const { newId: mkId, suggestMinimalPlayers, validatePlayerStatic, playerIsValid } =
    await import("@bridge/kb");
  const store = kbStore();
  const existing = await store.listPlayersForKb(kbId);
  const now = new Date().toISOString();

  for (const suggestion of suggestMinimalPlayers(compiled, kbId)) {
    if (existing.some((p) => p.name === suggestion.name)) continue;
    const player = {
      playerId: mkId("pl"),
      kbId,
      name: suggestion.name,
      description: suggestion.rationale,
      enabledPackIds: suggestion.enabledPackIds,
      settingOverrides: {},
      decisionPolicyId: "first_match" as const,
      fallbackPolicyId: "standard" as const,
      validationStatus: "draft" as const,
      ownerType: "system" as const,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const report = validatePlayerStatic(compiled, player);
    await store.putPlayer({
      ...player,
      validationStatus: playerIsValid(report) ? "valid" : "invalid",
      validationReport: report,
    });
    await audit(context, "profile.create", "kb_player", player.playerId, {
      kbId,
      suggested: suggestion.kind,
    });
  }
  revalidatePath(kbPath(kbId, "/players"));
}

export async function savePlayerAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const playerId = String(formData.get("playerId") ?? "").trim();
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("Compile the KB first");

  const { newId: mkId, validatePlayerStatic, playerIsValid, applySandboxConstraints } =
    await import("@bridge/kb");
  const { parseSettingOverrides } = await import("@/lib/playerForm");
  const store = kbStore();
  const existing = playerId ? await store.getPlayer(playerId) : null;
  const now = new Date().toISOString();

  let enabledPackIds = formData.getAll("enabledPackIds").map(String);
  let settingOverrides = parseSettingOverrides(formData, compiled);

  // Sandboxed players can never escape the coach's exposure (server-side).
  const sandboxId = existing?.sandboxId ?? (String(formData.get("sandboxId") ?? "").trim() || undefined);
  if (sandboxId) {
    const sandbox = await store.getSandbox(sandboxId);
    if (sandbox) {
      const constrained = applySandboxConstraints(sandbox, { enabledPackIds, settingOverrides });
      enabledPackIds = constrained.enabledPackIds;
      settingOverrides = constrained.settingOverrides;
    }
  }

  const player = {
    playerId: existing?.playerId ?? mkId("pl"),
    kbId,
    name: String(formData.get("name") ?? "").trim() || existing?.name || "Unnamed player",
    description: existing?.description,
    levelId: String(formData.get("levelId") ?? "").trim() || undefined,
    enabledPackIds,
    settingOverrides,
    decisionPolicyId: (String(formData.get("decisionPolicyId")) || "first_match") as never,
    fallbackPolicyId: "standard" as const,
    validationStatus: "draft" as const,
    ownerType: existing?.ownerType ?? ("coach" as const),
    ownerId: existing?.ownerId ?? context.nexusUserId,
    programOrganizationId: existing?.programOrganizationId ?? context.programOrganizationId,
    sandboxId,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const report = validatePlayerStatic(compiled, player);
  await store.putPlayer({
    ...player,
    validationStatus: playerIsValid(report) ? "valid" : "invalid",
    // Keep the last simulation visible; it re-runs on demand.
    validationReport: { ...report, simulation: existing?.validationReport?.simulation },
  });
  await audit(context, existing ? "profile.update" : "profile.create", "kb_player", player.playerId, { kbId });
  revalidatePath(kbPath(kbId, "/players"), "layout");
  redirect(kbPath(kbId, `/players/${player.playerId}?saved=1`));
}

export async function simulatePlayerAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const playerId = String(formData.get("playerId"));
  const compiled = await kbService().liveCompile(kbId);
  const store = kbStore();
  const player = await store.getPlayer(playerId);
  if (!compiled || !player) throw new Error("Player or compile missing");

  const { simulateSelfPlay } = await import("@bridge/engine");
  const levelOrdinal = compiled.packs.find((p) => p.levelId === player.levelId)?.ordinal;
  const simulation = await simulateSelfPlay({
    compiled,
    player: {
      enabledPackIds: player.enabledPackIds,
      settingOverrides: player.settingOverrides,
      decisionPolicyId: player.decisionPolicyId,
      levelOrdinal,
    },
    deals: 24,
    seed: 20260714,
  });
  await store.putPlayer({
    ...player,
    validationReport: { ...(player.validationReport ?? { static: [], conflicts: [], missingRequires: [] }), simulation },
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "profile.update", "kb_player", playerId, { kbId, simulated: true });
  revalidatePath(kbPath(kbId, `/players/${playerId}`));
}

export async function createSandboxAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const { newId: mkId } = await import("@bridge/kb");
  const now = new Date().toISOString();
  const sandbox = {
    sandboxId: mkId("sb"),
    kbId,
    name: String(formData.get("name") ?? "").trim(),
    basePackIds: formData.getAll("basePackIds").map(String),
    exposedPackIds: formData.getAll("exposedPackIds").map(String),
    baseOverrides: {},
    exposedSettingKeys: formData.getAll("exposedSettingKeys").map(String),
    ownerType: "coach" as const,
    ownerId: context.nexusUserId,
    programOrganizationId: context.programOrganizationId,
    createdAt: now,
    updatedAt: now,
  };
  await kbStore().putSandbox(sandbox);
  await audit(context, "profile.create", "kb_sandbox", sandbox.sandboxId, { kbId });
  revalidatePath(kbPath(kbId, "/players"));
}
