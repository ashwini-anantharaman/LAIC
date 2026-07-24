/**
 * Capability → UI surface → app screen mapping for demo policy-role logins.
 */

import type { Role } from './types';
import {
  type CapabilityCatalogueDocument,
  loadCatalogue,
  type UiSurface,
} from './accessControlCatalogue';
import {
  type PolicyRole,
  loadPolicy,
  roleCapabilityIds,
} from './accessPolicy';

export const POLICY_USER_PREFIX = 'policy:';

export interface PolicyDemoAccount {
  userId: string;
  email: string;
  password: string;
  label: string;
  policyRoleId: string;
  description?: string;
  capabilityIds: string[];
  origin: PolicyRole['origin'];
}

/** Catalogue routeOrComponent → in-app screen id. */
export const ROUTE_TO_SCREEN: Record<string, string> = {
  '/learning/home': 'cd-home',
  '/learning/create': 'cd-create',
  '/learning/sources': 'cd-sources',
  '/learning/library': 'cd-library',
  '/learning/submissions': 'cd-submissions',
  '/learning/reviews/objects': 'or-reviews',
  '/learning/reviews/compositions': 'cr-reviews',
  '/learning/publishing': 'cd-versions',
  '/learning/assignments': 'admin-courses',
  '/learning/progress': 'coach',
  '/learn/today': 'student-dashboard',
  '/learn/library': 'student-courses',
  '/learning/admin': 'admin-overview',
};

/** Extra screens gated by capabilities (not every surface has a 1:1 route). */
const CAPABILITY_SCREEN_EXTRAS: { anyOf: string[]; screen: string; label: string }[] = [
  { anyOf: ['learning.analytics.view'], screen: 'cd-analytics', label: 'Author Analytics' },
  {
    anyOf: ['learning.repository.organize', 'learning.analytics.view'],
    screen: 'admin-people',
    label: 'People & Roles',
  },
  {
    anyOf: ['learning.repository.organize'],
    screen: 'admin-access',
    label: 'Access Catalogue',
  },
  {
    anyOf: ['learning.publish.release', 'learning.publish.audience'],
    screen: 'admin-publishing',
    label: 'Publishing & Governance',
  },
  { anyOf: ['learning.object.create', 'learning.composition.create'], screen: 'cd-templates', label: 'Template Library' },
];

export interface AccessNavItem {
  id: string;
  label: string;
  surfaceId?: string;
}

export function isPolicyUserId(userId: string): boolean {
  return userId.startsWith(POLICY_USER_PREFIX);
}

export function policyRoleIdFromUserId(userId: string): string | null {
  if (!isPolicyUserId(userId)) return null;
  return userId.slice(POLICY_USER_PREFIX.length) || null;
}

export function policyUserId(roleId: string): string {
  return `${POLICY_USER_PREFIX}${roleId}`;
}

function slugEmail(roleId: string): string {
  const slug = roleId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'role';
  return `${slug}@demo.laic`;
}

export function listPolicyDemoAccounts(opts?: { customOnly?: boolean }): PolicyDemoAccount[] {
  const policy = loadPolicy();
  const roles = opts?.customOnly
    ? policy.roles.filter((r) => r.origin === 'custom')
    : policy.roles;
  return roles.map((r) => ({
    userId: policyUserId(r.id),
    email: slugEmail(r.id),
    password: '123456',
    label: r.name,
    policyRoleId: r.id,
    description: r.description,
    capabilityIds: roleCapabilityIds(r),
    origin: r.origin,
  }));
}

export function authenticatePolicyDemo(
  email: string,
  password: string,
): PolicyDemoAccount | null {
  const e = email.trim().toLowerCase();
  const hit = listPolicyDemoAccounts().find(
    (a) => a.email === e && a.password === password,
  );
  return hit || null;
}

export function getPolicyRole(roleId: string): PolicyRole | null {
  return loadPolicy().roles.find((r) => r.id === roleId) || null;
}

export function hasAnyCapability(
  granted: Set<string> | string[],
  required?: string[],
): boolean {
  if (!required?.length) return true;
  const set = granted instanceof Set ? granted : new Set(granted);
  return required.some((id) => set.has(id));
}

function surfaceAllowed(surface: UiSurface, granted: Set<string>): boolean {
  const any = surface.requiredAnyCapabilities || [];
  const all = surface.requiredAllCapabilities || [];
  if (all.length && !all.every((id) => granted.has(id))) return false;
  return hasAnyCapability(granted, any);
}

/** Navigation screens this grant set may open. */
export function navItemsForCapabilities(
  capabilityIds: string[],
  catalogue?: CapabilityCatalogueDocument,
): AccessNavItem[] {
  const cat = catalogue || loadCatalogue();
  const granted = new Set(capabilityIds);
  const items: AccessNavItem[] = [];
  const seen = new Set<string>();

  for (const surface of cat.uiSurfaces) {
    if (surface.kind !== 'navigation') continue;
    if (!surfaceAllowed(surface, granted)) continue;
    const route = surface.routeOrComponent || '';
    const screen = ROUTE_TO_SCREEN[route];
    if (!screen || seen.has(screen)) continue;
    seen.add(screen);
    items.push({ id: screen, label: surface.label, surfaceId: surface.id });
  }

  for (const extra of CAPABILITY_SCREEN_EXTRAS) {
    if (!hasAnyCapability(granted, extra.anyOf)) continue;
    if (seen.has(extra.screen)) continue;
    seen.add(extra.screen);
    items.push({ id: extra.screen, label: extra.label });
  }

  return items;
}

export function defaultScreenForCapabilities(capabilityIds: string[]): string {
  const items = navItemsForCapabilities(capabilityIds);
  return items[0]?.id || 'cd-home';
}

/** Shell Role for chrome that still keys off the legacy Role enum. */
export function inferShellRole(capabilityIds: string[]): Role {
  const caps = new Set(capabilityIds);
  const create = caps.has('learning.object.create') || caps.has('learning.composition.create');
  const reviewObj = caps.has('learning.review.object');
  const reviewCourse = caps.has('learning.review.composition');
  const teach = caps.has('learning.assignment.create') || caps.has('learning.progress.view');
  const admin = caps.has('learning.repository.organize') || caps.has('learning.publish.release');
  const learner = caps.has('learning.runtime.use');

  if (admin && !create) return 'administrator';
  if (teach && !create && !reviewObj) return 'coach';
  if (reviewObj && !create) return 'object-reviewer';
  if (reviewCourse && !create) return 'course-reviewer';
  if (learner && !create && !reviewObj && !admin) return 'student';
  if (create) return 'content-developer';
  return 'content-developer';
}

export function canAccessScreen(capabilityIds: string[], screenId: string): boolean {
  // Creator / wizard are part of Create flow
  if (screenId === 'cd-creator' || screenId === 'cd-wizard') {
    return hasAnyCapability(capabilityIds, ['learning.object.create', 'learning.composition.create']);
  }
  if (screenId === 'admin-access-manual' || screenId === 'admin-sample-roles') {
    return hasAnyCapability(capabilityIds, ['learning.repository.organize']);
  }
  return navItemsForCapabilities(capabilityIds).some((i) => i.id === screenId);
}
