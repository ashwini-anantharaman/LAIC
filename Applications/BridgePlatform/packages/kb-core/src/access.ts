// KB access policy — the component's access catalogue surface.
//
// Same model as library-core: operations × scope levels, granted via role
// ids, capability ids, ownership, or everyone; deny by default; rules OR
// together; platform admins always pass. The KB operations map onto the
// knowledge lifecycle (view → author → review → approve → version → derive)
// so a program can hand a custom role exactly one slice of it from the
// Access Catalogue editor — access is configuration, not code.

import type { KbPrincipal, KbScope, ScopeLevel } from "./types";

/** Everything a caller can do to a KB instance. */
export type KbOperation =
  | "view" // browse KBs, items, versions
  | "create" // create a new KB in an instance
  | "edit" // author/edit items, edges, packs
  | "review" // review suggestions/changes
  | "approve" // approve items/versions
  | "version" // commit item versions, publish/activate releases
  | "derive" // derive a limited KB from a master
  | "delete" // delete a KB
  | "publish" // package a KB for partners (Phase C)
  | "install"; // install a partner-published KB

/** Capability ids the component contributes to a host's Access Catalogue. */
export const KB_CAPABILITIES = {
  view: "kb.view",
  author: "kb.author",
  review: "kb.review",
  approve: "kb.approve",
  version: "kb.version",
  derive: "kb.derive",
  publish: "kb.publish",
  install: "kb.install",
} as const;

export interface KbAccessRule {
  operation: KbOperation;
  /** Scope level of the TARGET instance the operation acts on. */
  scopeLevel: ScopeLevel;
  ownerOnly?: boolean;
  anyRole?: readonly string[];
  anyCapability?: readonly string[];
  everyone?: boolean;
}

export interface KbAccessPolicy {
  rules: readonly KbAccessRule[];
}

/** Deny-by-default evaluation. Admins pass everything. */
export function canPerformKb(
  policy: KbAccessPolicy,
  principal: KbPrincipal,
  operation: KbOperation,
  target: Pick<KbScope, "level" | "ownerId">,
): boolean {
  if (principal.isAdmin) return true;
  const roles = new Set(principal.roles);
  const caps = new Set(principal.capabilities);
  for (const rule of policy.rules) {
    if (rule.operation !== operation || rule.scopeLevel !== target.level) continue;
    if (rule.everyone) return true;
    if (rule.ownerOnly && target.ownerId && target.ownerId === principal.userId) return true;
    if (rule.anyRole?.some((r) => roles.has(r))) return true;
    if (rule.anyCapability?.some((c) => caps.has(c))) return true;
  }
  return false;
}

export class KbAccessError extends Error {
  constructor(
    public readonly operation: KbOperation,
    public readonly scopeLevel: ScopeLevel,
  ) {
    super(`KB access denied: ${operation} on ${scopeLevel} instance`);
    this.name = "KbAccessError";
  }
}

/**
 * The default policy, parameterized by host role ids. Reproduces the
 * conventional model: program staff hold the whole knowledge lifecycle on
 * the program instance; every capability offers the configurable path on
 * top. User/org instances and partner packaging start capability-only.
 */
export function defaultKbPolicy(hostRoles: {
  /** Roles that hold the full knowledge lifecycle on the program instance. */
  programStaff: readonly string[];
}): KbAccessPolicy {
  const C = KB_CAPABILITIES;
  const staff = hostRoles.programStaff;
  const programRule = (
    operation: KbOperation,
    anyCapability: readonly string[],
  ): KbAccessRule => ({ operation, scopeLevel: "program", anyRole: staff, anyCapability });
  return {
    rules: [
      programRule("view", [C.view]),
      programRule("create", [C.author]),
      programRule("edit", [C.author]),
      programRule("review", [C.review]),
      programRule("approve", [C.approve]),
      programRule("version", [C.version]),
      programRule("derive", [C.derive]),
      programRule("delete", [C.author]),

      // Personal KB instances (future: a learner's own practice KB).
      { operation: "view", scopeLevel: "user", ownerOnly: true },
      { operation: "create", scopeLevel: "user", anyCapability: [C.author] },
      { operation: "edit", scopeLevel: "user", ownerOnly: true },
      { operation: "delete", scopeLevel: "user", ownerOnly: true },

      // Org instances + partner packaging: capability-gated only.
      { operation: "view", scopeLevel: "org", anyCapability: [C.view] },
      { operation: "publish", scopeLevel: "program", anyCapability: [C.publish] },
      { operation: "publish", scopeLevel: "org", anyCapability: [C.publish] },
      { operation: "install", scopeLevel: "program", anyCapability: [C.install] },
      { operation: "install", scopeLevel: "org", anyCapability: [C.install] },
    ],
  };
}

/** Catalogue fragment hosts merge into their Access Catalogue defaults. */
export function kbCatalogueFragment(): {
  group: { id: string; label: string; description: string; order: number };
  capabilities: { id: string; label: string; description: string; group: string }[];
} {
  const group = {
    id: "kb",
    label: "Knowledge Bases",
    description: "Scoped knowledge-base component: lifecycle capabilities (view → author → review → approve → version → derive)",
    order: 9,
  };
  const cap = (id: string, label: string) => ({ id, label, description: label, group: group.id });
  return {
    group,
    capabilities: [
      cap(KB_CAPABILITIES.view, "View knowledge bases and their versions"),
      cap(KB_CAPABILITIES.author, "Create and edit knowledge-base content"),
      cap(KB_CAPABILITIES.review, "Review knowledge-base changes and suggestions"),
      cap(KB_CAPABILITIES.approve, "Approve knowledge-base items and versions"),
      cap(KB_CAPABILITIES.version, "Commit item versions and publish releases"),
      cap(KB_CAPABILITIES.derive, "Derive limited knowledge bases from a master"),
      cap(KB_CAPABILITIES.publish, "Publish knowledge-base packages for partners"),
      cap(KB_CAPABILITIES.install, "Install published knowledge-base packages"),
    ],
  };
}
