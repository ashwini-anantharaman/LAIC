// LibraryService — the component's one behavioral surface. Every consumer
// (web pages, mobile surfaces, pickers, external endpoints) goes through it:
// it enforces the access policy, stamps scope on writes, and owns
// copy-with-provenance — the universal sharing primitive.

import {
  canPerform,
  LibraryAccessError,
  type LibraryAccessPolicy,
  type LibraryOperation,
} from "./access";
import type {
  ContentKindSpec,
  LibraryBackend,
  LibraryItem,
  LibraryOrigin,
  LibraryPrincipal,
  ProvenanceRef,
  ScopeLevel,
} from "./types";

export interface LibraryServiceConfig<C> {
  backend: LibraryBackend<C>;
  policy: LibraryAccessPolicy;
  /** Registered content kinds. Unknown kinds are rejected on create/copy. */
  kinds: readonly ContentKindSpec[];
  newId: () => string;
  now?: () => string;
}

/** A create request: the envelope the CALLER controls. Scope is derived. */
export interface LibraryDraft<C> {
  kind: string;
  name: string;
  notes?: string;
  tags?: string[];
  origin: LibraryOrigin;
  content: C;
}

export class LibraryService<C = unknown> {
  private readonly kindIds: Set<string>;

  constructor(private readonly cfg: LibraryServiceConfig<C>) {
    this.kindIds = new Set(cfg.kinds.map((k) => k.id));
  }

  private nowIso(): string {
    return (this.cfg.now ?? (() => new Date().toISOString()))();
  }

  private require(
    principal: LibraryPrincipal,
    operation: LibraryOperation,
    target: { level: ScopeLevel; ownerId?: string },
  ): void {
    if (!canPerform(this.cfg.policy, principal, operation, target)) {
      throw new LibraryAccessError(operation, target.level);
    }
  }

  can(
    principal: LibraryPrincipal,
    operation: LibraryOperation,
    target: { level: ScopeLevel; ownerId?: string },
  ): boolean {
    return canPerform(this.cfg.policy, principal, operation, target);
  }

  private validateKind(kind: string, content: unknown): void {
    if (!this.kindIds.has(kind)) throw new Error(`Unknown library kind "${kind}"`);
    const spec = this.cfg.kinds.find((k) => k.id === kind);
    const problem = spec?.validate?.(content);
    if (problem) throw new Error(problem);
  }

  /**
   * List an instance the principal can see. `view` names the instance:
   * "mine" (their personal shelf), "program", or "org" — always partitioned
   * to the principal's org/program.
   */
  async list(
    principal: LibraryPrincipal,
    query: { view: "mine" | "program" | "org"; kind?: string },
  ): Promise<LibraryItem<C>[]> {
    const level: ScopeLevel = query.view === "mine" ? "user" : query.view;
    const ownerId = query.view === "mine" ? principal.userId : undefined;
    this.require(principal, "view", { level, ownerId });
    return this.cfg.backend.list({
      kind: query.kind,
      scopeLevel: level,
      ownerId,
      orgId: principal.orgId,
      programId: principal.programId,
    });
  }

  /** Get one item, enforcing view on the instance it lives in. */
  async get(principal: LibraryPrincipal, id: string): Promise<LibraryItem<C> | null> {
    const item = await this.cfg.backend.get(id);
    if (!item) return null;
    this.require(principal, "view", {
      level: item.scope.level,
      ownerId: item.scope.ownerId,
    });
    return item;
  }

  /** Author a new item into an instance the principal can create in. */
  async create(
    principal: LibraryPrincipal,
    draft: LibraryDraft<C>,
    scopeLevel: ScopeLevel,
  ): Promise<LibraryItem<C>> {
    this.require(principal, "create", {
      level: scopeLevel,
      ownerId: scopeLevel === "user" ? principal.userId : undefined,
    });
    this.validateKind(draft.kind, draft.content);
    const item: LibraryItem<C> = {
      id: this.cfg.newId(),
      kind: draft.kind,
      name: draft.name,
      ...(draft.notes ? { notes: draft.notes } : {}),
      tags: draft.tags ?? [],
      origin: draft.origin,
      createdBy: principal.userId,
      createdAt: this.nowIso(),
      scope: {
        level: scopeLevel,
        ...(scopeLevel === "user" ? { ownerId: principal.userId } : {}),
        ...(principal.orgId ? { orgId: principal.orgId } : {}),
        ...(principal.programId ? { programId: principal.programId } : {}),
      },
      content: draft.content,
    };
    await this.cfg.backend.put(item);
    return item;
  }

