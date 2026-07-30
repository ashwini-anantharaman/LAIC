// KB component — core shapes. A knowledge base is a versioned collection of
// items whose payloads are opaque to this shell: the domain (a card game's
// bidding rules, a language course's grammar…) lives entirely in the host's
// item content. What the shell owns is the ENVELOPE: which instance a KB
// belongs to, who may operate on it, and where a derived KB came from.

/** Which instance a KB lives in — mirrors library-core's model. */
export type ScopeLevel = "user" | "program" | "org";

/** The instance a KB belongs to. `ownerId` is set for user-level scopes.
 *  Hosts with legacy unscoped KBs map them to `program` (shared, curated). */
export interface KbScope {
  level: ScopeLevel;
  ownerId?: string;
  orgId?: string;
  programId?: string;
}

/**
 * Derivation lineage: a derived (e.g. master → limited) KB records the KB and
 * release it branched from. The lockfile/versioning mechanics stay with the
 * host — the shell only needs the lineage to reason about access and upgrade
 * signals.
 */
export interface KbDerivationRef {
  fromKbId: string;
  fromVersionId?: string;
}

/** The envelope the component reasons about — never the domain payload. */
export interface KbMeta {
  id: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  scope: KbScope;
  derivation?: KbDerivationRef;
}

/**
 * The resolved caller, mapped from the host platform's context. Structurally
 * identical to library-core's principal so hosts can reuse one mapping.
 */
export interface KbPrincipal {
  userId: string;
  orgId?: string;
  programId?: string;
  /** Platform admins pass every policy rule. */
  isAdmin?: boolean;
  /** Host-platform role ids. */
  roles: readonly string[];
  /** Access Catalogue capability ids held via role bindings. */
  capabilities: readonly string[];
}

/**
 * Meta-level storage port. Hosts adapt their existing KB stores to this —
 * the component owns access/scoping semantics, never persistence, and never
 * the versioning mechanics (those stay in the host's KB service).
 */
export interface KbMetaBackend {
  getMeta(kbId: string): Promise<KbMeta | null>;
  /** List, matching every provided filter field exactly. */
  listMeta(query: {
    scopeLevel?: ScopeLevel;
    ownerId?: string;
    orgId?: string;
    programId?: string;
  }): Promise<KbMeta[]>;
}
