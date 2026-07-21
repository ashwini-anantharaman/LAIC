// @bridge/sayc-template — the curated SAYC system as data.
//
// Claude-authored (cited to src_claude, the platform's named source for
// authored judgments), machine-tested (see the scenario/simulation suites),
// and installed as ORDINARY knowledge items: everything lands `reviewed`,
// stays fully editable and versionable in the workspace, and every
// convention carries an enable toggle so fellows can reshape the system per
// player. @bridge/kb stays content-free; the content lives here.

import type { SetTag, TemplateEdge, TemplateItem } from "./dsl";
import { COMPETITIVE } from "./chapters/competitive";
import { FLOOR } from "./chapters/floor";
import { LEADS_SIGNALS_PLAY } from "./chapters/leadsSignalsPlay";
import { NT_RESPONSES } from "./chapters/ntResponses";
import { OPENINGS } from "./chapters/openings";
import { PROSE } from "./chapters/prose";
import { REBIDS } from "./chapters/rebids";
import { SLAM, SLAM_EDGES } from "./chapters/slam";
import { SUIT_RESPONSES } from "./chapters/suitResponses";

export type { SetTag, TemplateEdge, TemplateItem } from "./dsl";

export interface TemplatePack {
  key: string;
  name: string;
  description: string;
  /** Local key of the set this one Includes (extends). */
  includes?: string;
  /** Which SetTags select this pack's own (declared) items. */
  tags: SetTag[];
  intendedComplete?: boolean;
}

export interface SaycTemplate {
  kb: { name: string; systemLabel: string; description: string };
  items: TemplateItem[];
  edges: TemplateEdge[];
  packs: TemplatePack[];
}

const CHAPTERS: { name: string; items: TemplateItem[] }[] = [
  { name: "openings", items: OPENINGS },
  { name: "nt-responses", items: NT_RESPONSES },
  { name: "suit-responses", items: SUIT_RESPONSES },
  { name: "rebids", items: REBIDS },
  { name: "competitive", items: COMPETITIVE },
  { name: "slam", items: SLAM },
  { name: "leads-signals-play", items: LEADS_SIGNALS_PLAY },
  { name: "judgment", items: PROSE },
  { name: "floor", items: FLOOR },
];

/** Chapter of an item, for citation anchors ("curated SAYC · openings"). */
export function chapterOf(itemKey: string): string {
  for (const { name, items } of CHAPTERS) {
    if (items.some((i) => i.key === itemKey)) return name;
  }
  return "sayc";
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

export const SAYC_TEMPLATE: SaycTemplate = {
  kb: {
    name: "SAYC (curated)",
    systemLabel: "SAYC",
    description:
      "The complete Standard American Yellow Card, authored and machine-tested. Every convention is toggleable; every item is editable and awaits expert approval.",
  },
  items,
  edges: SLAM_EDGES,
  packs: [
    {
      key: "floor",
      name: "Floor",
      description: "The three phase fallbacks — the minimum complete player.",
      tags: ["floor"],
      intendedComplete: true,
    },
    {
      key: "core",
      name: "Core natural bidding",
      description:
        "Natural SAYC without the gadgets: openings, responses, rebids, competition, leads, signals, and card play. Includes the Floor.",
      includes: "floor",
      tags: ["core"],
    },
    {
      key: "conventions",
      name: "Conventions",
      description:
        "The toggleable gadgets: Stayman, transfers, Jacoby 2NT, doubles, Michaels, Blackwood and friends. A browsing set — carry it with Core.",
      tags: ["conventions"],
    },
    {
      key: "full",
      name: "Full SAYC",
      description: "Everything — the complete curated system. Includes Core (and through it the Floor).",
      includes: "core",
      tags: ["conventions"],
      intendedComplete: true,
    },
  ],
};
