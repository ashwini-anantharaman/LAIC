// Install the curated template into a fresh KB. One code path for tests AND
// the web action, so the exact thing that ships is the exact thing the
// scenario suite exercises. Batch pattern per runExtraction: direct store
// puts, then ONE recompile — never per-item createItem (O(N²) compiles).

import {
  newId,
  type KbEdge,
  type KbService,
  type KbStore,
  type KnowledgeItem,
} from "@bridge/kb";
import { chapterOf, SAYC_TEMPLATE } from "./index";

export interface InstallResult {
  kbId: string;
  itemIdByKey: Map<string, string>;
  packIdByKey: Map<string, string>;
  /** Compile error message, if the KB failed to compile (tests assert null). */
  compileError: string | null;
}

export async function installSaycTemplate(
  store: KbStore,
  service: KbService,
  opts: { createdBy: string; kbName?: string },
): Promise<InstallResult> {
  const now = new Date().toISOString();
  const kb = await service.createKb({
    name: opts.kbName ?? SAYC_TEMPLATE.kb.name,
    systemLabel: SAYC_TEMPLATE.kb.systemLabel,
    description: SAYC_TEMPLATE.kb.description,
    createdBy: opts.createdBy,
  });

  const itemIdByKey = new Map<string, string>();
  for (const t of SAYC_TEMPLATE.items) {
    const item: KnowledgeItem = {
      itemId: newId("ki"),
      title: t.title,
      humanReadableText: t.humanReadableText,
      knowledgeType: t.knowledgeType,
      phase: t.phase,
      payload: t.payload,
      settings: t.settings ?? [],
      sourceReferences: [
        { sourceId: "src_claude", anchor: `curated SAYC · ${chapterOf(t.key)}` },
      ],
      supportedLevels: [],
      // Curated + machine-tested = reviewed; fellows give the final approval.
      status: "reviewed",
      version: 1,
      createdBy: opts.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await store.putItem(item);
    await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
    itemIdByKey.set(t.key, item.itemId);
  }

  for (const e of SAYC_TEMPLATE.edges) {
    const fromItemId = itemIdByKey.get(e.from);
    const toItemId = itemIdByKey.get(e.to);
    if (!fromItemId || !toItemId) throw new Error(`edge references unknown key ${e.from}→${e.to}`);
    const edge: KbEdge = {
      edgeId: newId("ke"),
      fromItemId,
      edgeType: e.edgeType,
      toItemId,
      origin: "fellow",
      confirmed: true,
      createdBy: opts.createdBy,
      createdAt: now,
    };
    await store.putEdge(edge);
  }

  const packIdByKey = new Map<string, string>();
  for (const p of SAYC_TEMPLATE.packs) {
    const itemIds = SAYC_TEMPLATE.items
      .filter((i) => i.sets.some((tag) => p.tags.includes(tag)))
      .map((i) => itemIdByKey.get(i.key)!)
      .sort();
    const packId = newId("pk");
    await store.putPack({
      packId,
      kbId: kb.kbId,
      name: p.name,
      description: p.description,
      ordinal: 0,
      ...(p.includes && { extendsPackId: packIdByKey.get(p.includes)! }),
      itemIds,
      ...(p.intendedComplete && { intendedComplete: true }),
      createdBy: opts.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    packIdByKey.set(p.key, packId);
  }

  const { error } = await service.recompile(kb.kbId);
  return {
    kbId: kb.kbId,
    itemIdByKey,
    packIdByKey,
    compileError: error ?? null,
  };
}
