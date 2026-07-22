// Draft-vs-version diff summary: a handful of human strings describing how an
// item's working head differs from a committed snapshot (usually the MAIN
// version). Pure — deep-compares via @bridge/kb's stableStringify, so key
// order and dropped undefineds never register as changes.

import {
  stableStringify,
  type KnowledgeItem,
  type KnowledgeItemVersion,
} from "@bridge/kb";

const eq = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** Keyed rule diff for auction/forcing payloads: added / removed / edited by
 *  stable rule key, reported by the rule's human label. */
function ruleDiffs(
  head: { key: string; label: string }[],
  snap: { key: string; label: string }[],
): string[] {
  const out: string[] = [];
  const headBy = new Map(head.map((r) => [r.key, r]));
  const snapBy = new Map(snap.map((r) => [r.key, r]));
  for (const [key, rule] of headBy) {
    const old = snapBy.get(key);
    if (!old) out.push(`rule "${rule.label}" added`);
    else if (!eq(rule, old)) out.push(`rule "${rule.label}" edited`);
  }
  for (const [key, rule] of snapBy) {
    if (!headBy.has(key)) out.push(`rule "${rule.label}" removed`);
  }
  return out;
}

/**
 * Summarize how the head differs from a committed snapshot, as ≤6 short human
 * strings ('description edited', 'rule "Open 1NT" edited', …). Meant to be
 * called only when the item is dirty against this snapshot; if nothing the
 * summary tracks differs (e.g. only citations moved) it says "details edited".
 */
export function summarizeItemDiff(
  head: KnowledgeItem,
  snapshot: KnowledgeItemVersion,
): string[] {
  const out: string[] = [];

  if (head.title !== snapshot.title) out.push(`title changed to "${head.title}"`);
  if (head.humanReadableText !== snapshot.humanReadableText) out.push("description edited");
  if (head.status !== snapshot.status)
    out.push(`status ${snapshot.status} → ${head.status}`);
  if (!eq(head.tags ?? [], snapshot.tags ?? [])) out.push("tags changed");
  if ((head.internalNotes ?? "") !== (snapshot.internalNotes ?? ""))
    out.push("notes edited");

  // Settings compared by key — added / removed / changed.
  const headSettings = new Map(head.settings.map((s) => [s.key, s]));
  const snapSettings = new Map(snapshot.settings.map((s) => [s.key, s]));
  for (const [key, setting] of headSettings) {
    const old = snapSettings.get(key);
    if (!old) out.push(`setting "${key}" added`);
    else if (!eq(setting, old)) out.push(`setting "${key}" changed`);
  }
  for (const key of snapSettings.keys()) {
    if (!headSettings.has(key)) out.push(`setting "${key}" removed`);
  }

  // Payload: rule-by-rule for the keyed kinds, one line for everything else.
  const hp = head.payload;
  const vp = snapshot.payload;
  if (hp.kind === "auction_rules" && vp.kind === "auction_rules") {
    out.push(...ruleDiffs(hp.rules, vp.rules));
  } else if (hp.kind === "forcing_rules" && vp.kind === "forcing_rules") {
    out.push(...ruleDiffs(hp.rules, vp.rules));
  } else if (!eq(hp, vp)) {
    out.push("rules edited");
  }

  if (out.length === 0) out.push("details edited");
  if (out.length > 6) return [...out.slice(0, 5), `+${out.length - 5} more`];
  return out;
}
