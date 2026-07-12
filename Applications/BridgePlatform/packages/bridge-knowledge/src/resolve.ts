// Trace resolution (Bridge plan §12.10 step 9): runtime rule -> generated
// artifact -> readable knowledge item -> source documents. This is
// what the table's "why did the AI do that?" panel calls (Phase 5).

import type {
  BridgeKnowledgeSource,
  BridgeReadableKnowledgeItem,
  Citation,
} from "./model";
import type { KnowledgeStore } from "./store";

export interface ResolvedRuleProvenance {
  packageId: string;
  version: string;
  ruleId: string;
  ruleTitle: string;
  items: BridgeReadableKnowledgeItem[];
  sources: BridgeKnowledgeSource[];
  citations: Citation[];
}

export async function resolveRuleProvenance(
  store: KnowledgeStore,
  packageId: string,
  version: string,
  ruleId: string,
): Promise<ResolvedRuleProvenance | null> {
  const record = await store.getPackage(packageId, version);
  if (!record) return null;
  const rule =
    record.pkg.bidRules.find((r) => r.ruleId === ruleId) ??
    record.pkg.playRules.find((r) => r.ruleId === ruleId);
  if (!rule) return null;

  const items = (
    await Promise.all(rule.provenance.knowledgeItemIds.map((id) => store.getItem(id)))
  ).filter((i): i is BridgeReadableKnowledgeItem => i !== null);

  const sourceIds = new Set<string>([
    ...rule.provenance.sourceIds,
    ...items.flatMap((i) => i.sourceIds),
  ]);
  const sources = (
    await Promise.all([...sourceIds].map((id) => store.getSource(id)))
  ).filter((s): s is BridgeKnowledgeSource => s !== null);

  return {
    packageId,
    version,
    ruleId,
    ruleTitle: rule.title,
    items,
    sources,
    citations: items.flatMap((i) => i.citations),
  };
}
