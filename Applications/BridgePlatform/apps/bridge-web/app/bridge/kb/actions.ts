"use server";

// KB workspace server actions (Knowledge Rework §6). Every mutation is
// audited; every content save recompiles via the service (last-good). The
// fellow permission gate is bridge.knowledge.edit; suggestions only need
// review access.

import { chunkDocument, newId, type EdgeType, type KbSource } from "@bridge/kb";
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
  const text = await fileToText(file);
  const { passageCount } = await uploadDocument(sourceId, file.name, file.type || "text/plain", text);
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    passageCount,
  });
  revalidatePath(kbPath(kbId, "/sources"));
}

export async function runExtractionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  if (!extractionAvailable())
    throw new Error("Extraction needs ANTHROPIC_API_KEY on the server");

  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  if (!doc) throw new Error("Upload a document first");
  const passages = await store.listPassages(sourceId);
  const { sections } = chunkDocument(doc.text);
  const byOrdinal = new Map(passages.map((p) => [p.ordinal, p]));

  const { runExtraction } = await import("@bridge/kb");
  const jobs = await runExtraction(store, kbService(), createClaudeExtractor(), {
    kbId,
    sourceId,
    requestedBy: context.nexusUserId,
    sections: sections.map((s) => ({
      anchor: s.anchor,
      passages: s.passageOrdinals.map((o) => byOrdinal.get(o)!).filter(Boolean),
    })),
  });
  await audit(context, "kb.extraction.run", "kb_source", sourceId, {
    kbId,
    jobs: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    itemsCreated: jobs.reduce((n, j) => n + j.createdItemIds.length, 0),
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, "/sources?extracted=1"));
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
