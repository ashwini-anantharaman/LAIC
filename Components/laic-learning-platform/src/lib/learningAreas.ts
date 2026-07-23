/**
 * The Learning Platform's functional AREAS — the "parts of the page" a custom
 * role can grant view/edit access to. Each area maps to the nav items (screens)
 * it exposes; the sidebar is computed from the union of a person's granted
 * areas. One source of truth for both the role builder and nav gating.
 */
export type AreaLevel = 'view' | 'edit';

export interface LearningArea {
  key: string;
  label: string;
  hint: string;
  /** Nav items (screen ids) this area exposes, in display order. */
  items: { id: string; label: string }[];
}

export const LEARNING_AREAS: LearningArea[] = [
  { key: 'overview', label: 'Program Overview', hint: 'Program dashboard & activity',
    items: [{ id: 'admin-overview', label: 'Program Overview' }] },
  { key: 'authoring', label: 'Authoring', hint: 'Create objects, sources, and the library',
    items: [
      { id: 'cd-home', label: 'Home' },
      { id: 'cd-create', label: 'Create' },
      { id: 'cd-sources', label: 'Sources' },
      { id: 'cd-library', label: 'Object Library' },
      { id: 'cd-submissions', label: 'My Submissions' },
    ] },
  { key: 'courses', label: 'Courses & Assignments', hint: 'Build and assign courses',
    items: [{ id: 'admin-courses', label: 'Courses & Assignments' }] },
  { key: 'reviews', label: 'Reviews', hint: 'Review objects and courses',
    items: [
      { id: 'or-reviews', label: 'Object Reviews' },
      { id: 'cr-reviews', label: 'Course Reviews' },
    ] },
  { key: 'publishing', label: 'Publishing & Governance', hint: 'Versions, publishing, governance',
    items: [
      { id: 'cd-versions', label: 'Versions & Publishing' },
      { id: 'admin-publishing', label: 'Publishing & Governance' },
    ] },
  { key: 'analytics', label: 'Analytics', hint: 'Author analytics',
    items: [{ id: 'cd-analytics', label: 'Author Analytics' }] },
  { key: 'coaching', label: 'Coaching', hint: 'The coach view',
    items: [{ id: 'coach', label: 'Coach' }] },
  { key: 'learner', label: 'Learner experience', hint: 'The student/learner view',
    items: [
      { id: 'student-dashboard', label: 'Today' },
      { id: 'student-courses', label: 'My Courses' },
    ] },
  { key: 'people', label: 'People', hint: 'Invite & manage people and roles',
    items: [{ id: 'admin-people', label: 'People' }] },
];

/** Nav item ids a person can see, from their granted-area perms (admins: all). */
export function navItemsForPerms(perms: Record<string, AreaLevel> | null, isAdmin: boolean): { id: string; label: string }[] {
  const areas = isAdmin ? LEARNING_AREAS : LEARNING_AREAS.filter((a) => perms && perms[a.key]);
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const a of areas) for (const it of a.items) if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
  return out;
}

/** Whether the person may edit (vs only view) the area a given screen belongs to. */
export function canEditScreen(screenId: string, perms: Record<string, AreaLevel> | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!perms) return false;
  const area = LEARNING_AREAS.find((a) => a.items.some((it) => it.id === screenId));
  return !!area && perms[area.key] === 'edit';
}
