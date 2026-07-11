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
import { eq } from "drizzle-orm";

import { asPrivileged, type Tx } from "./context";
import { profiles, organizations, orgMemberships, entitlements, auditEvents } from "./schema";

export type ModuleKey = "nexus" | "learning" | "coaching" | "analytics";

export interface ProvisionOrganizationInput {
  name: string;
  slug?: string;
  owner: { userId?: string; email: string; displayName?: string };
  theme?: { primaryColor?: string; secondaryColor?: string; logoUrl?: string };
  /** Modules the org starts with. Defaults to nexus + learning. */
  defaultModules?: ModuleKey[];
}

export interface ProvisionResult {
  organizationId: string;
  slug: string;
  ownerProfileId: string;
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

/** Resolve the owner's profile, creating it if this is a brand-new person. */
async function ensureOwnerProfile(tx: Tx, owner: ProvisionOrganizationInput["owner"]): Promise<string> {
  if (owner.userId) {
    const byId = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, owner.userId));
    if (byId.length > 0) return byId[0].id;
  }
  const byEmail = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, owner.email));
  if (byEmail.length > 0) return byEmail[0].id;

  const [created] = await tx
    .insert(profiles)
    .values({
      ...(owner.userId ? { id: owner.userId } : {}),
      email: owner.email,
      role: "org_admin",
      displayName: owner.displayName ?? null,
    })
    .returning({ id: profiles.id });
  return created.id;
}

export async function provisionOrganization(input: ProvisionOrganizationInput): Promise<ProvisionResult> {
  const modules = input.defaultModules ?? ["nexus", "learning"];

  return asPrivileged(async (tx) => {
    // 1. Owner account.
    const ownerProfileId = await ensureOwnerProfile(tx, input.owner);

    // 2. Organization record (+ isolation boundary = its id). Theme, dataResidency,
    //    and the storage prefix live in `settings` (the org table's config bag).
    const slug = await uniqueSlug(tx, input.slug ? slugify(input.slug) : slugify(input.name));
    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        slug,
        ownerId: ownerProfileId,
        settings: {
          dataResidency: "shared",
          theme: {
            primaryColor: input.theme?.primaryColor ?? null,
            secondaryColor: input.theme?.secondaryColor ?? null,
            logoUrl: input.theme?.logoUrl ?? null,
          },
        },
      })
      .returning({ id: organizations.id });

    const storagePrefix = `orgs/${org.id}/`;
    await tx
      .update(organizations)
      .set({ settings: { dataResidency: "shared", storagePrefix, theme: input.theme ?? {} } })
      .where(eq(organizations.id, org.id));

    // 3. First owner membership (what RLS keys on).
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

    return { organizationId: org.id, slug, ownerProfileId, modules, storagePrefix };
  });
}
