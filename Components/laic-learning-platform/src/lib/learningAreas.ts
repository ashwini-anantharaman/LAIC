/**
 * Access manifest (v2) for the Learning Platform — the checked-in contract the
 * Nexus role builder consumes. It's a hierarchy of grantable NODES; each node
 * maps its "view" and "edit" levels down to the platform's capabilities (the
 * atomic enforcement primitives), and lists the sidebar SURFACES it reveals.
 *
 *   role  = { nodeId: 'view' | 'edit' }           (what an admin authors)
 *   view  = the node's view-capabilities
 *   edit  = view ∪ edit-capabilities (edit implies read)
 *
 * A node WITHOUT an `edit` block is inherently view-only (its edit toggle is
 * disabled). Nesting via `children` gives the tree + cascade. `edit.objectScope`
 * reserves the (deferred) per-object-type restriction from the sent spec.
 *
 * Owned by the platform: adding a screen = adding a surface/node here. Nexus
 * needs no change to render roles against it.
 */
export type AreaLevel = 'view' | 'edit';

export interface Surface { id: string; label: string; requiresEdit?: boolean }
export interface AccessNode {
  id: string;
  label: string;
  hint?: string;
  surfaces: Surface[];
  view?: { capabilities: string[] };
  edit?: { capabilities: string[]; objectScope?: boolean };
  children?: AccessNode[];
}
export interface Capability { id: string; label: string; group: string }
export interface AccessManifest {
  platform: string;
  capabilities: Capability[];
  objectTypes: string[];
  /** Grantable hierarchy the role builder renders. */
  accessTree: AccessNode[];
  /** Surfaces only full admins ever see (never grantable to a custom role). */
  adminSurfaces: Surface[];
}

