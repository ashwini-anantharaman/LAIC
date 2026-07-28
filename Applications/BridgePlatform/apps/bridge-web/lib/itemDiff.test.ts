// summarizeItemDiff turns a head-vs-snapshot comparison into a handful of
// human strings. These tests pin each tracked field, the keyed rule diff, and
// the ≤6 cap the item page depends on.

import type { KnowledgeItem, KnowledgeItemVersion } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { summarizeItemDiff } from "./itemDiff";

type Payload = KnowledgeItem["payload"];
type Settings = KnowledgeItem["settings"];

function mkHead(o: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    itemId: "ki_1",
    title: "Stayman",
    humanReadableText: "ask for a major",
    knowledgeType: "convention",
    phase: "auction",
    payload: { kind: "none" },
    settings: [],
    sourceReferences: [],
    supportedLevels: [],
    status: "approved",
    version: 2,
    createdBy: "u",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...o,
  };
}

function mkSnap(o: Partial<KnowledgeItemVersion> = {}): KnowledgeItemVersion {
  return {
    itemId: "ki_1",
    versionNumber: 1,
    headVersion: 1,
    title: "Stayman",
    humanReadableText: "ask for a major",
    knowledgeType: "convention",
    phase: "auction",
    payload: { kind: "none" },
    settings: [],
    sourceReferences: [],
    supportedLevels: [],
    status: "approved",
    contentHash: "h",
    committedBy: "u",
    committedAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

const setting = (key: string, def: unknown) =>
  ({ key, label: key, control: "toggle", role: "enable", default: def }) as unknown as Settings[number];

const rules = (...rs: { key: string; label: string; priority: number }[]) =>
  ({ kind: "auction_rules", rules: rs } as unknown as Payload);

describe("summarizeItemDiff", () => {
  it("reports a title change with the new value", () => {
    const out = summarizeItemDiff(mkHead({ title: "Puppet Stayman" }), mkSnap());
    expect(out).toContain('title changed to "Puppet Stayman"');
  });

  it("reports an edited description", () => {
    expect(summarizeItemDiff(mkHead({ humanReadableText: "changed" }), mkSnap())).toContain(
      "description edited",
    );
  });

  it("reports a status transition", () => {
    expect(summarizeItemDiff(mkHead({ status: "draft" }), mkSnap({ status: "approved" }))).toContain(
      "status approved → draft",
    );
  });

  it("reports changed tags", () => {
    expect(summarizeItemDiff(mkHead({ tags: ["a", "b"] }), mkSnap({ tags: ["a"] }))).toContain(
      "tags changed",
    );
  });

  it("reports edited internal notes", () => {
    expect(summarizeItemDiff(mkHead({ internalNotes: "note" }), mkSnap())).toContain("notes edited");
  });

  it("reports settings added, removed and changed", () => {
    const added = summarizeItemDiff(mkHead({ settings: [setting("toggle_x", true)] }), mkSnap());
    expect(added).toContain('setting "toggle_x" added');

    const removed = summarizeItemDiff(mkHead(), mkSnap({ settings: [setting("toggle_x", true)] }));
    expect(removed).toContain('setting "toggle_x" removed');

    const changed = summarizeItemDiff(
      mkHead({ settings: [setting("toggle_x", false)] }),
      mkSnap({ settings: [setting("toggle_x", true)] }),
    );
    expect(changed).toContain('setting "toggle_x" changed');
  });

  it("reports rule add / remove / edit by label for keyed payloads", () => {
    const head = mkHead({
      payload: rules({ key: "r1", label: "Open 1NT", priority: 2 }, { key: "r3", label: "New rule", priority: 1 }),
    });
    const snap = mkSnap({
      payload: rules({ key: "r1", label: "Open 1NT", priority: 1 }, { key: "r2", label: "Old rule", priority: 1 }),
    });
    const out = summarizeItemDiff(head, snap);
    expect(out).toContain('rule "Open 1NT" edited'); // priority changed
    expect(out).toContain('rule "New rule" added'); // r3 only in head
    expect(out).toContain('rule "Old rule" removed'); // r2 only in snap
  });

  it("reports a one-liner for non-keyed payload kinds", () => {
    const head = mkHead({ payload: { kind: "signals", signals: { primary: "count" } } as unknown as Payload });
    const snap = mkSnap({ payload: { kind: "signals", signals: { primary: "attitude" } } as unknown as Payload });
    expect(summarizeItemDiff(head, snap)).toContain("rules edited");
  });

  it("falls back to 'details edited' when nothing tracked differs", () => {
    // Only source references moved — not a tracked field.
    const head = mkHead({ sourceReferences: [{ sourceId: "s2", anchor: "x" }] });
    expect(summarizeItemDiff(head, mkSnap())).toEqual(["details edited"]);
  });

  it("caps the summary at 6 strings with a '+N more' tail", () => {
    const head = mkHead({
      title: "New title",
      humanReadableText: "new",
      status: "draft",
      tags: ["z"],
      internalNotes: "n",
      settings: [setting("a", 1), setting("b", 2), setting("c", 3)],
    });
    const out = summarizeItemDiff(head, mkSnap({ status: "approved" }));
    expect(out.length).toBe(6);
    expect(out[5]).toMatch(/^\+\d+ more$/);
  });
});
