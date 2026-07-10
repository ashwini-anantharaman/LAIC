import { describe, expect, it } from "vitest";

import {
  canEditStage,
  categoryRoleWord,
  isOfferingAdmin,
  isSubtreePath,
  membershipCoversStage,
  resolveEffectiveAccess,
  roleLabel,
  visibleStageIds,
  type Membership,
  type StageNode,
} from "../src/permissions";

function stage(overrides: Partial<StageNode> = {}): StageNode {
  return {
    id: "s1",
    org_id: "org1",
    parent_id: null,
    stage_type: "national",
    name: "National",
    depth: 0,
    path: "/national-abc12345",
    ...overrides,
  };
}

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: "m1",
    org_id: "org1",
    profile_id: "p1",
    role: "administrator",
    stage_node_id: "s1",
    access: "view",
    stage_path: "/national-abc12345",
    ...overrides,
  };
}

describe("isSubtreePath", () => {
  it("root path covers everything", () => {
    expect(isSubtreePath("/", "/a/b")).toBe(true);
    expect(isSubtreePath("", "/a/b")).toBe(true);
  });

  it("exact match is covered", () => {
    expect(isSubtreePath("/a", "/a")).toBe(true);
  });

  it("descendant with slash boundary is covered; sibling prefix is not", () => {
    expect(isSubtreePath("/a", "/a/b")).toBe(true);
    expect(isSubtreePath("/a", "/ab")).toBe(false);
  });
});

describe("membershipCoversStage", () => {
  it("org-wide owner (null stage) covers all stages", () => {
    const m = membership({ role: "owner", stage_node_id: null, stage_path: null });
    expect(membershipCoversStage(m, stage({ path: "/x/y/z" }))).toBe(true);
  });

  it("non-owner with null stage covers nothing", () => {
    const m = membership({ stage_node_id: null, stage_path: null });
    expect(membershipCoversStage(m, stage())).toBe(false);
  });

  it("falls back to id equality when stage_path missing", () => {
    const m = membership({ stage_path: null });
    expect(membershipCoversStage(m, stage({ id: "s1" }))).toBe(true);
    expect(membershipCoversStage(m, stage({ id: "s2" }))).toBe(false);
  });

  it("covers subtree via path prefix", () => {
    const m = membership({ stage_path: "/national-abc12345" });
    expect(membershipCoversStage(m, stage({ id: "child", path: "/national-abc12345/state-def" }))).toBe(true);
    expect(membershipCoversStage(m, stage({ id: "other", path: "/national-zzz" }))).toBe(false);
  });
});

describe("visibleStageIds / canEditStage", () => {
  const stages = [
    stage({ id: "root", path: "/national-1" }),
    stage({ id: "child", path: "/national-1/state-2", stage_type: "state" }),
    stage({ id: "other", path: "/national-9" }),
  ];

  it("scoped member sees only their subtree", () => {
    const ms = [membership({ stage_node_id: "root", stage_path: "/national-1" })];
    expect(visibleStageIds(ms, stages, "org1")).toEqual(new Set(["root", "child"]));
  });

  it("edit requires owner role or edit access", () => {
    const viewer = [membership({ access: "view", stage_path: "/national-1" })];
    const editor = [membership({ access: "edit", stage_path: "/national-1" })];
    const owner = [membership({ role: "owner", stage_node_id: null, stage_path: null, access: "view" })];
    expect(canEditStage(viewer, stages[0])).toBe(false);
    expect(canEditStage(editor, stages[0])).toBe(true);
    expect(canEditStage(owner, stages[2])).toBe(true);
  });
});

describe("resolveEffectiveAccess", () => {
  it("per_level uses the override for the stage type", () => {
    expect(resolveEffectiveAccess("per_level", { state: "edit" }, "state", "view")).toBe("edit");
    expect(resolveEffectiveAccess("per_level", {}, "state", "view")).toBe("view");
  });

  it("fixed defaults win; unknown falls back to membership access", () => {
    expect(resolveEffectiveAccess("edit", {}, "chapter", "view")).toBe("edit");
    expect(resolveEffectiveAccess("bogus", {}, "chapter", "edit")).toBe("edit");
  });
});

describe("categoryRoleWord / roleLabel", () => {
  it("derives Coach/Player for game, Teacher/Student otherwise", () => {
    expect(categoryRoleWord("instructor", "game")).toBe("Coach");
    expect(categoryRoleWord("instructor", "edu")).toBe("Teacher");
    expect(categoryRoleWord("learner", "game")).toBe("Player");
    expect(categoryRoleWord("learner", null)).toBe("Student");
    expect(categoryRoleWord("owner", null)).toBe("Owner");
    expect(categoryRoleWord("mystery", null)).toBe("Member");
  });

  it("prefers explicit program labels and prefixes stage type", () => {
    const stages = [stage({ id: "s1", stage_type: "chapter" })];
    const ms = [membership({ role: "instructor", program_id: "prog1" })];
    const programs = [{ id: "prog1", category: "game", instructor_label: "Mentor" }];
    expect(roleLabel(ms, "org1", stages, programs)).toBe("Chapter Mentor");
    expect(roleLabel(ms, "org1", stages, [{ id: "prog1", category: "game" }])).toBe(
      "Chapter Coach",
    );
  });

  it("owner membership takes precedence and Member when no membership", () => {
    const ms = [
      membership({ id: "m2", role: "administrator", stage_node_id: null, stage_path: null }),
      membership({ id: "m3", role: "owner", stage_node_id: null, stage_path: null }),
    ];
    expect(roleLabel(ms, "org1", [])).toBe("Owner");
    expect(roleLabel(ms, "other-org", [])).toBe("Member");
  });
});

describe("isOfferingAdmin", () => {
  it("org-wide owner/administrator with null stage qualifies", () => {
    expect(isOfferingAdmin([membership({ role: "owner", stage_node_id: null })], "org1")).toBe(true);
    expect(
      isOfferingAdmin([membership({ role: "administrator", stage_node_id: null })], "org1"),
    ).toBe(true);
  });

  it("stage-scoped administrator does not qualify org-wide", () => {
    expect(isOfferingAdmin([membership({ role: "administrator" })], "org1")).toBe(false);
  });

  it("program-scoped administrator/instructor qualifies for that program", () => {
    const ms = [membership({ role: "instructor", program_id: "prog1" })];
    expect(isOfferingAdmin(ms, "org1", "prog1")).toBe(true);
    expect(isOfferingAdmin(ms, "org1", "prog2")).toBe(false);
    expect(isOfferingAdmin(ms, "org1")).toBe(false);
  });

  it("wrong org never qualifies", () => {
    expect(isOfferingAdmin([membership({ role: "owner", stage_node_id: null })], "org2")).toBe(
      false,
    );
  });
});
