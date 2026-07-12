"use server";

import { canAccessAdminArea } from "@bridge/nexus-client";
import {
  chunkSourceText,
  PrototypeRegistryExtractor,
  runGeneration,
  runIngestion,
  runLlmIngestion,
  type BridgeKnowledgeSource,
  type BridgeReadableKnowledgeItem,
} from "@bridge/knowledge";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractionClient } from "@/lib/extraction";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";

async function requireReviewer() {
  const context = await getBridgeContext();
  if (!context || !canAccessAdminArea(context)) throw new Error("Not authorized");
  return context;
}

const str = (f: FormData, key: string): string => {
  const v = f.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing field: ${key}`);
  return v.trim();
};

export async function registerSource(formData: FormData) {
  const context = await requireReviewer();
  const source: BridgeKnowledgeSource = {
    sourceId: `src_${str(formData, "slug")}`,
    title: str(formData, "title"),
    sourceType: str(formData, "sourceType") as BridgeKnowledgeSource["sourceType"],
    rightsStatus: str(formData, "rightsStatus") as BridgeKnowledgeSource["rightsStatus"],
    systemFamily: (formData.get("systemFamily") as never) || undefined,
    locator: (formData.get("locator") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
    uploadedBy: context.nexusUserId,
    uploadedAt: new Date().toISOString(),
    status: "registered",
  };
  await knowledgeStore().saveSource(source);
  revalidatePath("/bridge/admin/sources");
}

export async function saveItemEdit(formData: FormData) {
  const context = await requireReviewer();
  const store = knowledgeStore();
  const itemId = str(formData, "itemId");
  const existing = await store.getItem(itemId);
  if (!existing) throw new Error(`No item ${itemId}`);

  let structuredFields: Record<string, unknown>;
  try {
    structuredFields = JSON.parse(str(formData, "structuredFields"));
  } catch {
    throw new Error("structuredFields must be valid JSON");
  }

  const idList = (name: string): string[] | undefined => {
    const raw = formData.get(name);
    if (raw === null) return undefined; // field absent: leave unchanged
    return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  };

  // Edits bump the version (revision history keeps the old one); packages
  // already generated are pinned to the version they consumed.
  const edited: BridgeReadableKnowledgeItem = {
    ...existing,
    title: str(formData, "title"),
    humanReadableRule: str(formData, "humanReadableRule"),
    structuredFields,
    relatedSkillIds: idList("relatedSkillIds") ?? existing.relatedSkillIds,
    relatedConceptIds: idList("relatedConceptIds") ?? existing.relatedConceptIds,
    reviewerNotes: (formData.get("reviewerNotes") as string) || existing.reviewerNotes,
    version: String(Number(existing.version) + 1),
    createdBy: existing.createdBy,
  };
  void context;
  await store.saveItem(edited);
  revalidatePath(`/bridge/admin/knowledge`);
  redirect(`/bridge/admin/knowledge/${itemId}`);
}

export async function setItemStatus(formData: FormData) {
  await requireReviewer();
  const store = knowledgeStore();
  const itemId = str(formData, "itemId");
  const status = str(formData, "status") as BridgeReadableKnowledgeItem["status"];
  const existing = await store.getItem(itemId);
  if (!existing) throw new Error(`No item ${itemId}`);
  await store.saveItem({ ...existing, status });
  revalidatePath(`/bridge/admin/knowledge`);
  redirect(`/bridge/admin/knowledge/${itemId}`);
}

export async function resolveGap(formData: FormData) {
  const context = await requireReviewer();
  const store = knowledgeStore();
  const gap = await store.getGap(str(formData, "gapId"));
  if (!gap) throw new Error("No such gap");
  await store.saveGap({
    ...gap,
    resolutionStatus: str(formData, "resolutionStatus") as never,
    expertResolution: (formData.get("expertResolution") as string) || gap.expertResolution,
    resolvedBy: context.nexusUserId,
    resolvedAt: new Date().toISOString(),
  });
  revalidatePath("/bridge/admin/gaps");
}

export async function triggerGeneration(formData: FormData) {
  const context = await requireReviewer();
  const run = await runGeneration(knowledgeStore(), {
    systemFamily: str(formData, "systemFamily") as never,
    requestedBy: context.nexusUserId,
    bump: (formData.get("bump") as never) || "minor",
    now: new Date().toISOString(),
    runId: `run_${crypto.randomUUID().slice(0, 8)}`,
  });
  revalidatePath("/bridge/admin/runs");
  redirect(`/bridge/admin/runs/${run.runId}`);
}

/**
 * Upload a book/document for a registered source: extract text (txt/md
 * directly, PDF via unpdf), chunk into deterministic passages, store both.
 */
export async function uploadSourceDocument(formData: FormData) {
  await requireReviewer();
  const store = knowledgeStore();
  const sourceId = str(formData, "sourceId");
  const source = await store.getSource(sourceId);
  if (!source) throw new Error(`No source ${sourceId} — register it first`);

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("No file uploaded");

  let text: string;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    text = extracted.text;
  } else {
    text = await file.text();
  }
  text = text.trim();
  if (!text) throw new Error("No text could be extracted from the file");

  const passages = chunkSourceText(sourceId, text);
  await store.saveSourceDocument(
    {
      sourceId,
      fileName: file.name,
      mediaType: file.type || "text/plain",
      charCount: text.length,
      uploadedAt: new Date().toISOString(),
      text,
    },
    passages,
  );
  await store.saveSource({ ...source, locator: source.locator ?? file.name });
  revalidatePath("/bridge/admin/sources");
  redirect(`/bridge/admin/sources/${sourceId}`);
}

/** LLM extraction over a source's uploaded passages (needs ANTHROPIC_API_KEY). */
export async function runLlmExtraction(formData: FormData) {
  const context = await requireReviewer();
  const client = extractionClient();
  if (!client)
    throw new Error("Set ANTHROPIC_API_KEY in apps/bridge-web/.env.local to enable LLM extraction");
  const sourceId = str(formData, "sourceId");
  const goals = formData.getAll("extractionGoals").map(String);
  const outputs = formData.getAll("targetOutputs").map(String);
  await runLlmIngestion(knowledgeStore(), client, {
    sourceId,
    systemFamily: str(formData, "systemFamily") as never,
    requestedBy: context.nexusUserId,
    now: new Date().toISOString(),
    jobId: `job_${crypto.randomUUID().slice(0, 8)}`,
    // §12.5: the declared intent rides on the job for review context.
    intent: goals.length || outputs.length
      ? {
          intentId: `intent_${crypto.randomUUID().slice(0, 8)}`,
          sourceId,
          systemFamily: str(formData, "systemFamily") as never,
          targetOutputs: outputs as never,
          extractionGoals: goals as never,
          humanReviewRequired: true,
        }
      : undefined,
  });
  revalidatePath("/bridge/admin/sources");
  revalidatePath("/bridge/admin/knowledge");
  redirect("/bridge/admin/knowledge");
}

/**
 * Deterministic extraction of the bridgebot prototype's setting registry
 * (Phase 9 reconciliation: items land active but uncited until matched).
 */
export async function extractPrototypeRegistry() {
  const context = await requireReviewer();
  const registryPath = join(
    process.cwd(),
    "../../../../bridgebot/src/vendor/config/data/registry.ts",
  );
  let text: string;
  try {
    text = readFileSync(registryPath, "utf8");
  } catch {
    throw new Error(`Prototype registry not found at ${registryPath} — clone bridgebot alongside the repo`);
  }
  await runIngestion(knowledgeStore(), new PrototypeRegistryExtractor(), {
    sourceId: "src_prototype_artifacts",
    sourceText: text,
    systemFamily: "SAYC",
    requestedBy: context.nexusUserId,
    now: new Date().toISOString(),
    jobId: `job_${crypto.randomUUID().slice(0, 8)}`,
  });
  revalidatePath("/bridge/admin/sources");
  revalidatePath("/bridge/admin/knowledge");
}
