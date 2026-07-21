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

/**
 * Install the curated SAYC template (2026-07-21): a fresh KB populated from
 * @bridge/sayc-template — batch store puts + ONE recompile (the extraction
 * batching pattern), then a Base release so the starting point is pinned.
 * Items land as drafts, cited to src_claude; fellows review and approve.
 */
export async function installSaycTemplateAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const { installSaycTemplate } = await import("@bridge/sayc-template/install");
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const result = await installSaycTemplate(kbStore(), kbService(), {
    createdBy: context.nexusUserId,
    kbName: name,
  });
  if (result.compileError) {
    // Should be impossible — the template ships with a compile-clean test.
    redirect(`/bridge/kb?error=${encodeURIComponent(result.compileError)}`);
  }
  await kbService().publishKbVersion(result.kbId, {
    label: "Base — curated SAYC",
    notes: "Installed from the machine-tested template. Items are drafts until experts review them.",
    publishedBy: context.nexusUserId,
  });
  await audit(context, "kb.create", "kb", result.kbId, {
    template: "sayc",
    items: result.itemIdByKey.size,
  });
  revalidatePath("/bridge/kb", "layout");
  redirect(kbPath(result.kbId));
}

/**
 * Start a source augmentation (2026-07-21): derive a full DRAFT COPY of the
 * KB, stamp it with the augmentation ledger, and open the review board. The
 * base KB is never touched — the draft is kept or discarded at the end.
 */
export async function startAugmentationAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const base = await kbService().getKb(kbId);
  const source = await kbStore().getSource(sourceId);
  if (!source) redirect(kbPath(kbId, "/sources?uploadError=Source%20not%20found"));

  const draft = await kbService().deriveKb(kbId, {
    mode: "copied",
    name: `${base.name} + ${source!.title}`.slice(0, 80) + " (draft)",
    createdBy: context.nexusUserId,
    includePacks: true,
  });
  await kbStore().putKb({
    ...(await kbService().getKb(draft.kbId)),
    description: `Augmentation draft: merging “${source!.title}” into ${base.name}. Review, then keep or discard.`,
    augmentation: {
      baseKbId: kbId,
      baseKbName: base.name,
      sourceId,
      status: "review",
      newItemIds: [],
      modified: [],
      startedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "kb.derive", "kb", draft.kbId, {
    baseKbId: kbId,
    augmentation: true,
    sourceId,
  });
  revalidatePath("/bridge/kb", "layout");
  redirect(kbPath(draft.kbId, "/augment?start=auto"));
}

/** Close the review: the draft becomes an ordinary KB (ledger kept). */
export async function finishAugmentationAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const kb = await kbService().getKb(kbId);
  if (!kb.augmentation) redirect(kbPath(kbId));
  await kbStore().putKb({
    ...kb,
    augmentation: { ...kb.augmentation!, status: "kept", finishedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "kb.derive", "kb", kbId, { augmentation: "kept" });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, "?augmentKept=1"));
}

/** Throw the draft away entirely — the base KB was never touched. */
export async function discardAugmentationAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const kb = await kbService().getKb(kbId);
  // Only augmentation drafts are discardable this way — everything else
  // goes through the typed-name deletion on the danger zone.
  if (!kb.augmentation) redirect(kbPath(kbId));
  const baseKbId = kb.augmentation!.baseKbId;
  await kbService().deleteKb(kbId);
  const { sessionService } = await import("@/lib/sessions");
  await sessionService().deleteForKb(kbId);
  await audit(context, "kb.delete", "kb", kbId, { augmentationDraft: true, baseKbId });
  revalidatePath("/bridge/kb", "layout");
  redirect(kbPath(baseKbId, "?augmentDiscarded=1"));
}

/** Hide/unhide a KB everywhere. Nothing is deleted — fully reversible. */
export async function setKbArchivedAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const archived = String(formData.get("archived")) === "true";
  await kbService().setKbArchived(kbId, archived);
  await audit(context, "kb.archive", "kb", kbId, { archived });
  revalidatePath("/bridge", "layout");
  redirect(`/bridge/kb?${archived ? "hidden" : "unhidden"}=1`);
}

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

/**
 * Delete a knowledge base and everything scoped to it — memberships, items
 * that belong only to this KB (with their edges), packs, players, sandboxes,
 * suggestions, jobs, compiles, and the KB's play sessions. Irreversible.
 * The typed-name confirmation is checked server-side.
 */
