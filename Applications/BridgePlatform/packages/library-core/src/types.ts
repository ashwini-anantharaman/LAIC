// Library component — core shapes. The shell is content-agnostic: an item is
// an envelope (identity, scope, provenance, authorship) around an opaque
// `content` payload whose meaning belongs to a registered kind. The bridge
// deal/board/play kinds are ONE plugin; nothing here may name a domain.

/** Which instance an item lives in. Content crosses instances only by copy. */
export type ScopeLevel = "user" | "program" | "org";

/** The instance an item belongs to. `ownerId` is set for user-level scopes. */
export interface LibraryItemScope {
  level: ScopeLevel;
  /** Owning user for `user`-level items. */
  ownerId?: string;
  /** Org partition (every instance lives inside exactly one org). */
  orgId?: string;
  /** Real program uuid partition, when the instance is program-bound. */
  programId?: string;
}

/**
 * Copy provenance: how a copy arrived in its instance. The kinds mirror the
 * sharing surfaces — `assigned` (coach → learner, tracked), `shared` (admin
 * distribution from the program shelf, untracked), `embedded` (snapshot into
 * an external document), `installed` (package install across orgs).
 */
export interface ProvenanceRef {
  kind: "assigned" | "shared" | "embedded" | "installed";
  /** The source item. */
  entryId: string;
  programId?: string;
  orgId?: string;
}

export type LibraryOrigin = "recorded" | "imported" | "authored";

/** The generic item envelope. `C` is the kind-specific content payload. */
export interface LibraryItem<C = unknown> {
  id: string;
  /** Registered content kind id (e.g. a card game's "board"). */
  kind: string;
  name: string;
  notes?: string;
  tags: string[];
  origin: LibraryOrigin;
  createdBy: string;
  createdAt: string;
  scope: LibraryItemScope;
  provenance?: ProvenanceRef;
  content: C;
}

/** A pluggable content kind. Hosts register these; the shell only routes. */
export interface ContentKindSpec {
  id: string;
  label: string;
  description?: string;
  /** Reject invalid payloads at create/copy time. Return an error, or null. */
  validate?: (content: unknown) => string | null;
}

/**
 * The resolved caller, mapped from the host platform's context (for bridge:
 * NexusBridgeContext → principal). The component never talks to an identity
 * provider itself — hosts adapt.
 */
export interface LibraryPrincipal {
  userId: string;
  orgId?: string;
  programId?: string;
  /** Platform admins pass every policy rule. */
  isAdmin?: boolean;
  /** Host-platform role ids (e.g. "bridge_coach"). */
  roles: readonly string[];
  /** Access Catalogue capability ids held via role bindings. */
  capabilities: readonly string[];
}

/**
 * Storage port. Hosts adapt their existing stores to this — the component
 * owns semantics (scoping, provenance, access), never persistence.
 */
export interface LibraryBackend<C = unknown> {
  put(item: LibraryItem<C>): Promise<void>;
  get(id: string): Promise<LibraryItem<C> | null>;
  /** List, newest first, matching every provided filter field exactly. */
  list(query: {
    kind?: string;
    scopeLevel?: ScopeLevel;
    ownerId?: string;
    orgId?: string;
    programId?: string;
  }): Promise<LibraryItem<C>[]>;
  delete(id: string): Promise<void>;
}
