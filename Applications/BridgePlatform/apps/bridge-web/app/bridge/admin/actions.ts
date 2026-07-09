"use server";

import { canAccessAdminArea } from "@bridge/nexus-client";
import {
  PrototypeRegistryExtractor,
  runGeneration,
  runIngestion,
  type BridgeKnowledgeSource,
  type BridgeReadableKnowledgeItem,
} from "@bridge/knowledge";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  // Edits bump the version (revision history keeps the old one); packages
  // already generated are pinned to the version they consumed.
  const edited: BridgeReadableKnowledgeItem = {
    ...existing,
    title: str(formData, "title"),
    humanReadableRule: str(formData, "humanReadableRule"),
    structuredFields,
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