export async function deleteKbAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const kb = await kbService().getKb(kbId);
  // Two confirmed entry points share this action: the Overview danger zone
  // (the fellow types the KB's name) and the list-row button (client-side
  // confirm + hidden name). The name check is the server-side bar for both.
  const confirm = String(formData.get("confirmName") ?? "").trim();
  const from = String(formData.get("from") ?? "list");
  if (confirm !== kb.name) {
    redirect(kbPath(kbId, `?deleteError=${encodeURIComponent("Type the knowledge base's exact name to confirm deletion.")}`));
  }
  try {
    await kbService().deleteKb(kbId); // refuses while derived KBs exist
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete this knowledge base.";
    redirect(
      from === "overview"
        ? kbPath(kbId, `?deleteError=${encodeURIComponent(message)}`)
        : `/bridge/kb?deleteError=${encodeURIComponent(message)}`,
    );
  }
  const { sessionService } = await import("@/lib/sessions");
  await sessionService().deleteForKb(kbId);
  await audit(context, "kb.delete", "kb", kbId, { name: kb.name });
  revalidatePath("/bridge/kb");
  redirect("/bridge/kb?deleted=1");
}

export async function createItemAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const common = parseCommon(formData);
  // The write-up-from-a-passage flow carries a real citation; hand-authored
  // items without one cite the Claude source until a fellow attaches passages.
  const citeSourceId = String(formData.get("cite:sourceId") ?? "").trim();
  const citePassageId = String(formData.get("cite:passageId") ?? "").trim();
  const sourceReferences = citeSourceId
    ? [
        {
          sourceId: citeSourceId,
          ...(citePassageId && { passageId: citePassageId }),
          anchor: String(formData.get("cite:anchor") ?? "").trim() || common.title,
        },
      ]
    : [{ sourceId: "src_claude", anchor: "fellow-authored in the workspace" }];
  const item = await kbService().createItem(kbId, {
    ...common,
    payload: parsePayload(formData, common.knowledgeType),
    settings: parseSettings(formData),
    sourceReferences,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.item.create", "kb_item", item.itemId, {
    kbId,
    citedSource: citeSourceId || undefined,
  });
  redirect(kbPath(kbId, `/items/${item.itemId}`));
}

export async function deleteItemsAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemIds = formData.getAll("itemIds").map(String).filter(Boolean);
  const returnToRaw = String(formData.get("returnTo") ?? "");
  const returnTo = returnToRaw.startsWith(`/bridge/kb/${kbId}`)
    ? returnToRaw
    : kbPath(kbId, "/items");
  if (!itemIds.length) redirect(returnTo);

  const result = await kbService().deleteItems(kbId, itemIds, context.nexusUserId);
  await audit(context, "kb.item.delete", "kb", kbId, {
    deleted: result.deleted.length,
    blocked: result.blocked.length,
    itemIds: result.deleted.map((d) => d.itemId),
  });

  const params = new URLSearchParams();
  params.set("bulkDeleted", String(result.deleted.length));
  if (result.setsTouched.length) params.set("bulkSets", result.setsTouched.join(", "));
  if (result.blocked.length) {
    const shown = result.blocked.slice(0, 3);
    const note = shown.map((b) => `"${b.title}" (${b.reason})`).join(" · ");
    const more = result.blocked.length - shown.length;
    params.set("bulkBlocked", more > 0 ? `${note} · and ${more} more` : note);
  }
  revalidatePath(kbPath(kbId), "layout");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${params.toString()}`);
}

export async function saveItemAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemId = String(formData.get("itemId"));
  const common = parseCommon(formData);
  const content = {
    ...common,
    payload: parsePayload(formData, common.knowledgeType),
    settings: parseSettings(formData),
  };

  // "Save as a new knowledge item" branches: a fresh item with lineage — the
  // original (a template) is never touched.
  if (String(formData.get("saveAs") ?? "") === "new") {
    const source = await kbStore().getItem(itemId);
    let title = content.title;
    if (source && title === source.title) {
      const titles = new Set((await kbStore().listItemsForKb(kbId)).map((i) => i.title));
      let candidate = `${title} (copy)`;
      for (let n = 2; titles.has(candidate); n++) candidate = `${title} (copy ${n})`;
      title = candidate;
    }
    const created = await kbService().createItem(kbId, {
      ...content,
      title,
      status: "draft",
      forkedFromItemId: itemId,
      sourceReferences: source?.sourceReferences.length
        ? source.sourceReferences
        : [{ sourceId: "src_claude", anchor: "forked in the workspace" }],
      createdBy: context.nexusUserId,
    });
    await audit(context, "kb.item.create", "kb_item", created.itemId, {
      kbId,
      forkedFrom: itemId,
      savedAsNew: true,
    });
    revalidatePath(kbPath(kbId), "layout");
    redirect(kbPath(kbId, `/items/${created.itemId}?saved=1`));
  }

  const saved = await kbService().saveItem(kbId, itemId, content, context.nexusUserId);
  await audit(context, "kb.item.edit", "kb_item", saved.itemId, {
    kbId,
    forkedFrom: saved.forkedFromItemId,
    version: saved.version,
  });
  revalidatePath(kbPath(kbId), "layout");

  // Fix-at-the-table flow: saving from the session overlay re-pins the
  // session to the fresh compile (sessions never float on their own) and
  // returns to the board instead of the item page.
  const repinSessionId = String(formData.get("repinSessionId") ?? "");
  const returnToRaw = String(formData.get("returnTo") ?? "");
  if (returnToRaw.startsWith("/bridge/")) {
    let flag = "fixed=1";
    if (repinSessionId) {
      const kb = await kbService().getKb(kbId);
      if (kb.lastCompileError) {
        flag = `fixError=${encodeURIComponent(kb.lastCompileError.message)}`;
      } else {
        const { sessionService } = await import("@/lib/sessions");
        const compiled = await kbService().liveCompile(kbId);
        if (compiled) await sessionService().repinCompile(repinSessionId, compiled);
      }
      revalidatePath(`/bridge/table/${repinSessionId}`);
    }
    redirect(`${returnToRaw}${returnToRaw.includes("?") ? "&" : "?"}${flag}`);
  }

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
  const packId = String(formData.get("packId") ?? "").trim() || undefined;
  let pack;
  try {
    pack = await kbService().savePack({
      packId,
      kbId,
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || undefined,
      extendsPackId: String(formData.get("extendsPackId") ?? "").trim() || undefined,
      intendedComplete: formData.get("intendedComplete") === "on" || undefined,
      itemIds: formData.getAll("itemIds").map(String),
      createdBy: context.nexusUserId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save this set.";
    redirect(
      kbPath(
        kbId,
        packId
          ? `/sets/${packId}?error=${encodeURIComponent(message)}`
          : `/sets/new?error=${encodeURIComponent(message)}`,
      ),
    );
  }
  const version = (await kbService().listPackVersions(pack.packId))[0]?.versionNumber;
  await audit(context, "kb.pack.save", "kb_pack", pack.packId, { kbId, version });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/sets/${pack.packId}?saved=1`));
}

