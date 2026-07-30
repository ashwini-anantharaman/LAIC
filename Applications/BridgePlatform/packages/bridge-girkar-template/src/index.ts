// @bridge/girkar-template — Standard American 2/1 Game Force exactly as it is
// taught in Milind Girkar's "Introduction to Bridge" deck (88 slides,
// 2025-08-27), hand-authored from the slides one at a time.
//
// WHY THIS EXISTS: the deck's meaning lives in TABLES, colored rows and
// diagrams — a five-column bidding table (Points | Suit length | Bid | Note |
// Example), orange rows meaning "forcing", a support×strength matrix, deal
// figures. Reading it as flat text loses all of that, so every item here was
// authored by reading the actual slide. Each item cites the slide it came from
// (`slide N`), so a reviewer can always check the rule against the picture.
//
// Reuses @bridge/sayc-template's authoring DSL (no fork) and the same install
// discipline: items land as DRAFTS — machine-tested, but no human has approved
// them yet — and every convention carries an enable toggle.

import type { SetTag, TemplateEdge, TemplateItem } from "@bridge/sayc-template/dsl";
import { COMPETITIVE } from "./chapters/competitive";
import { FLOOR } from "./chapters/floor";
import { LEADS_CARDING } from "./chapters/leadsCarding";
import { NT_RESPONSES } from "./chapters/ntResponses";
import { OPENINGS } from "./chapters/openings";
import { PROSE } from "./chapters/prose";
import { REBIDS } from "./chapters/rebids";
import { SLAM } from "./chapters/slam";
import { SUIT_RESPONSES } from "./chapters/suitResponses";
import { GIRKAR_EDGES } from "./edges";

export type { SetTag, TemplateEdge, TemplateItem } from "@bridge/sayc-template/dsl";

export interface TemplatePack {
  key: string;
  name: string;
  description: string;
  /** Local key of the set this one Includes (extends). */
  includes?: string;
  tags: SetTag[];
  intendedComplete?: boolean;
}

export interface GirkarTemplate {
  kb: { name: string; systemLabel: string; description: string };
  items: TemplateItem[];
  edges: TemplateEdge[];
  packs: TemplatePack[];
}

const CHAPTERS: { name: string; items: TemplateItem[] }[] = [
  { name: "openings", items: OPENINGS },
  { name: "notrump responses", items: NT_RESPONSES },
  { name: "suit responses", items: SUIT_RESPONSES },
  { name: "rebids", items: REBIDS },
  { name: "competitive bidding", items: COMPETITIVE },
  { name: "slam bidding", items: SLAM },
  { name: "leads and carding", items: LEADS_CARDING },
  { name: "concepts", items: PROSE },
  { name: "floor", items: FLOOR },
];

/** Chapter of an item, for citation anchors ("teaching deck · openings"). */
export function chapterOf(itemKey: string): string {
  for (const { name, items } of CHAPTERS) {
    if (items.some((i) => i.key === itemKey)) return name;
  }
  return "teaching deck";
}

const items = CHAPTERS.flatMap((c) => c.items);

// Authoring invariants, enforced at import time so a bad chapter edit fails
// the test run rather than compiling nonsense.
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

export const GIRKAR_TEMPLATE: GirkarTemplate = {
  kb: {
    name: "Introduction to Bridge (teaching deck)",
    systemLabel: "SA 2/1 GF",
    description:
      "Standard American 2/1 Game Force as taught in Milind Girkar's Introduction to Bridge deck: 15–17 1NT, strong 2♣, Jacoby transfers, Stayman, Roman keycards, UDCA signals and fourth-best leads. Authored slide by slide from the deck; every item cites its slide and awaits expert approval.",
  },
  items,
  edges: GIRKAR_EDGES,
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
        "The deck's natural system without the gadgets: the opening table, natural responses and rebids, competition, leads and carding. Includes the Floor.",
      includes: "floor",
      tags: ["core"],
    },
    {
      key: "conventions",
      name: "Conventions",
      description:
        "The deck's toggleable gadgets: Stayman, Jacoby transfers, Jacoby 2NT, Drury, Michaels, Unusual NT, support doubles, Lebensohl, Roman keycards, fourth-suit forcing.",
      tags: ["conventions"],
    },
    {
      key: "full",
      name: "Full teaching deck",
      description:
        "Everything the deck teaches — the complete system. Includes Core (and through it the Floor).",
      includes: "core",
      tags: ["conventions"],
      intendedComplete: true,
    },
  ],
};
