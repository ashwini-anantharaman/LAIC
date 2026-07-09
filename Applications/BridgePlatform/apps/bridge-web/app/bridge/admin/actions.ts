"use server";

import { canAccessAdminArea } from "@bridge/nexus-client";
import {
  publishPackage,
  runGeneration,
  type BridgeKnowledgeSource,
  type BridgeReadableKnowledgeItem,
} from "@bridge/knowledge";
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

  // Any edit sends the item back to review (correction loop §12.10 step 10).
  const edited: BridgeReadableKnowledgeItem = {
    ...existing,
    title: str(formData, "title"),
    humanReadableRule: str(formData, "humanReadableRule"),
    structuredFields,
    reviewerNotes: (formData.get("reviewerNotes") as string) || existing.reviewerNotes,
    status: "needs_review",
    version: String(Number(existing.version) + 1),
    approvedBy: undefined,
    approvedAt: undefined,
    createdBy: existing.createdBy,
  };
  void context;
  await store.saveItem(edited);
  revalidatePath(`/bridge/admin/knowledge`);
  redirect(`/bridge/admin/knowledge/${itemId}`);
}

export async function setItemStatus(formData: FormData) {
  const context = await requireReviewer();
  const store = knowledgeStore();
  const itemId = str(formData, "itemId");
  const status = str(formData, "status") as BridgeReadableKnowledgeItem["status"];
  const existing = await store.getItem(itemId);
  if (!existing) throw new Error(`No item ${itemId}`);
  await store.saveItem({
    ...existing,
    status,
    approvedBy: status === "approved" ? context.nexusUserId : undefined,
    approvedAt: status === "approved" ? new Date().toISOString() : undefined,
  });
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

export async function publishGeneratedPackage(formData: FormData) {
  const context = await requireReviewer();
  await publishPackage(
    knowledgeStore(),
    str(formData, "packageId"),
    str(formData, "version"),
    context.nexusUserId,
    new Date().toISOString(),
  );
  revalidatePath("/bridge/admin/runs");
  redirect(`/bridge/admin/runs`);
}