export async function restorePackVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const packId = String(formData.get("packId"));
  const versionNumber = Number(formData.get("versionNumber"));
  let result;
  try {
    result = await kbService().restorePackVersion(kbId, packId, versionNumber, context.nexusUserId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not restore this version.";
    redirect(kbPath(kbId, `/sets/${packId}?error=${encodeURIComponent(message)}`));
  }
  await audit(context, "kb.pack.version.restore", "kb_pack", packId, {
    kbId,
    versionNumber,
    droppedItemIds: result.droppedItemIds.length,
    droppedInclude: result.droppedInclude,
  });
  revalidatePath(kbPath(kbId), "layout");
  const dropped = result.droppedItemIds.length + (result.droppedInclude ? 1 : 0);
  redirect(kbPath(kbId, `/sets/${packId}?restored=${versionNumber}&dropped=${dropped}`));
}

export async function deletePackAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const packId = String(formData.get("packId"));
  try {
    await kbService().deletePack(kbId, packId); // refuses while referenced
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete this set.";
    redirect(kbPath(kbId, `/sets/${packId}?error=${encodeURIComponent(message)}`));
  }
  await audit(context, "kb.pack.delete", "kb_pack", packId, { kbId });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, "/sets?deleted=1"));
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
    kbId,
    registeredBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
  };
  await kbStore().putSource(source);
  await audit(context, "knowledge.source.register", "kb_source", source.sourceId, { kbId });
  revalidatePath(kbPath(kbId, "/sources"));
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  try {
    await kbService().deleteSource(sourceId); // refuses while items cite it
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete this source.";
    redirect(kbPath(kbId, `/sources?uploadError=${encodeURIComponent(message)}`));
  }
  await audit(context, "knowledge.source.delete", "kb_source", sourceId, { kbId });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, "/sources?sourceDeleted=1"));
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const fail = (message: string): never =>
    redirect(kbPath(kbId, `/sources?uploadError=${encodeURIComponent(message)}`));

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size)
    fail("No file was attached — choose the document first, then upload.");
  const doc = file as File;
  if (doc.size > 3_500_000)
    fail("That file is over 3.5 MB — the upload path caps at ~4 MB. Split the document or upload a text export.");

  let text: string;
  try {
    text = await fileToText(doc);
  } catch {
    return fail("Couldn't read that file as text — is it a valid PDF/markdown/text document?");
  }
  if (!text.trim()) return fail("The document came out empty after text extraction.");

  const { passageCount, sectionCount } = await uploadDocument(
    sourceId,
    doc.name,
    doc.type || "text/plain",
    text,
  );
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    passageCount,
  });
  revalidatePath(kbPath(kbId, "/sources"));
  redirect(
    kbPath(kbId, `/sources?uploaded=${passageCount}&sections=${sectionCount}`),
  );
}

