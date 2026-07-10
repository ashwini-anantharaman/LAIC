import type { StudioCourseData, StudioPage } from "./types.js";

export type VocabEntry = [term: string, definition: string, pageIndex: number];
export type CardTuple = [string, string];

/** Extract visible text from <b>…</b> or <span class="vocab">…</span> in lesson HTML. */
export function extractTermsFromHtml(html: string): string[] {
  const terms = new Set<string>();
  const patterns = [
    /<b[^>]*>([^<]+)<\/b>/gi,
    /<span[^>]*class="[^"]*vocab[^"]*"[^>]*data-v="([^"]+)"[^>]*>/gi,
    /<span[^>]*data-v="([^"]+)"[^>]*class="[^"]*vocab[^"]*"[^>]*>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const t = m[1].trim();
      if (t) terms.add(t);
    }
  }
  return [...terms];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turn <b>key term</b> into linked vocab spans (preserves existing vocab spans). */
export function linkBoldTermsInHtml(html: string): string {
  return html.replace(/<b([^>]*)>([^<]+)<\/b>/gi, (_match, attrs, inner) => {
    const term = inner.trim();
    if (!term) return inner;
    const safe = escapeHtml(term);
    if (attrs && /class="[^"]*vocab/.test(attrs)) return `<b${attrs}>${inner}</b>`;
    return `<span class="vocab" data-v="${safe}">${safe}</span>`;
  });
}

function definitionFor(term: string, existing: VocabEntry[], generated: [string, string][]): string {
  const fromExisting = existing.find(([t]) => t.toLowerCase() === term.toLowerCase());
  if (fromExisting?.[1]?.trim() && fromExisting[1] !== "Add definition") return fromExisting[1];
  const fromGen = generated.find(([t]) => t.toLowerCase() === term.toLowerCase());
  if (fromGen?.[1]?.trim()) return fromGen[1];
  return "Add definition";
}

/** Merge bold terms from all study blocks into studio.vocab. */
export function buildVocabFromPages(
  pages: StudioPage[],
  existing: VocabEntry[] = [],
  generatedPairs: [string, string][] = []
): VocabEntry[] {
  const byTerm = new Map<string, VocabEntry>();

  for (const [term, def, pageIndex] of existing) {
    if (term.trim()) byTerm.set(term.toLowerCase(), [term, def, pageIndex]);
  }

  pages.forEach((page, pageIndex) => {
    for (const block of page.blocks) {
      if (block.type !== "study") continue;
      for (const term of extractTermsFromHtml(block.html)) {
        const key = term.toLowerCase();
        if (!byTerm.has(key)) {
          byTerm.set(key, [term, definitionFor(term, existing, generatedPairs), pageIndex]);
        }
      }
    }
  });

  return [...byTerm.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function normalizeCardItem(item: unknown): CardTuple {
  if (Array.isArray(item) && item.length >= 2) {
    return [String(item[0] ?? ""), String(item[1] ?? "")];
  }
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const o = item as { front?: string; back?: string };
    return [String(o.front ?? ""), String(o.back ?? "")];
  }
  return ["Front", "Back"];
}

export function normalizeVocabItem(item: unknown, pageIndex = 0): VocabEntry {
  if (Array.isArray(item)) {
    return [
      String(item[0] ?? ""),
      String(item[1] ?? "Add definition"),
      typeof item[2] === "number" ? item[2] : pageIndex,
    ];
  }
  if (item && typeof item === "object") {
    const o = item as { word?: string; def?: string; term?: string; definition?: string };
    return [
      String(o.word ?? o.term ?? ""),
      String(o.def ?? o.definition ?? "Add definition"),
      pageIndex,
    ];
  }
  return ["Term", "Add definition", pageIndex];
}

/** Keep tools + top-level vocab/cards arrays in sync. */
export function syncStudioTools(studio: StudioCourseData): StudioCourseData {
  const vocab = buildVocabFromPages(studio.pages, studio.vocab ?? []);
  const cards = studio.cards?.length > 0 ? studio.cards.map((c) => normalizeCardItem(c)) : [];

  const tools = (studio.tools ?? []).map((tool) => {
    if (tool.kind === "vocab") {
      return { ...tool, items: vocab.map(([term, def, pageIndex]) => [term, def, pageIndex] as VocabEntry) };
    }
    if (tool.kind === "cards") {
      const toolCards =
        tool.items.length > 0 ? tool.items.map(normalizeCardItem) : cards.length ? cards : [];
      return { ...tool, items: toolCards };
    }
    return tool;
  });

  const resolvedCards =
    cards.length > 0 ? cards : (tools.find((t) => t.kind === "cards")?.items ?? []).map(normalizeCardItem);

  return { ...studio, vocab, cards: resolvedCards, tools };
}

/** Link bold terms in every study block and sync vocab list. */
export function linkVocabInStudio(studio: StudioCourseData): StudioCourseData {
  const pages = studio.pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.type !== "study") return block;
      return { ...block, html: linkBoldTermsInHtml(block.html) };
    }),
  }));
  return syncStudioTools({ ...studio, pages });
}
