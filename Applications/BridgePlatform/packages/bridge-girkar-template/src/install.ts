// Install the teaching-deck template into a fresh KB. One code path for tests
// AND the web action. Batch pattern: direct store puts, then ONE recompile.
//
// Citations point at the SLIDE each item was authored from, so a reviewer can
// open the deck at that page and check the rule against the picture. When the
// deck has been uploaded as a source with per-slide passages, pass
// `sourceId` + `passageIdByPage` and the citations resolve to real passages;
// otherwise they degrade to an anchor-only citation on src_claude.

import {
  newId,
  type Citation,
  type KbEdge,
  type KbService,
  type KbStore,
  type KnowledgeItem,
} from "@bridge/kb";
import { chapterOf, GIRKAR_TEMPLATE } from "./index";
import { SLIDES_BY_KEY } from "./slides";

export interface InstallResult {
  kbId: string;
  itemIdByKey: Map<string, string>;
  packIdByKey: Map<string, string>;
  compileError: string | null;
}

export interface InstallOptions {
  createdBy: string;
  kbName?: string;
  /** Install into an EXISTING kb instead of creating one. */
  kbId?: string;
  /** The uploaded deck, so citations resolve to real slide passages. */
  sourceId?: string;
  /** page number → passageId, from the source's per-slide passages. */
  passageIdByPage?: Map<number, string>;
}

export async function installGirkarTemplate(
  store: KbStore,
  service: KbService,
  opts: InstallOptions,
): Promise<InstallResult> {
  const now = new Date().toISOString();
  const kbId =
    opts.kbId ??
    (
      await service.createKb({
        name: opts.kbName ?? GIRKAR_TEMPLATE.kb.name,
        systemLabel: GIRKAR_TEMPLATE.kb.systemLabel,
        description: GIRKAR_TEMPLATE.kb.description,
        createdBy: opts.createdBy,
      })
    ).kbId;

  /** Cite the slides this item was authored from. */
  const citationsFor = (key: string): Citation[] => {
    const pages = SLIDES_BY_KEY[key] ?? [];
    const chapter = chapterOf(key);
    if (!pages.length)
      return [{ sourceId: "src_claude", anchor: `teaching deck · ${chapter}` }];
    return pages.map((page) => {
      const passageId = opts.sourceId ? opts.passageIdByPage?.get(page) : undefined;
      return {
        sourceId: opts.sourceId ?? "src_claude",
        ...(passageId && { passageId }),
        anchor: `slide ${page}`,
      };
    });
  };

  const itemIdByKey = new Map<string, string>();
  for (const t of GIRKAR_TEMPLATE.items) {
    const item: KnowledgeItem = {
      itemId: newId("ki"),
      title: t.title,
      humanReadableText: t.humanReadableText,
      knowledgeType: t.knowledgeType,
      phase: t.phase,
      payload: t.payload,
      settings: t.settings ?? [],
      sourceReferences: citationsFor(t.key),
      supportedLevels: [],
      // Machine-tested, but no HUMAN has approved it — status tells the truth.
      status: "draft",
      version: 1,
      createdBy: opts.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await store.putItem(item);
    await store.addMembership({ kbId, itemId: item.itemId });
    itemIdByKey.set(t.key, item.itemId);
  }

  for (const e of GIRKAR_TEMPLATE.edges) {
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
  for (const p of GIRKAR_TEMPLATE.packs) {
    const itemIds = GIRKAR_TEMPLATE.items
      .filter((i) => i.sets.some((tag) => p.tags.includes(tag)))
      .map((i) => itemIdByKey.get(i.key)!)
      .sort();
    const packId = newId("pk");
    await store.putPack({
      packId,
      kbId,
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

  const { error } = await service.recompile(kbId);
  return { kbId, itemIdByKey, packIdByKey, compileError: error ?? null };
}
