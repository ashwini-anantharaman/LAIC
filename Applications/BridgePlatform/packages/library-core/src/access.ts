// Library access policy — the component's own access catalogue surface.
//
// Model (mirrors the platform Access Catalogue): operations × scope levels,
// granted to principals via role ids, capability ids, ownership, or everyone.
// Deny by default; rules OR together; platform admins always pass. Hosts get
// a DEFAULT policy that reproduces conventional behavior and can replace any
// of it from catalogue configuration — access is configuration, not code.

import type { LibraryItemScope, LibraryPrincipal, ScopeLevel } from "./types";

/** Everything a caller can do to a library instance or item. */
export type LibraryOperation =
  | "view" // read items in an instance
  | "create" // author a new item into an instance
  | "edit" // modify an existing item
  | "delete" // remove an item
  | "copy" // copy an item toward another instance (assign/derive)
  | "assign" // copy specifically into a person's instance with tracking
  | "embed" // snapshot into an external document (e.g. a lesson)
  | "publish" // package program/org content for partners
  | "install"; // install a published package into this instance

/**
 * Capability ids the component contributes to a host's Access Catalogue.
 * Stable, domain-free ids — the same ids work in any host's catalogue.
 */
export const LIBRARY_CAPABILITIES = {
  /** Authoring in one's OWN instance. Configurable like everything else:
   *  hosts grant it broadly by default, and revoking it makes a role
   *  play-only (receive content, never create). */
  authorOwn: "library.author.own",
  viewProgram: "library.view.program",
  viewOrg: "library.view.org",
  authorProgram: "library.author.program",
  authorOrg: "library.author.org",
  assign: "library.assign",
  embed: "library.embed",
  publish: "library.publish",
  install: "library.install",
} as const;

/** One grant: who may perform `operation` against a `scopeLevel` instance. */
export interface LibraryAccessRule {
  operation: LibraryOperation;
  /** Scope level of the TARGET instance the operation acts on. */
  scopeLevel: ScopeLevel;
  /** Grant when the caller owns the (user-level) target instance. */
  ownerOnly?: boolean;
  /** Grant when the caller holds ANY of these host role ids. */
  anyRole?: readonly string[];
  /** Grant when the caller holds ANY of these capability ids. */
  anyCapability?: readonly string[];
  /** Grant every signed-in principal. */
  everyone?: boolean;
}

export interface LibraryAccessPolicy {
  rules: readonly LibraryAccessRule[];
}

