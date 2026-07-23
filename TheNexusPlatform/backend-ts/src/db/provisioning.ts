/**
 * Organization provisioning — Nexus v0.4 §2.2.
 *
 * The single, repeatable, transactional operation that turns "an org signed up"
 * into "a fully isolated, self-governable space." Runs via asPrivileged because
 * no membership exists yet (so RLS cannot gate the bootstrap) — this is the one
 * legitimate privileged write, and it emits an audit event.
 *
 * Onboarding org #5,000 costs the same as #5: create record → boundary → owner →
 * default entitlements → storage scope → theme → audit, all-or-nothing.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { asPrivileged, type Tx } from "./context";
import { ensureOrgProfile } from "./resolveProfile";
import { organizations, orgMemberships, entitlements, auditEvents } from "./schema";

export type ModuleKey = "nexus" | "learning" | "coaching" | "analytics";

export interface ProvisionOrganizationInput {
  name: string;
  slug?: string;
  owner: { userId?: string; email: string; displayName?: string };
  theme?: { primaryColor?: string; secondaryColor?: string; logoUrl?: string };
  /** Modules the org starts with. Defaults to nexus + learning. */
  defaultModules?: ModuleKey[];
  /**
   * Let the owner's credential belong to a second org (the one-account-per-org
   * exception). The operator explicitly designating an existing account as owner
   * is consent, analogous to accepting an invitation.
   */
  allowSecondOrg?: boolean;
}

export interface ProvisionResult {
  organizationId: string;
  slug: string;
  ownerProfileId: string;
  /** The shared auth credential (RLS context / login) behind the owner profile. */
  ownerAuthUserId: string;
  modules: ModuleKey[];
  storagePrefix: string;
}

function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org"
  );
}

async function uniqueSlug(tx: Tx, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // asPrivileged → no RLS, so this sees all orgs for a true global uniqueness check.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
    if (hit.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function provisionOrganization(input: ProvisionOrganizationInput): Promise<ProvisionResult> {
  const modules = input.defaultModules ?? ["nexus", "learning"];
  // The shared auth credential behind this owner (org-scoped profiles link to it).
  const ownerAuthUserId = input.owner.userId ?? randomUUID();

  return asPrivileged(async (tx) => {
    const theme = {
      primaryColor: input.theme?.primaryColor ?? null,
      secondaryColor: input.theme?.secondaryColor ?? null,
      logoUrl: input.theme?.logoUrl ?? null,
    };

    // 1. Organization record (+ isolation boundary = its id). Owner set after the
    //    owner profile is created (org-scoped profile → needs org id first).
    const slug = await uniqueSlug(tx, input.slug ? slugify(input.slug) : slugify(input.name));
    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        slug,
        tenantMode: "full_tenant",
        status: "active",
        dataResidency: "shared",
        themeJson: theme,
        settings: { dataResidency: "shared", theme },
      })
      .returning({ id: organizations.id });

    // 2. Org-scoped owner profile, via the single person-enters-an-org chokepoint
    //    (Phase 2: enforces one credential ↔ one org; 409 aborts the whole
    //    transaction, so no half-provisioned org is left behind).
    const ownerProfileId = await ensureOrgProfile(tx, ownerAuthUserId, org.id, {
      email: input.owner.email,
      role: "org_admin",
      displayName: input.owner.displayName ?? null,
      allowSecondOrg: input.allowSecondOrg,
    });

    const storagePrefix = `orgs/${org.id}/`;
    await tx
      .update(organizations)
      .set({ ownerId: ownerProfileId, createdByUserId: ownerProfileId, settings: { dataResidency: "shared", storagePrefix, theme } })
      .where(eq(organizations.id, org.id));

    // 3. First owner membership (what RLS keys on, via the profile's auth_user_id).
    await tx.insert(orgMemberships).values({
      orgId: org.id,
      profileId: ownerProfileId,
      role: "owner",
      access: "edit",
    });

    // 4. Default entitlements.
    if (modules.length > 0) {
      await tx.insert(entitlements).values(
        modules.map((m) => ({
          organizationId: org.id,
          subjectType: "organization" as const,
          subjectId: org.id,
          module: m,
          status: "active" as const,
        })),
      );
    }

    // 5. Audit.
    await tx.insert(auditEvents).values({
      organizationId: org.id,
      actorUserId: ownerProfileId,
      action: "organization.provisioned",
      scopeType: "organization",
      scopeId: org.id,
      metadata: { modules, storagePrefix, slug },
    });

    return { organizationId: org.id, slug, ownerProfileId, ownerAuthUserId, modules, storagePrefix };
  });
}