  /**
   * Edit an item in place. The caller controls name/notes/tags/content —
   * the envelope (identity, scope, provenance, authorship) never changes
   * through an edit. Passing an empty string for `notes` clears it.
   */
  async update(
    principal: LibraryPrincipal,
    id: string,
    patch: { name?: string; notes?: string; tags?: string[]; content?: C },
  ): Promise<LibraryItem<C>> {
    const item = await this.cfg.backend.get(id);
    if (!item) throw new Error("Library item no longer exists");
    this.require(principal, "edit", {
      level: item.scope.level,
      ownerId: item.scope.ownerId,
    });
    if (patch.content !== undefined) this.validateKind(item.kind, patch.content);
    const next: LibraryItem<C> = {
      ...item,
      ...(patch.name ? { name: patch.name } : {}),
      tags: patch.tags ?? item.tags,
      content: patch.content !== undefined ? patch.content : item.content,
    };
    if (patch.notes !== undefined) {
      if (patch.notes) next.notes = patch.notes;
      else delete next.notes;
    }
    await this.cfg.backend.put(next);
    return next;
  }

  async delete(principal: LibraryPrincipal, id: string): Promise<void> {
    const item = await this.cfg.backend.get(id);
    if (!item) return;
    this.require(principal, "delete", {
      level: item.scope.level,
      ownerId: item.scope.ownerId,
    });
    await this.cfg.backend.delete(id);
  }

  /**
   * Copy-with-provenance — the ONLY way content crosses instances. Enforces
   * `copy` on the source instance and stamps the copy with a ProvenanceRef.
   * Idempotent per (source, target owner, provenance kind): an existing copy
   * is returned instead of duplicating the target's shelf.
   */
  async copyTo(
    principal: LibraryPrincipal,
    sourceId: string,
    target: {
      /** Receiving user for user-level targets (e.g. the assignee). */
      ownerId?: string;
      scopeLevel: ScopeLevel;
      provenance: ProvenanceRef["kind"];
    },
  ): Promise<LibraryItem<C>> {
    const source = await this.cfg.backend.get(sourceId);
    if (!source) throw new Error("Source library item no longer exists");
    this.require(principal, "copy", {
      level: source.scope.level,
      ownerId: source.scope.ownerId,
    });
    if (target.scopeLevel === "user" && target.ownerId !== principal.userId) {
      // Writing into someone ELSE's instance is the assign surface.
      this.require(principal, "assign", { level: "user", ownerId: target.ownerId });
    } else {
      this.require(principal, "create", {
        level: target.scopeLevel,
        ownerId: target.ownerId,
      });
    }

    const existing = await this.cfg.backend.list({
      scopeLevel: target.scopeLevel,
      ownerId: target.ownerId,
      orgId: principal.orgId,
      programId: principal.programId,
    });
    const prior = existing.find(
      (e) => e.provenance?.kind === target.provenance && e.provenance.entryId === sourceId,
    );
    if (prior) return prior;

    const copy: LibraryItem<C> = {
      ...source,
      id: this.cfg.newId(),
      createdBy: target.ownerId ?? principal.userId,
      createdAt: this.nowIso(),
      scope: {
        level: target.scopeLevel,
        ...(target.ownerId ? { ownerId: target.ownerId } : {}),
        ...(principal.orgId ? { orgId: principal.orgId } : {}),
        ...(principal.programId ? { programId: principal.programId } : {}),
      },
      provenance: {
        kind: target.provenance,
        entryId: sourceId,
        ...(principal.orgId ? { orgId: principal.orgId } : {}),
        ...(principal.programId ? { programId: principal.programId } : {}),
      },
    };
    await this.cfg.backend.put(copy);
    return copy;
  }
}