/**
 * Upload a document whose text was already extracted in the browser (the
 * whole-PDF flow: pdf.js runs client-side, so a 48 MB PDF never hits the
 * ~4.5 MB serverless body limit — only its ~sub-MB text does). Same
 * downstream path as uploadDocumentAction; redirects with extract=auto so
 * the Sources tab starts draining sections on its own.
 */
export type UploadTextResult =
  | { ok: true; passageCount: number; sectionCount: number }
  | { ok: false; error: string };

/**
 * Called PROGRAMMATICALLY from the upload form (not as a form action), so it
 * must RETURN a result instead of redirect(): a redirect() here surfaces as a
 * caught "NEXT_REDIRECT" error in the client's try/catch. The client
 * navigates on success.
 */
export async function uploadExtractedTextAction(
  formData: FormData,
): Promise<UploadTextResult> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const sourceId = String(formData.get("sourceId"));
  const fileName = String(formData.get("fileName") ?? "").trim() || "document.txt";
  const mediaType = String(formData.get("mediaType") ?? "text/plain");
  const text = String(formData.get("text") ?? "");

  if (!text.trim())
    return {
      ok: false,
      error: "No text came out of that file — a scanned/image-only PDF has no text layer to read.",
    };
  if (text.length > 8_000_000)
    return {
      ok: false,
      error: "That document's text is over ~8 MB — split it into chapters and upload those.",
    };

  const { uploadDocument } = await import("@/lib/documents");
  let result: { passageCount: number; sectionCount: number };
  try {
    result = await uploadDocument(sourceId, fileName, mediaType, text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown storage error";
    return { ok: false, error: `The document could not be stored: ${detail}` };
  }
  const { passageCount, sectionCount } = result;
  await audit(context, "knowledge.source.upload", "kb_source", sourceId, {
    kbId,
    passageCount,
    clientExtracted: true,
  });
  revalidatePath(kbPath(kbId, "/sources"));
  return { ok: true, passageCount, sectionCount };
}

/** Batch size per click/tick: keeps each run well inside serverless time
 *  limits; completed sections are skipped, so extraction is resumable. */
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
  // Suggested players are system-owned, so land on Everyone to reveal them.
  revalidatePath("/bridge/players");
  redirect(`/bridge/players?kb=${kbId}&by=all`);
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
  // "Save as a new player" copies instead of mutating: the source player is
  // read for carried-over fields but never written.
  const saveAsNew = String(formData.get("saveAs") ?? "") === "new";
  const source = playerId ? await store.getPlayer(playerId) : null;
  const existing = saveAsNew ? null : source;
  const now = new Date().toISOString();

  let enabledPackIds = formData.getAll("enabledPackIds").map(String);
  // Only settings the submitted packs expose were rendered — parse those, and
  // carry prior tuning forward for the rest (inert while un-carried, back at
  // the fellow's values if the pack returns).
  const carried = new Set(
    compiled.packs
      .filter((p) => enabledPackIds.includes(p.packId))
      .flatMap((p) => p.itemIds),
  );
  let settingOverrides = parseSettingOverrides(formData, compiled, carried);
  for (const [key, value] of Object.entries(source?.settingOverrides ?? {})) {
    const spec = compiled.settings.find((s) => s.key === key);
    if (spec && !carried.has(spec.itemId) && !(key in settingOverrides)) {
      settingOverrides[key] = value;
    }
  }

  // Sandboxed players can never escape the coach's exposure (server-side) —
  // a copy stays inside its source's sandbox.
  const sandboxId = source?.sandboxId ?? (String(formData.get("sandboxId") ?? "").trim() || undefined);
  if (sandboxId) {
    const sandbox = await store.getSandbox(sandboxId);
    if (sandbox) {
      const constrained = applySandboxConstraints(sandbox, { enabledPackIds, settingOverrides });
      enabledPackIds = constrained.enabledPackIds;
      settingOverrides = constrained.settingOverrides;
    }
  }

  // A copy saved under an unchanged name gets a "(copy)" suffix so the two
  // stay distinguishable in rosters and seat menus.
  let name = String(formData.get("name") ?? "").trim() || source?.name || "Unnamed player";
  if (saveAsNew && source && name === source.name) {
    const names = new Set((await store.listPlayersForKb(kbId)).map((p) => p.name));
    let candidate = `${name} (copy)`;
    for (let n = 2; names.has(candidate); n++) candidate = `${name} (copy ${n})`;
    name = candidate;
  }

  const player = {
    playerId: existing?.playerId ?? mkId("pl"),
    kbId,
    name,
    description: source?.description,
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

// ---- versioning (Stage H) --------------------------------------------------

export async function publishKbVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const { version, created } = await kbService().publishKbVersion(kbId, {
    label: String(formData.get("label") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    publishedBy: context.nexusUserId,
  });
  if (created) {
    await audit(context, "kb.version.publish", "kb_version", version.versionId, {
      kbId,
      versionNumber: version.versionNumber,
      items: version.items.length,
    });
    revalidatePath(kbPath(kbId), "layout");
    redirect(kbPath(kbId, `/versions?published=${version.versionNumber}`));
  }
  // Nothing changed since the last release — no duplicate minted.
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/versions?unchanged=${version.versionNumber}`));
}

export async function deleteKbVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const versionId = String(formData.get("versionId"));
  try {
    await kbService().deleteKbVersion(kbId, versionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete this version.";
    redirect(kbPath(kbId, `/versions?versionError=${encodeURIComponent(message)}`));
  }
  await audit(context, "kb.version.delete", "kb_version", versionId, { kbId });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/versions?versionDeleted=1`));
}