export const LEARNING_MANIFEST: AccessManifest = {
  platform: 'learning',
  objectTypes: [
    'lesson', 'tutorial', 'quiz', 'flashcard_set', 'concept_card', 'summary',
    'reflection', 'scenario', 'assignment', 'drill', 'video_script',
  ],
  capabilities: [
    { id: 'create_objects', label: 'Create learning objects', group: 'Authoring & sources' },
    { id: 'edit_objects', label: 'Edit & regenerate objects', group: 'Authoring & sources' },
    { id: 'delete_objects', label: 'Delete objects', group: 'Authoring & sources' },
    { id: 'markup_extract', label: 'Mark up sources & extract content', group: 'Authoring & sources' },
    { id: 'manage_sources', label: 'Create & manage source pools', group: 'Authoring & sources' },
    { id: 'use_tools', label: 'Use tools & utilities', group: 'Authoring & sources' },
    { id: 'create_courses', label: 'Create & build courses', group: 'Courses' },
    { id: 'edit_courses', label: 'Edit courses', group: 'Courses' },
    { id: 'reuse_library', label: 'Reuse library objects in courses', group: 'Courses' },
    { id: 'submit_review', label: 'Submit work for review', group: 'Courses' },
    { id: 'comment', label: 'Comment on blocks (leave feedback)', group: 'Review & feedback' },
    { id: 'review_objects', label: 'Approve / request changes — objects', group: 'Review & feedback' },
    { id: 'review_courses', label: 'Approve / request changes — courses', group: 'Review & feedback' },
    { id: 'resolve_comments', label: 'Resolve feedback threads', group: 'Review & feedback' },
    { id: 'publish', label: 'Publish & set audience', group: 'Publishing & governance' },
    { id: 'manage_versions', label: 'Manage versions', group: 'Publishing & governance' },
    { id: 'scope_program', label: 'Promote content to program scope', group: 'Publishing & governance' },
    { id: 'scope_org', label: 'Promote content to organization scope', group: 'Publishing & governance' },
    { id: 'assign_courses', label: 'Assign courses to learners', group: 'Teaching' },
    { id: 'cohort_settings', label: 'Set cohort interaction settings', group: 'Teaching' },
    { id: 'preview_learner', label: 'Use the learner experience', group: 'Teaching' },
    { id: 'repo_read', label: 'Browse the object repository', group: 'Repository & administration' },
    { id: 'repo_write', label: 'Organize repository folders', group: 'Repository & administration' },
    { id: 'manage_people', label: 'Manage people & roles', group: 'Repository & administration' },
  ],
  adminSurfaces: [{ id: 'admin-people', label: 'People' }],
  accessTree: [
    {
      id: 'overview', label: 'Program Overview', hint: 'Program dashboard & activity',
      surfaces: [{ id: 'admin-overview', label: 'Program Overview' }],
      view: { capabilities: ['repo_read'] },
      // view-only: a dashboard has no edit mode.
    },
    {
      id: 'authoring', label: 'Authoring', hint: 'Create objects, sources, and the library',
      surfaces: [
        { id: 'cd-home', label: 'Home' },
        { id: 'cd-create', label: 'Create', requiresEdit: true },
        { id: 'cd-templates', label: 'Template Library', requiresEdit: true },
        { id: 'cd-sources', label: 'Sources', requiresEdit: true },
        { id: 'cd-library', label: 'Object Library' },
        { id: 'cd-submissions', label: 'My Submissions' },
      ],
      view: { capabilities: ['repo_read'] },
      edit: {
        capabilities: ['create_objects', 'edit_objects', 'delete_objects', 'markup_extract',
          'manage_sources', 'use_tools', 'create_courses', 'edit_courses', 'reuse_library', 'submit_review'],
        objectScope: true,
      },
      children: [
        { id: 'authoring.analytics', label: 'Author Analytics', hint: 'Authoring metrics',
          surfaces: [{ id: 'cd-analytics', label: 'Author Analytics' }],
          view: { capabilities: ['repo_read'] } },
      ],
    },
    {
      id: 'reviews', label: 'Reviews', hint: 'Review objects and courses',
      surfaces: [],
      view: { capabilities: ['repo_read', 'comment'] },
      edit: { capabilities: ['review_objects', 'review_courses', 'resolve_comments', 'comment'] },
      children: [
        { id: 'reviews.objects', label: 'Object Reviews', surfaces: [{ id: 'or-reviews', label: 'Object Reviews' }],
          view: { capabilities: ['repo_read'] }, edit: { capabilities: ['review_objects', 'comment', 'resolve_comments'] } },
        { id: 'reviews.courses', label: 'Course Reviews', surfaces: [{ id: 'cr-reviews', label: 'Course Reviews' }],
          view: { capabilities: ['repo_read'] }, edit: { capabilities: ['review_courses', 'comment', 'resolve_comments'] } },
      ],
    },
    {
      id: 'courses', label: 'Courses & Assignments', hint: 'Build and assign courses',
      surfaces: [{ id: 'admin-courses', label: 'Courses & Assignments' }],
      view: { capabilities: ['repo_read'] },
      edit: { capabilities: ['assign_courses', 'publish', 'reuse_library'] },
    },
    {
      id: 'publishing', label: 'Publishing & Governance', hint: 'Versions, publishing, governance',
      surfaces: [
        { id: 'cd-versions', label: 'Versions & Publishing' },
        { id: 'admin-publishing', label: 'Publishing & Governance' },
      ],
      view: { capabilities: ['repo_read'] },
      edit: { capabilities: ['publish', 'manage_versions', 'scope_program', 'scope_org'] },
    },
    {
      id: 'coaching', label: 'Coaching', hint: 'Assign courses, monitor cohorts',
      surfaces: [{ id: 'coach', label: 'Coach' }],
      view: { capabilities: ['preview_learner'] },
      edit: { capabilities: ['assign_courses', 'cohort_settings', 'comment'] },
    },
    {
      id: 'learner', label: 'Learner experience', hint: 'The student view',
      surfaces: [
        { id: 'student-dashboard', label: 'Today' },
        { id: 'student-courses', label: 'My Courses' },
      ],
      view: { capabilities: ['preview_learner'] },
      // view-only.
    },
  ],
};

// ── Derived lookups (built once) ────────────────────────────────────────────
const NODE_BY_ID = new Map<string, AccessNode>();
const PARENT_OF = new Map<string, string | null>();
const SURFACE_TO_NODE = new Map<string, string>();
const ORDERED_SURFACES: Surface[] = [];
(function index(nodes: AccessNode[], parent: string | null) {
  for (const n of nodes) {
    NODE_BY_ID.set(n.id, n);
    PARENT_OF.set(n.id, parent);
    for (const s of n.surfaces) { SURFACE_TO_NODE.set(s.id, n.id); ORDERED_SURFACES.push(s); }
    if (n.children) index(n.children, n.id);
  }
})(LEARNING_MANIFEST.accessTree, null);

export function isEditable(node: AccessNode): boolean {
  return !!node.edit;
}

/** A node's granted level. Explicit only — the builder's cascade writes an
 * entry for every affected node, so there's no inheritance to resolve (which
 * also lets you uncheck a single child under a granted parent). */
