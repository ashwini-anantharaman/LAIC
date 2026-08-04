// What the knowledge base SAYS about a rule — not just what the rule does.
//
// The compiled artifact is the machine half of a knowledge item: conditions,
// an action, an order. The item it came from also carries the human half, and
// until now the coach ignored all of it:
//
//   · `humanReadableText` — the explanation a fellow wrote for this agreement.
//     The coach was paraphrasing it from the rule's label instead, which meant
//     the platform's authored teaching voice was replaced by mine.
//   · `sourceReferences` — citations into real bridge literature
//     (`{sourceId, passageId, anchor}`). The strip was showing the rule's own
//     label as its "citation", which cites nothing.
//
// The hook is `CompiledAuctionRule.provenance.itemId`. The compile does not
// carry the prose (its `items` are id/version/title/type only), so this is a
// second read — cheap, and cached, because a committed item version is
// immutable exactly like a compile.
//
// WHY THIS MATTERS BEYOND TIDINESS: "an open, cited rulebook that can always
// tell you why" is the product's claim. A note that asserts in the coach's own
// words, citing its own label, is that claim unmet.

import type { CompiledKb, KnowledgeItem } from "@bridge/kb";

/**
 * The narrow slice of the KB store this needs — injected, not imported.
 *
 * Reaching for the `kbStore()` singleton directly would weld the coach's
 * teaching lookup to Postgres and to the host's module graph, which makes it
 * untestable and drags a database driver into anything that imports the coach.
 * `KbStore` satisfies this structurally, so the page passes it straight in.
 */
export interface TeachingStore {
  getItem(itemId: string): Promise<KnowledgeItem | null>;
  listSources(): Promise<readonly { sourceId: string; title: string }[]>;
}

export interface Teaching {
  /** The item's own explanation, as authored. Absent if the item has none. */
  text?: string;
  /** Real citations: the source's title plus the anchor locating the claim. */
  citations: { label: string; sourceId?: string }[];
  /** The item behind the rule, for callers that want more. */
  itemId?: string;
}

const EMPTY: Teaching = { citations: [] };

/**
 * How much authored prose a note carries.
 *
 * The strip sits under a hand on a phone. Some items are a sentence, some are
 * several paragraphs of judgment guidance, and the second kind cannot go in
 * whole. Cut on a sentence boundary so what survives still reads as prose
 * rather than a truncated string.
 */
const MAX_TEXT = 700;
function trim(text: string): string {
  const clean = text.trim();
  if (clean.length <= MAX_TEXT) return clean;
  const cut = clean.slice(0, MAX_TEXT);
  // A sentence boundary if there is one in the back half; otherwise the last
  // WORD boundary. Never a bare slice — cutting mid-word ("bids 2…") reads as a
  // rendering fault rather than an abbreviation, and that is what it looked
  // like when this cap was 400 and items ran longer than their first paragraph.
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > MAX_TEXT * 0.5) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * A teaching reader bound to one compiled artifact.
 *
 * Items and sources are fetched once per reader and held for its lifetime (one
 * board render). Cache keys are safe because a compile is immutable and the
 * item version it pins is too.
 */
export function kbTeaching({
  compiled,
  store,
}: {
  compiled: CompiledKb;
  store: TeachingStore;
}) {
  // ruleId → the item that produced it. Built from the compile, which is already
  // in memory, so this costs nothing.
  //
  // EVERY rule kind, not just the auction's. Indexing only `auctionRules` meant
  // every card-play and lead rule missed the lookup, so card notes fell back to
  // the rule's bare LABEL as their explanation ("The finesse" — a title, not a
  // sentence) and carried no source citations at all. Card verdicts were
  // supposed to become citable the moment they consulted the knowledge base;
  // they did not, because the prose was never reachable.
  const itemIdByRule = new Map<string, string>();
  for (const rule of [
    ...compiled.auctionRules,
    ...compiled.playRules,
    ...compiled.leadRules,
    ...compiled.forcingRules,
  ]) {
    itemIdByRule.set(rule.ruleId, rule.provenance.itemId);
  }

  const items = new Map<string, KnowledgeItem | null>();
  const sourceTitles = new Map<string, string>();
  let sourcesLoaded = false;

  async function loadSourceTitles(): Promise<void> {
    if (sourcesLoaded) return;
    sourcesLoaded = true;
    for (const source of await store.listSources()) {
      sourceTitles.set(source.sourceId, source.title);
    }
  }

  return {
    /**
     * What the knowledge base says about the rule the coach is citing.
     *
     * Never throws: the KB being unreachable, or an item having been deleted
     * since the compile, must cost the learner a richer note and nothing more.
     */
    async forRule(ruleId: string | undefined): Promise<Teaching> {
      if (!ruleId) return EMPTY;
      const itemId = itemIdByRule.get(ruleId);
      if (!itemId) return EMPTY;

      try {
        if (!items.has(itemId)) {
          items.set(itemId, await store.getItem(itemId));
        }
        const item = items.get(itemId);
        if (!item) return EMPTY;

        const citations: Teaching["citations"] = [];
        if (item.sourceReferences.length) {
          await loadSourceTitles();
          for (const ref of item.sourceReferences) {
            const title = sourceTitles.get(ref.sourceId);
            citations.push({
              // "Standard American Yellow Card — 'open five-card majors'".
              // The anchor is what locates the claim in the document, so it is
              // the part worth showing; the title says where to look.
              label: title ? `${title} — ${ref.anchor}` : ref.anchor,
              sourceId: ref.sourceId,
            });
          }
        }

        return {
          ...(item.humanReadableText.trim()
            ? { text: trim(item.humanReadableText) }
            : {}),
          citations,
          itemId,
        };
      } catch {
        // A note without its sources is worse than one with them, and far
        // better than no note at all.
        return EMPTY;
      }
    },
  };
}
