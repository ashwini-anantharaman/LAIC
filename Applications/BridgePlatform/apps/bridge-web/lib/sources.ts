import type { KbExtractionJob, KbSource, KnowledgeItem } from "@bridge/kb";

/**
 * The sources that belong on THIS KB's pages. The registry is global (one
 * rights record per document), so filter to: sources registered from this KB
 * (kbId stamp), plus legacy/unstamped sources this KB actually references —
 * via an item citation or an extraction run. src_claude (platform-global) is
 * kept; pages decide whether to render it.
 */
export function scopeSources(
  sources: KbSource[],
  kbId: string,
  items: KnowledgeItem[],
  jobs: KbExtractionJob[],
): KbSource[] {
  const referenced = new Set<string>(jobs.map((j) => j.sourceId));
  for (const item of items)
    for (const ref of item.sourceReferences) referenced.add(ref.sourceId);
  return sources.filter(
    (s) =>
      s.sourceId === "src_claude" || // platform-global
      s.kbId === kbId || // registered from this KB
      referenced.has(s.sourceId), // cited by an item or extraction run here (incl. derived KBs)
  );
}
