// Source augmentation (2026-07-21): merge a source into a DRAFT COPY of a
// knowledge base. Unlike plain extraction (strictly additive), the augmentor
// may also MODIFY existing items — matched by title, applied as committed
// item versions so every "before" stays one click away. The compiler remains
// the schema gate: a modification that won't compile never lands; it falls
// into the failure report instead. The base KB is never touched — callers
// run this against the derived draft only.

import { compileKb } from "./compile";
import { newId } from "./ids";
import type { SettingSpec } from "./language";
import type { ItemPayload, KbExtractionJob, KnowledgeItem } from "./model";
import {
  materializeExtraction,
  type ExtractionSection,
  type ExtractorOutput,
} from "./extraction";
import type { KbService } from "./service";
import type { KbStore } from "./store";

// ---------------------------------------------------------------------------
// Augmentor contract: extraction output + proposed modifications
// ---------------------------------------------------------------------------

export interface ExtractedModification {
  /** Title of the EXISTING item to modify (matched case-insensitively). */
  targetTitle: string;
  /** One sentence: why the source changes this item (shown on the board). */
  reason: string;
  /** Full replacements — a modification carries the COMPLETE new value. */
  humanReadableText?: string;
  payload?: ItemPayload;
  settings?: SettingSpec[];
  citedPassageOrdinals: number[];
}

export interface AugmentOutput extends ExtractorOutput {
  modifications?: ExtractedModification[];
}

export type SectionAugmentor = (section: ExtractionSection) => Promise<AugmentOutput>;

export interface RunAugmentationOptions {
  /** The DRAFT KB (must carry kb.augmentation). */
  kbId: string;
  sourceId: string;
  requestedBy: string;
  sections: ExtractionSection[];
  now?: () => string;
}

// ---------------------------------------------------------------------------

export async function runAugmentation(
  store: KbStore,
  service: KbService,
  augmentor: SectionAugmentor,
  options: RunAugmentationOptions,
): Promise<KbExtractionJob[]> {
  const now = options.now ?? (() => new Date().toISOString());
  const jobs: KbExtractionJob[] = [];

  for (const section of options.sections) {
    const job: KbExtractionJob = {
      jobId: newId("xj"),
      kbId: options.kbId,
      sourceId: options.sourceId,
      status: "running",
      passageOrdinals: section.passages.map((p) => p.ordinal),
      createdItemIds: [],
      modifiedItemIds: [],
      failures: [],
      requestedBy: options.requestedBy,
      createdAt: now(),
    };
    await store.putJob(job);

    try {
      const output = await augmentor(section);
      const existingItems = await store.listItemsForKb(options.kbId);

      // ---- new items: exactly the additive extraction path -----------------
      const materialized = materializeExtraction(output, section, {
        sourceId: options.sourceId,
        requestedBy: options.requestedBy,
        now: now(),
        existingItems,
      });
      for (const item of materialized.items) {
        await store.putItem(item);
        await store.addMembership({ kbId: options.kbId, itemId: item.itemId });
      }
      for (const edge of materialized.edges) {
        await store.putEdge({ ...edge, edgeId: newId("ke"), createdAt: now() });
      }
      job.createdItemIds = materialized.items.map((i) => i.itemId);
      job.failures = [...materialized.failures];

      // ---- modifications: title-matched, version-committed, compile-gated --
      const byOrdinal = new Map(section.passages.map((p) => [p.ordinal, p]));
      const byTitle = new Map(
        existingItems.map((i) => [i.title.trim().toLowerCase(), i]),
      );
      const applied: { itemId: string; reason: string }[] = [];
      for (const mod of output.modifications ?? []) {
        const target = byTitle.get(mod.targetTitle.trim().toLowerCase());
        if (!target) {
          job.failures.push({
            anchor: `${section.anchor} → ${mod.targetTitle}`,
            reason: `modification target "${mod.targetTitle}" not found in the knowledge base`,
          });
          continue;
        }
        const citations = (mod.citedPassageOrdinals ?? [])
          .map((o) => byOrdinal.get(o))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({
            sourceId: options.sourceId,
            passageId: p.passageId,
            anchor: p.anchor,
          }));
        if (!citations.length) {
          job.failures.push({
            anchor: `${section.anchor} → ${mod.targetTitle}`,
            reason: "modification cites no valid passages",
          });
          continue;
        }
        const fresh = (await store.getItem(target.itemId)) ?? target;
        const updated: KnowledgeItem = {
          ...fresh,
          ...(mod.humanReadableText !== undefined && {
            humanReadableText: mod.humanReadableText,
          }),
          ...(mod.payload !== undefined && { payload: mod.payload }),
          ...(mod.settings !== undefined && { settings: mod.settings }),
          // The source's passages join the item's provenance.
          sourceReferences: [
            ...fresh.sourceReferences,
            ...citations.filter(
              (c) => !fresh.sourceReferences.some((r) => r.passageId === c.passageId),
            ),
          ],
          version: fresh.version + 1,
          updatedAt: now(),
        };
        // Compile gate: the KB with this item REPLACED must still compile.
        const others = (await store.listItemsForKb(options.kbId)).filter(
          (i) => i.itemId !== target.itemId,
        );
        const { errors } = compileKb({
          kbId: "kb_validation",
          version: 1,
          compiledAt: now(),
          items: [...others, updated],
          edges: [],
          packs: [],
        });
        const own = errors.filter((e) => e.itemId === updated.itemId);
        if (own.length) {
          job.failures.push({
            anchor: `${section.anchor} → ${mod.targetTitle}`,
            reason: own.map((e) => e.message).join("; "),
          });
          continue;
        }
        // Preserve the "before" as a committed version, then land the change
        // and commit it too — the board and the item's history show both.
        await service.commitItemVersion(
          target.itemId,
          options.requestedBy,
          "Pre-augmentation snapshot",
        );
        await store.putItem(updated);
        await service.commitItemVersion(
          target.itemId,
          options.requestedBy,
          `Augmented from source: ${mod.reason}`,
        );
        applied.push({ itemId: target.itemId, reason: mod.reason });
      }
      job.modifiedItemIds = applied.map((a) => a.itemId);

      await service.recompile(options.kbId);

      // Record progress on the draft's augmentation ledger.
      const kb = await service.getKb(options.kbId);
      if (kb.augmentation) {
        await store.putKb({
          ...kb,
          augmentation: {
            ...kb.augmentation,
            newItemIds: [...kb.augmentation.newItemIds, ...job.createdItemIds],
            modified: [...kb.augmentation.modified, ...applied],
          },
          updatedAt: now(),
        });
      }

      job.status = "completed";
      job.completedAt = now();
    } catch (e) {
      job.status = "failed";
      job.failures = [
        { anchor: section.anchor, reason: e instanceof Error ? e.message : "augmentor error" },
      ];
      job.completedAt = now();
    }
    await store.putJob(job);
    jobs.push(job);
  }

  return jobs;
}
