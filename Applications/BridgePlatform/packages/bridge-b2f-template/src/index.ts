// @bridge/b2f-template — the "Bridge 2 Fun Training" notes (32 pages) as typed
// knowledge, authored page by page.
//
// This is a DIFFERENT system from @bridge/girkar-template, even though both are
// Standard American 2/1 Game Force. The differences are deliberate and are the
// reason it gets its own knowledge base rather than being merged in:
//
//   · opener's bands are 12-15 / 16-19 / 20-21   (girkar: 12-14 / 15-17 / 18-21)
//   · TEXAS transfers (4♦→♥, 4♥→♠) exist alongside Jacoby
//   · a minor-suit transfer over 1NT
//   · the inverted minor raise needs 10+          (girkar: 9+)
//   · 1NT IS opened with a five-card major — stated outright on page 10
//     ("even with 5M"), the opposite of the girkar deck's reading
//   · signals are STANDARD: high-low from a doubleton, top of a sequence,
//     fourth best                                 (girkar: upside-down)
//   · Gerber 4♣ over 1NT/2NT
//   · and the systemic rule with no counterpart anywhere in the other deck:
//     under interference the limit raise, Jacoby 2NT, inverted minors and the
//     forcing 1NT are ALL OFF, and the cuebid carries those hands instead.
//
// PROVENANCE. Every item cites the page it was authored from. The deal-review
// chapter is special: its fifteen four-hand layouts were transcribed from the
// diagrams and then machine-checked (52 distinct cards, 13 per suit, and the
// HCP derived from the cards matched the HCP printed beside every seat) before
// any of them was used. Reading hand diagrams is the least reliable part of
// reading a document like this, and the errors are silent, so they are checked
// rather than trusted.

import type { SetTag, TemplateEdge, TemplateItem } from "@bridge/sayc-template/dsl";
import { CARDING } from "./chapters/carding";
import { COMPETITIVE } from "./chapters/competitive";
import { CONVENTIONS } from "./chapters/conventions";
import { DEALS } from "./chapters/deals";
import { FLOOR } from "./chapters/floor";
import { NT_RESPONSES } from "./chapters/ntResponses";
import { OPENINGS } from "./chapters/openings";
import { PLAY } from "./chapters/play";
// PARKED 2026-07-25: chapters/rebids.ts was never authored (the agent hit the
// weekly usage limit). Restore this import and its CHAPTERS entry once the
// file exists — see the plan file, section 1b.
// import { REBIDS } from "./chapters/rebids";
import { SUIT_RESPONSES } from "./chapters/suitResponses";
import { B2F_EDGES } from "./edges";

export type { SetTag, TemplateEdge, TemplateItem } from "@bridge/sayc-template/dsl";

export interface TemplatePack {
  key: string;
  name: string;
  description: string;
  includes?: string;
  tags: SetTag[];
  intendedComplete?: boolean;
}

export interface B2fTemplate {
  kb: { name: string; systemLabel: string; description: string };
  items: TemplateItem[];
  edges: TemplateEdge[];
  packs: TemplatePack[];
}

const CHAPTERS: { name: string; items: TemplateItem[] }[] = [
  { name: "openings", items: OPENINGS },
  { name: "notrump responses", items: NT_RESPONSES },
  { name: "suit responses", items: SUIT_RESPONSES },
  // { name: "opener's rebids", items: REBIDS },  // PARKED — see above
  { name: "competitive bidding", items: COMPETITIVE },
  { name: "conventions", items: CONVENTIONS },
  { name: "declarer play", items: PLAY },
  { name: "leads and carding", items: CARDING },
  { name: "deal review", items: DEALS },
  { name: "floor", items: FLOOR },
];

/** Chapter of an item, for citation anchors ("training notes · openings"). */
export function chapterOf(itemKey: string): string {
  for (const { name, items } of CHAPTERS) {
    if (items.some((i) => i.key === itemKey)) return name;
  }
  return "training notes";
}

const items = CHAPTERS.flatMap((c) => c.items);

// Authoring invariants, enforced at import time so a bad chapter edit fails the
// test run rather than compiling nonsense.
{
  const keys = new Set<string>();
  for (const i of items) {
    if (keys.has(i.key)) throw new Error(`duplicate template item key "${i.key}"`);
    keys.add(i.key);
  }
  const settingKeys = new Set<string>();
  for (const i of items) {
    for (const s of i.settings ?? []) {
      if (settingKeys.has(s.key))
        throw new Error(`setting key "${s.key}" declared by more than one item`);
      settingKeys.add(s.key);
    }
  }
}

export const B2F_TEMPLATE: B2fTemplate = {
  kb: {
    name: "Bridge 2 Fun (training notes)",
    systemLabel: "B2F 2/1",
    description:
      "Standard American 2/1 Game Force as written up in the Bridge 2 Fun training notes: 15–17 1NT opened even with a five-card major, opener's bands 12-15/16-19/20-21, Texas and Jacoby transfers, a minor-suit transfer, Gerber, inverted minors at 10+, and conventions switched off under interference in favour of the cuebid. Authored page by page; every item cites its page and awaits expert approval.",
  },
  items,
  edges: B2F_EDGES,
  packs: [
    {
      key: "floor",
      name: "Floor",
      description: "The three phase fallbacks plus the signal policy — the minimum complete player.",
      tags: ["floor"],
      intendedComplete: true,
    },
    {
      key: "core",
      name: "Core natural bidding",
      description:
        "The notes' natural system: the opening table, natural responses and rebids, competition, declarer play, leads and carding. Includes the Floor.",
      includes: "floor",
      tags: ["core"],
    },
    {
      key: "conventions",
      name: "Conventions",
      description:
        "The notes' named gadgets: Stayman, Jacoby and Texas transfers, the minor-suit transfer, Jacoby 2NT, inverted minors, the forcing 1NT, negative and takeout doubles, Michaels, Unusual NT, Unusual vs Unusual, splinters, Roman keycards and Gerber.",
      tags: ["conventions"],
    },
    {
      key: "full",
      name: "Full training notes",
      description:
        "Everything the notes teach, including the December 2025 deal review. Includes Core (and through it the Floor).",
      includes: "core",
      tags: ["conventions"],
      intendedComplete: true,
    },
  ],
};
