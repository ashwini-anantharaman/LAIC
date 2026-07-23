"use server";

// Source-fidelity audit action (2026-07-23). One click = one serverless
// invocation: audit the next N items that HAVE provenance and do NOT already
// carry an open [source audit] flag, in stable itemId order, so repeated
// clicks walk the whole KB resumably. Non-faithful findings land in the
// existing Suggestions queue (the same kbService().createSuggestion the
// createSuggestionAction wraps), attached to the itemId, one suggestion per
// problem so each keeps its own content_fix / inexpressible classification.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { LANGUAGE_REFERENCE } from "@/lib/extraction";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import {
  auditCandidates,
  auditItem,
  auditAvailable,
  suggestionTextForProblem,
} from "@/lib/sourceAudit";

const kbPath = (kbId: string, rest = "") => `/bridge/kb/${kbId}${rest}`;

/** N default 8, capped at 15 (one invocation stays well inside limits). */
const DEFAULT_BATCH = 8;
const MAX_BATCH = 15;

export async function runSourceAuditAction(formData: FormData): Promise<void> {
  const context = await requireAdminContext("bridge.knowledge.edit");
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  if (!auditAvailable())
    throw new Error("Source-fidelity audit needs ANTHROPIC_API_KEY on the server");

  const n = Math.min(
    MAX_BATCH,
    Math.max(1, Math.floor(Number(formData.get("n")) || DEFAULT_BATCH)),
  );

  const store = kbStore();
  const [items, suggestions, sources] = await Promise.all([
    store.listItemsForKb(kbId),
    store.listSuggestionsForKb(kbId),
    store.listSources(),
  ]);
  const sourceTitleById = new Map(sources.map((s) => [s.sourceId, s.title]));

  // Load passages only for the sources these items actually cite.
  const citedSourceIds = new Set<string>();
  for (const item of items)
    for (const ref of item.sourceReferences)
      if (ref.sourceId !== "src_claude") citedSourceIds.add(ref.sourceId);
  const passagesBySource = new Map(
    await Promise.all(
      [...citedSourceIds].map(
        async (id) => [id, await store.listPassages(id)] as const,
      ),
    ),
  );

  const candidates = auditCandidates({
    items,
    suggestions,
    passagesBySource,
    sourceTitleById,
  }).slice(0, n);

  let audited = 0;
  let flagged = 0;
  for (const { item, passages } of candidates) {
    const result = await auditItem({
      item,
      passages,
      languageReference: LANGUAGE_REFERENCE,
    });
    audited++;
    if (result.verdict === "faithful" || result.verdict === "no_provenance") continue;
    if (result.problems.length === 0) continue;
    flagged++;
    for (const problem of result.problems) {
      const suggestion = await kbService().createSuggestion({
        kbId,
        itemId: item.itemId,
        text: suggestionTextForProblem(problem),
        createdBy: context.nexusUserId,
      });
      await audit(context, "kb.suggestion.change", "kb_suggestion", suggestion.suggestionId, {
        kbId,
        itemId: item.itemId,
        sourceAudit: problem.classification,
      });
    }
  }

  await audit(context, "kb.extraction.run", "kb", kbId, {
    sourceAudit: true,
    audited,
    flagged,
  });
  revalidatePath(kbPath(kbId), "layout");
  redirect(kbPath(kbId, `/source-audit?audited=${audited}&flagged=${flagged}`));
}