export function effectiveLevel(
  perms: Record<string, AreaLevel> | null,
  isAdmin: boolean,
  nodeId: string,
): AreaLevel | 'none' {
  if (isAdmin) return 'edit';
  return perms?.[nodeId] ?? 'none';
}

/** Top-level tabs a role grants (for compact chips on the roles list). */
export function grantedTopAreas(perms: Record<string, AreaLevel> | null): { label: string; level: AreaLevel }[] {
  const out: { label: string; level: AreaLevel }[] = [];
  for (const n of LEARNING_MANIFEST.accessTree) {
    const lvl = perms?.[n.id];
    if (lvl) out.push({ label: n.label, level: lvl });
  }
  return out;
}

/** Sidebar items the person may see: granted tree surfaces, plus admin-only
 * surfaces for admins. Stable tree order. */
export function navItemsForPerms(perms: Record<string, AreaLevel> | null, isAdmin: boolean): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const s of ORDERED_SURFACES) {
    const nodeId = SURFACE_TO_NODE.get(s.id)!;
    const lvl = effectiveLevel(perms, isAdmin, nodeId);
    if (lvl === 'none') continue;
    // Edit-only screens (e.g. Create, Sources) stay hidden for a view grant.
    if (s.requiresEdit && lvl !== 'edit') continue;
    out.push({ id: s.id, label: s.label });
  }
  if (isAdmin) out.push(...LEARNING_MANIFEST.adminSurfaces.map((s) => ({ id: s.id, label: s.label })));
  return out;
}

/** Whether the person may edit (vs only view) the screen (surface). */
export function canEditScreen(screenId: string, perms: Record<string, AreaLevel> | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const nodeId = SURFACE_TO_NODE.get(screenId);
  return !!nodeId && effectiveLevel(perms, isAdmin, nodeId) === 'edit';
}

/** True when the current screen belongs to an editable area the person only has
 * "view" on — the app should show a read-only banner (and, eventually, disable
 * edit controls). Inherently view-only areas (e.g. the learner view) don't count. */
export function isScreenReadOnly(screenId: string, perms: Record<string, AreaLevel> | null, isAdmin: boolean): boolean {
  if (isAdmin) return false;
  const nodeId = SURFACE_TO_NODE.get(screenId);
  const node = nodeId ? NODE_BY_ID.get(nodeId) : undefined;
  return !!node && isEditable(node) && effectiveLevel(perms, isAdmin, nodeId!) === 'view';
}

/** Expand a role's node→level map into the capability set the app enforces. */
export function capabilitiesForPerms(perms: Record<string, AreaLevel> | null, isAdmin: boolean): Set<string> {
  const caps = new Set<string>();
  if (isAdmin) { for (const c of LEARNING_MANIFEST.capabilities) caps.add(c.id); return caps; }
  for (const [nodeId, level] of Object.entries(perms ?? {})) {
    const node = NODE_BY_ID.get(nodeId);
    if (!node) continue;
    for (const c of node.view?.capabilities ?? []) caps.add(c);
    if (level === 'edit') for (const c of node.edit?.capabilities ?? []) caps.add(c);
  }
  return caps;
}

// ── Role-builder cascade helpers (pure over the tree) ───────────────────────
function descendantsOf(node: AccessNode): AccessNode[] {
  const out: AccessNode[] = [];
  const walk = (n: AccessNode) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
  walk(node);
  return out;
}

/** Set a node (and, cascading, its descendants) to a level. Edit cascades as
 * edit where the child supports it, else view. Also grants ancestors ≥ view so
 * a sub-area is never orphaned above its tab. */
export function cascadeSet(
  perms: Record<string, AreaLevel>,
  nodeId: string,
  level: AreaLevel,
): Record<string, AreaLevel> {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) return perms;
  const next = { ...perms };
  next[nodeId] = isEditable(node) ? level : 'view';
  for (const d of descendantsOf(node)) next[d.id] = level === 'edit' && isEditable(d) ? 'edit' : 'view';
  // Ensure ancestors are at least visible.
  let p = PARENT_OF.get(nodeId) ?? null;
  while (p) { if (!next[p]) next[p] = 'view'; p = PARENT_OF.get(p) ?? null; }
  return next;
}

/** Remove a node and its whole subtree from the grant map. */
export function cascadeClear(perms: Record<string, AreaLevel>, nodeId: string): Record<string, AreaLevel> {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) return perms;
  const next = { ...perms };
  delete next[nodeId];
  for (const d of descendantsOf(node)) delete next[d.id];
  return next;
}
