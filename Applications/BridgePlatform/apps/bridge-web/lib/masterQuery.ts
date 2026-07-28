// The Master viewer's filter + sort semantics as a pure module, shared by the
// items list page (which renders the filtered list) and the item page (which
// re-runs the same query to offer prev/next review navigation). No JSX, no
// store access — unit-testable with plain fixtures.

import type { KnowledgeItem } from "@bridge/kb";
import { TYPE_LABEL } from "../components/kb/badges";
import { whenRoles } from "./whenFacet";

export interface MasterQuery {
  q?: string;
  type?: string;
  phase?: string;
  status?: string;
  when?: string;
  tag?: string;
  sort?: string;
}

const QUERY_KEYS = ["q", "type", "phase", "status", "when", "tag", "sort"] as const;

/** Read the Master list's filter/sort params (empty strings count as unset). */
export function parseMasterQuery(
  params: URLSearchParams | Record<string, string | undefined>,
): MasterQuery {
  const get = (key: string) =>
    params instanceof URLSearchParams ? (params.get(key) ?? undefined) : params[key];
  const out: MasterQuery = {};
  for (const key of QUERY_KEYS) {
    const value = get(key);
    if (value) out[key] = value;
  }
  return out;
}

/** How many executable rules an item carries (0 = teaching prose). */
export function ruleCount(item: KnowledgeItem): number {
  const p = item.payload;
  switch (p.kind) {
    case "auction_rules":
      return p.rules.length;
    case "forcing_rules":
      return p.rules.length;
    case "play_rules":
      return p.rules.length;
    case "lead_rules":
      return p.leads.length;
    case "signals":
    case "fallback":
      return 1;
    default:
      return 0;
  }
}

/** Does the item speak in this auction position? ("any"-role rules match all
 *  four positions; items with no auction roles never match.) */
export function matchesWhen(item: KnowledgeItem, when: string): boolean {
  const roles = whenRoles(item);
  if (when === "opening") return roles.has("opening") || roles.has("any");
  if (when === "responding") return roles.has("responder") || roles.has("any");
  if (when === "rebidding") return roles.has("opener") || roles.has("any");
  if (when === "competing")
    return roles.has("overcaller") || roles.has("advancer") || roles.has("any");
  return true;
}

/** The lowercased haystack the q filter searches: title, description, every
 *  rule/forcing/lead label, tags, and the kind's display label — so searching
 *  "stayman 2♣ ask" or "convention" finds the items that carry them. */
export function searchText(item: KnowledgeItem): string {
  const p = item.payload;
  const ruleLabels: string[] = [];
  if (p.kind === "auction_rules" || p.kind === "forcing_rules") {
    ruleLabels.push(...p.rules.map((r) => r.label));
  } else if (p.kind === "play_rules") {
    ruleLabels.push(...p.rules.map((r) => r.behavior.replace(/_/g, " ")));
  } else if (p.kind === "lead_rules") {
    ruleLabels.push(...p.leads.map((l) => `${l.style.replace(/_/g, " ")} vs ${l.versus}`));
  }
  return [
    item.title,
    item.humanReadableText,
    ...ruleLabels,
    ...(item.tags ?? []),
    TYPE_LABEL[item.knowledgeType],
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Filter + sort exactly as the Master list does: q over searchText(), exact
 * matches on kind/phase/status/tag, the when-facet role logic, deprecated
 * items excluded unless explicitly asked for, and title/updated/rules sorts
 * (title A–Z is the default).
 */
export function applyMasterQuery(items: KnowledgeItem[], q: MasterQuery): KnowledgeItem[] {
  const query = (q.q ?? "").toLowerCase();
  const sort = q.sort === "updated" || q.sort === "rules" ? q.sort : "title";
  return items
    .filter((i) => !query || searchText(i).includes(query))
    .filter((i) => !q.type || i.knowledgeType === q.type)
    .filter((i) => !q.phase || i.phase === q.phase)
    .filter((i) => (q.status ? i.status === q.status : i.status !== "deprecated"))
    .filter((i) => !q.when || matchesWhen(i, q.when))
    .filter((i) => !q.tag || (i.tags ?? []).includes(q.tag))
    .sort((a, b) => {
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "rules") return ruleCount(b) - ruleCount(a) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
}