export async function deleteItemVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemId = String(formData.get("itemId"));
  const versionNumber = Number(formData.get("versionNumber"));
  try {
    await kbService().deleteItemVersion(kbId, itemId, versionNumber);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not delete this version.";
    redirect(kbPath(kbId, `/items/${itemId}?versionError=${encodeURIComponent(message)}`));
  }
  await audit(context, "kb.item.version.delete", "kb_item", itemId, { kbId, versionNumber });
  revalidatePath(kbPath(kbId, `/items/${itemId}`));
  redirect(kbPath(kbId, `/items/${itemId}?versionDeleted=${versionNumber}`));
}

export async function setActiveVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const versionId = String(formData.get("versionId"));
  await kbService().setActiveVersion(kbId, versionId);
  await audit(context, "kb.version.publish", "kb_version", versionId, {
    kbId,
    activated: true,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/versions?activated=1`));
}

export async function commitItemVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemId = String(formData.get("itemId"));
  const version = await kbService().commitItemVersion(
    itemId,
    context.nexusUserId,
    String(formData.get("changeNote") ?? "").trim() || undefined,
  );
  await audit(context, "kb.item.version.commit", "kb_item", itemId, {
    kbId,
    versionNumber: version.versionNumber,
  });
  revalidatePath(kbPath(kbId, `/items/${itemId}`));
  redirect(kbPath(kbId, `/items/${itemId}?committed=${version.versionNumber}`));
}

export async function setItemMainVersionAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  const kbId = String(formData.get("kbId"));
  const itemId = String(formData.get("itemId"));
  const versionNumber = Number(formData.get("versionNumber"));
  const updated = await kbService().setItemMainVersion(
    kbId,
    itemId,
    versionNumber,
    context.nexusUserId,
  );
  await audit(context, "kb.item.version.restore", "kb_item", updated.itemId, {
    kbId,
    from: itemId,
    versionNumber,
    forked: updated.itemId !== itemId,
  });
  revalidatePath(kbPath(kbId), "layout");
  // A shared item forks — land on whichever item now lives here.
  redirect(kbPath(kbId, `/items/${updated.itemId}?madeMain=${versionNumber}`));
}

// ---- derivation (master → limited; duplicate & build on top) ----------------

export async function deriveKbAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const masterKbId = String(formData.get("masterKbId"));
  const includeItemIds = formData.getAll("includeItemIds").map(String);
  const child = await kbService().deriveKb(masterKbId, {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    createdBy: context.nexusUserId,
    mode: (String(formData.get("mode")) as "linked" | "copied") || "linked",
    includeItemIds: includeItemIds.length ? includeItemIds : undefined,
    includePacks: formData.get("includePacks") === "on",
  });
  await audit(context, "kb.derive", "kb", child.kbId, {
    masterKbId,
    mode: String(formData.get("mode")),
    items: includeItemIds.length || "all",
  });
  redirect(kbPath(child.kbId));
}

export async function duplicateKbAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const copy = await kbService().duplicateKb(kbId, {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.derive", "kb", copy.kbId, { masterKbId: kbId, mode: "duplicate" });
  redirect(kbPath(copy.kbId));
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