/** Deny-by-default evaluation. Admins pass everything. */
export function canPerform(
  policy: LibraryAccessPolicy,
  principal: LibraryPrincipal,
  operation: LibraryOperation,
  target: Pick<LibraryItemScope, "level" | "ownerId">,
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

export class LibraryAccessError extends Error {
  constructor(
    public readonly operation: LibraryOperation,
    public readonly scopeLevel: ScopeLevel,
  ) {
    super(`Library access denied: ${operation} on ${scopeLevel} instance`);
    this.name = "LibraryAccessError";
  }
}

/**
 * The default policy, parameterized by host role ids so the shell stays
 * domain-free. Reproduces conventional behavior: everyone owns a personal
 * instance; staff author shared program content; sharers (coaches) may read
 * the program shelf and copy from it; publish/install stay admin-only until
 * a host grants the capabilities.
 */
export function defaultLibraryPolicy(hostRoles: {
  /** Roles that may VIEW the program instance (e.g. coach + staff). */
  programViewers: readonly string[];
  /** Roles that may AUTHOR into the program instance (staff). */
  programAuthors: readonly string[];
  /** Roles that may copy/assign items into other people's instances. */
  sharers: readonly string[];
  /**
   * Personal-shelf authoring. Default: everyone (a personal library is a
   * sandbox), so nothing changes until an admin narrows it. Pass explicit
   * roles to make creation a privilege — a role WITHOUT it, and without the
   * `library.author.own` capability, becomes play-only.
   */
  ownAuthors?: readonly string[];
}): LibraryAccessPolicy {
  const C = LIBRARY_CAPABILITIES;
  const ownAuthorRule: LibraryAccessRule = hostRoles.ownAuthors
    ? {
        operation: "create",
        scopeLevel: "user",
        anyRole: hostRoles.ownAuthors,
        anyCapability: [C.authorOwn],
      }
    : { operation: "create", scopeLevel: "user", everyone: true };
  return {
    rules: [
      // Personal instance: the owner reads/edits their own shelf; whether they
      // may CREATE there is configurable (see ownAuthorRule).
      { operation: "view", scopeLevel: "user", ownerOnly: true },
      ownAuthorRule,
      { operation: "edit", scopeLevel: "user", ownerOnly: true },
      { operation: "delete", scopeLevel: "user", ownerOnly: true },

      // Program instance: shared shelf — viewers read, authors write.
      {
        operation: "view",
        scopeLevel: "program",
        anyRole: hostRoles.programViewers,
        anyCapability: [C.viewProgram],
      },
      {
        operation: "create",
        scopeLevel: "program",
        anyRole: hostRoles.programAuthors,
        anyCapability: [C.authorProgram],
      },
      {
        operation: "edit",
        scopeLevel: "program",
        anyRole: hostRoles.programAuthors,
        anyCapability: [C.authorProgram],
      },
      {
        operation: "delete",
        scopeLevel: "program",
        anyRole: hostRoles.programAuthors,
        anyCapability: [C.authorProgram],
      },

      // Org instance: capability-gated only (no legacy role behavior yet).
      { operation: "view", scopeLevel: "org", anyCapability: [C.viewOrg] },
      { operation: "create", scopeLevel: "org", anyCapability: [C.authorOrg] },

      // Sharing: copying/assigning reads the source (program or a personal
      // shelf the sharer can already view) and writes the target's instance.
      {
        operation: "copy",
        scopeLevel: "program",
        anyRole: hostRoles.sharers,
        anyCapability: [C.assign],
      },
      {
        operation: "copy",
        scopeLevel: "user",
        ownerOnly: true,
        anyRole: hostRoles.sharers,
        anyCapability: [C.assign],
      },
      {
        operation: "assign",
        scopeLevel: "user",
        anyRole: hostRoles.sharers,
        anyCapability: [C.assign],
      },

      // External embedding (e.g. lessons): program authors, or the capability.
      {
        operation: "embed",
        scopeLevel: "program",
        anyRole: hostRoles.programAuthors,
        anyCapability: [C.embed],
      },

      // Partner packaging (Phase C): capability-gated, no default holders.
      { operation: "publish", scopeLevel: "program", anyCapability: [C.publish] },
      { operation: "publish", scopeLevel: "org", anyCapability: [C.publish] },
      { operation: "install", scopeLevel: "program", anyCapability: [C.install] },
      { operation: "install", scopeLevel: "org", anyCapability: [C.install] },
    ],
  };
}

/**
 * Catalogue fragment hosts merge into their Access Catalogue defaults — one
 * group + the component's capabilities, in the platform document shape
 * (id/label/description/group). Keeping it here means every host publishes
 * the SAME ids and the catalogue editor can grant them to custom roles.
 */
export function libraryCatalogueFragment(): {
  group: { id: string; label: string; description: string; order: number };
  capabilities: { id: string; label: string; description: string; group: string }[];
} {
  const group = {
    id: "library",
    label: "Library",
    description: "Scoped content library: personal, program and org instances",
    order: 8,
  };
  const cap = (id: string, label: string) => ({ id, label, description: label, group: group.id });
  return {
    group,
    capabilities: [
      cap(LIBRARY_CAPABILITIES.authorOwn, "Create items in your own library"),
      cap(LIBRARY_CAPABILITIES.viewProgram, "View the program library instance"),
      cap(LIBRARY_CAPABILITIES.viewOrg, "View the organization library instance"),
      cap(LIBRARY_CAPABILITIES.authorProgram, "Author into the program library instance"),
      cap(LIBRARY_CAPABILITIES.authorOrg, "Author into the organization library instance"),
      cap(LIBRARY_CAPABILITIES.assign, "Assign/copy library items to people"),
      cap(LIBRARY_CAPABILITIES.embed, "Embed library items into external documents"),
      cap(LIBRARY_CAPABILITIES.publish, "Publish library packages for partners"),
      cap(LIBRARY_CAPABILITIES.install, "Install published library packages"),
    ],
  };
}
