// Hand-authored TEST rule package (execution plan Phase 2 task 6): exercises
// the interpreter end to end — gates, auction patterns, hand predicates,
// action templates, provenance. This is a dev fixture (status "review", fake
// provenance ids); it is NOT bridge content. Real content arrives in Phase 3
// as Beginner Natural v0 through the knowledge pipeline.

import type { Setting } from "@bridge/config";
import type { BridgeRulePackage, RuleProvenance } from "../rules/schema";

// HONEST LABELING: these ids resolve to nothing and nothing was reviewed —
// so the status is "needs_review", never "approved". This package can
// therefore NEVER pass the publish gate (validatePackage blocks non-approved
// entries in published packages), which is exactly right for a dev fixture.
const prov = (slug: string): RuleProvenance => ({
  knowledgeItemIds: [`ki_test_${slug}`],
  sourceIds: ["src_test_fixture_not_a_real_source"],
  reviewStatus: "needs_review",
});

const SETTINGS: Setting[] = [
  {
    key: "test_open_light",
    label: "Open light (10–11 HCP)",
    control: "toggle",
    default: false,
    module: "test_openings",
    exclusive_group: null,
    depends_on: null,
    skill_level: "Beginner",
    coach_supported: true,
    binds_to: "convention_rules",
    aliases: [],
    description: "Test fixture: allow openings on 10–11 HCP hands.",
    origin: "TEST",
  },
];

export const TEST_PACKAGE: BridgeRulePackage = {
  packageId: "bridge_test_package",
  systemFamily: "custom",
  version: "0.0.1",
  status: "review",
  settings: SETTINGS,
  bidRules: [
    {
      ruleId: "tp_open_major",
      title: "Open the longest major with 12–21 HCP and a 5-card major",
      priority: 10,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: {
        all: [
          { predicate: "hcpRange", params: { min: 12, max: 21 } },
          { predicate: "longestAmong", params: { among: "majors", min: 5 } },
        ],
      },
      action: { kind: "openLongest", among: "majors", level: 1 },
      provenance: prov("open_major"),
      explanationItemId: "ki_test_open_major",
    },
    {
      ruleId: "tp_open_light",
      title: "Light opening: longest suit with 10–11 HCP (gated)",
      priority: 15,
      settingGates: [{ key: "test_open_light" }],
      auctionContext: { role: "opening" },
      handConditions: { predicate: "hcpRange", params: { min: 10, max: 11 } },
      action: { kind: "openLongest", among: "all", level: 1 },
      provenance: prov("open_light"),
      explanationItemId: "ki_test_open_light",
    },
    {
      ruleId: "tp_open_minor",
      title: "Open the longest minor with 12–21 HCP and no 5-card major",
      priority: 20,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: {
        all: [
          { predicate: "hcpRange", params: { min: 12, max: 21 } },
          { not: { predicate: "longestAmong", params: { among: "majors", min: 5 } } },
        ],
      },
      action: { kind: "openLongest", among: "minors", level: 1 },
      provenance: prov("open_minor"),
      explanationItemId: "ki_test_open_minor",
    },
    {
      ruleId: "tp_pass_weak_opening",
      title: "Pass in opening position with 0–11 HCP",
      priority: 30,
      settingGates: [],
      auctionContext: { role: "opening" },
      handConditions: { predicate: "hcpRange", params: { min: 0, max: 11 } },
      action: { kind: "pass" },
      provenance: prov("pass_weak"),
      explanationItemId: "ki_test_pass_weak",
    },
    {
      ruleId: "tp_single_raise",
      title: "Raise partner's one-level suit opening with 6–9 HCP",
      priority: 10,
      settingGates: [],
      auctionContext: { role: "response", partnerLastBidRegex: "^1[CDHS]$" },
      handConditions: { predicate: "hcpRange", params: { min: 6, max: 9 } },
      action: { kind: "raisePartner", toLevel: 2 },
      provenance: prov("single_raise"),
      explanationItemId: "ki_test_single_raise",
    },
    {
      ruleId: "tp_pass_weak_response",
      title: "Pass partner's opening with 0–5 HCP",
      priority: 20,
      settingGates: [],
      auctionContext: { role: "response" },
      handConditions: { predicate: "hcpRange", params: { min: 0, max: 5 } },
      action: { kind: "pass" },
      provenance: prov("pass_weak_response"),
      explanationItemId: "ki_test_pass_weak_response",
    },
  ],
  playRules: [
    {
      ruleId: "tp_lead_top_longest",
      title: "Lead the top of the longest suit",
      priority: 10,
      settingGates: [],
      when: { role: "lead" },
      action: { kind: "topOfLongestSuit" },
      provenance: prov("lead_top_longest"),
      explanationItemId: "ki_test_lead_top_longest",
    },
    {
      ruleId: "tp_follow_low",
      title: "Follow suit as cheaply as possible",
      priority: 20,
      settingGates: [],
      when: { role: "follow" },
      action: { kind: "lowestFollowing" },
      provenance: prov("follow_low"),
      explanationItemId: "ki_test_follow_low",
    },
  ],
};

/** Resolved values matching TEST_PACKAGE.settings defaults. */
export const TEST_VALUES: Record<string, boolean> = { test_open_light: false };
