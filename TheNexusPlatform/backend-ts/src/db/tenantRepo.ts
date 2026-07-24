/**
 * Postgres (Drizzle) implementations of the tenant CRUD — Nexus v0.4 Slice 5.
 *
 * Each op runs `scoped()`: under withUserContext (RLS-enforced) when a request
 * user is present, else asPrivileged (hook/app-key calls, provisioning). Returns
 * snake_case Row shapes so they're drop-in for the existing routes.
 */
import { randomInt, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import * as localKeys from "../platformLocalStore";
import { HttpError } from "../httpError";
import { normalizeProgramFeatures, type ProgramFeatures } from "../schemas";
import type { StageNode } from "../permissions";
import { withUserContext, asPrivileged, type Tx } from "./context";
import { currentUserId } from "./requestContext";
import { resolveProfileId, ensureOrgProfile } from "./resolveProfile";
import {
  programs, stageNodes, offerings, registeredApps, registrations, participants,
  orgMemberships, profiles, organizations, entitlements, integrations, auditEvents, appLaunchTokens, platformSettings,
  challenges, challengeStageConfig, orgPermissionDefaults, studentRegistrations,
  joinCodes as joinCodesTable,
} from "./schema";

type Row = Record<string, unknown>;

export function scoped<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const uid = currentUserId();
  return uid ? withUserContext(uid, fn) : asPrivileged(fn);
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

// ── row mappers (camelCase Drizzle → snake_case Row) ────────────────────────
const programRow = (p: typeof programs.$inferSelect): Row => ({
  id: p.id, org_id: p.orgId, name: p.name, category: p.category, description: p.description,
  icon: p.icon, instructor_label: p.instructorLabel, learner_label: p.learnerLabel,
  features: normalizeProgramFeatures((p.metadataJson as Row)?.features as Row),
  secondary_categories: ((p.metadataJson as Row)?.secondary_categories as string[]) ?? [],
  branding: ((p.metadataJson as Row)?.branding as Row) ?? null,
  created_at: p.createdAt,
});
const stageRow = (s: typeof stageNodes.$inferSelect): Row => ({
  id: s.id, org_id: s.orgId, challenge_id: s.challengeId, parent_id: s.parentId, program_id: s.programId,
  stage_type: s.stageType, name: s.name, depth: s.depth, path: s.path, discord_url: s.discordUrl,
  event_at: s.eventAt, qualifier_status: s.qualifierStatus, metadata: s.metadata, created_at: s.createdAt,
});
const offeringRow = (o: typeof offerings.$inferSelect): Row => ({
  id: o.id, organization_id: o.organizationId, program_id: o.programId, stage_node_id: o.stageNodeId,
  name: o.name, slug: o.slug, offering_type: o.offeringType, status: o.status, description: o.description,
  start_date: o.startDate, end_date: o.endDate, registration_open: o.registrationOpen, approval_mode: o.approvalMode,
  signup_fields: o.signupFields, platform_module: o.platformModule, registered_app_id: o.registeredAppId,
  external_runtime_url: o.externalRuntimeUrl, participant_label_singular: o.participantLabelSingular,
  participant_label_plural: o.participantLabelPlural, metadata: o.metadata, content_package: o.contentPackage, created_at: o.createdAt, updated_at: o.updatedAt,
});
const appRow = (a: typeof registeredApps.$inferSelect): Row => ({
  id: a.id, organization_id: a.organizationId, program_id: a.programId, offering_id: a.offeringId,
  app_name: a.appName, app_slug: a.appSlug, api_key_hash: a.apiKeyHash, key_prefix: a.keyPrefix,
  allowed_identifiers: a.allowedIdentifiers, status: a.status, launch_url: a.launchUrl,
  launch_context: a.launchContext, created_at: a.createdAt, updated_at: a.updatedAt,
});
const regRow = (r: typeof registrations.$inferSelect): Row => ({
  id: r.id, organization_id: r.organizationId, program_id: r.programId, offering_id: r.offeringId,
  stage_node_id: r.stageNodeId, registered_app_id: r.registeredAppId, registration_source: r.registrationSource,
  email: r.email, phone: r.phone, name: r.name, age: r.age, user_id: r.userId, status: r.status,
  field_data: r.fieldData, reviewed_by_user_id: r.reviewedByUserId, reviewed_at: r.reviewedAt,
  created_by_user_id: r.createdByUserId, created_at: r.createdAt,
});
const partRow = (p: typeof participants.$inferSelect): Row => ({
  id: p.id, organization_id: p.organizationId, program_id: p.programId, offering_id: p.offeringId,
  stage_node_id: p.stageNodeId, user_id: p.userId, participant_type: p.participantType, status: p.status,
  added_by_user_id: p.addedByUserId, registration_id: p.registrationId, metadata: p.metadata, created_at: p.createdAt,
});
const entRow = (e: typeof entitlements.$inferSelect): Row => ({
  id: e.id, organization_id: e.organizationId, subject_type: e.subjectType, subject_id: e.subjectId,
  module: e.module, status: e.status, limits: e.limits, starts_at: e.startsAt, ends_at: e.endsAt, created_at: e.createdAt,
});
const integrationRow = (i: typeof integrations.$inferSelect): Row => ({
  id: i.id, organization_id: i.organizationId, program_id: i.programId, integration_type: i.integrationType,
  config: i.config, permission_level: i.permissionLevel, status: i.status, created_at: i.createdAt,
});

// ── counts ──────────────────────────────────────────────────────────────────
async function programCounts(tx: Tx, orgId: string, programId: string): Promise<Row> {
  const stages = await tx.select({ id: stageNodes.id }).from(stageNodes)
    .where(and(eq(stageNodes.orgId, orgId), eq(stageNodes.programId, programId)));
  const stageIds = stages.map((s) => s.id);
  const mships = await tx.select({ role: orgMemberships.role }).from(orgMemberships).where(eq(orgMemberships.programId, programId));
  const instructor_count = mships.filter((m) => m.role === "instructor").length;
  let course_count = 0, learner_count = 0;
  if (stageIds.length) {
    // offerings of type course under this program serve as the course count proxy.
    const offs = await tx.select({ id: offerings.id, t: offerings.offeringType }).from(offerings).where(eq(offerings.programId, programId));
    course_count = offs.filter((o) => o.t === "course").length;
    const parts = await tx.select({ id: participants.id }).from(participants)
      .where(and(eq(participants.programId, programId), eq(participants.participantType, "learner")));
    learner_count = parts.length;
  }
  return { course_count, learner_count, instructor_count };
}

async function offeringCounts(tx: Tx, offeringId: string): Promise<Row> {
  const regs = await tx.select({ status: registrations.status }).from(registrations).where(eq(registrations.offeringId, offeringId));
  const parts = await tx.select({ id: participants.id }).from(participants).where(eq(participants.offeringId, offeringId));
  return {
    registration_count: regs.length,
    pending_count: regs.filter((r) => r.status === "pending_review").length,
    participant_count: parts.length,
  };
}

// ── Platform-admin: all organizations ──────────────────────────────────────
// Under a platform admin's context the RLS bypass returns every org.
export async function listAllOrganizations(): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(organizations)).map((o) => ({
      id: o.id, name: o.name, slug: o.slug, status: o.status, organization_type: o.organizationType, created_at: o.createdAt,
    })),
  );
}

// Names-only directory of every org, readable by any authenticated user so they
// can reference other orgs in affiliations/relationships. Deliberately bypasses
// RLS (privileged) but returns ONLY id/name/slug — never any org's private data.
export async function listOrgDirectory(): Promise<Row[]> {
  return asPrivileged(async (tx) =>
    (await tx.select({ id: organizations.id, name: organizations.name, slug: organizations.slug }).from(organizations))
      .map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
  );
}

// ── Programs ────────────────────────────────────────────────────────────────
export async function createProgram(orgId: string, name: string, category: string, opts: localKeys.CreateProgramOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const [p] = await tx.insert(programs).values({
      orgId, name, category,
      description: (opts.description as string) ?? null,
      icon: (opts.icon as string) ?? null,
      instructorLabel: (opts.instructorLabel as string) ?? null,
      learnerLabel: (opts.learnerLabel as string) ?? null,
      metadataJson: {
        features: normalizeProgramFeatures(opts.features as Row),
        secondary_categories: opts.secondaryCategories ?? [],
      },
    }).returning();
    return programRow(p);
  });
}

/** Replace a program's accessible-feature set (org-admin config). */
export async function updateProgramFeatures(programId: string, features: ProgramFeatures): Promise<Row | null> {
  return scoped(async (tx) => {
    const existing = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!existing.length) return null;
    const meta = { ...(existing[0].metadataJson as Row), features };
    const [p] = await tx.update(programs).set({ metadataJson: meta }).where(eq(programs.id, programId)).returning();
    if (!p) return null;
    const caps = await _orgFeatureCaps(tx, p.orgId);
    const row = programRow(p);
    return { ...row, features: _clampFeatures(row.features as ProgramFeatures, caps) };
  });
}

export async function listPrograms(orgId: string): Promise<Row[]> {
  return scoped(async (tx) => {
    const rows = await tx.select().from(programs).where(eq(programs.orgId, orgId));
    // Every reader sees EFFECTIVE features: the program's toggles clamped by
    // the org's Nexus-governed envelope. One choke point — routes, launch
    // guards, role builders, and platform access all read through here.
    const caps = await _orgFeatureCaps(tx, orgId);
    return Promise.all(
      rows.map(async (p) => {
        const row = programRow(p);
        return {
          ...row,
          features: _clampFeatures(row.features as ProgramFeatures, caps),
          ...(await programCounts(tx, orgId, p.id)),
        };
      }),
    );
  });
}

export async function getProgram(programId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!r.length) return null;
    const caps = await _orgFeatureCaps(tx, r[0].orgId);
    const row = programRow(r[0]);
    return {
      ...row,
      features: _clampFeatures(row.features as ProgramFeatures, caps),
      ...(await programCounts(tx, r[0].orgId, r[0].id)),
    };
  });
}

export async function deleteProgram(programId: string): Promise<void> {
  await scoped(async (tx) => {
    const offs = await tx.select({ id: offerings.id }).from(offerings).where(eq(offerings.programId, programId));
    const offIds = offs.map((o) => o.id);
    if (offIds.length) {
      await tx.delete(registrations).where(inArray(registrations.offeringId, offIds));
      await tx.delete(participants).where(inArray(participants.offeringId, offIds));
    }
    await tx.delete(offerings).where(eq(offerings.programId, programId));
    await tx.delete(registeredApps).where(eq(registeredApps.programId, programId));
    await tx.delete(stageNodes).where(eq(stageNodes.programId, programId));
    await tx.delete(orgMemberships).where(eq(orgMemberships.programId, programId));
    await tx.delete(programs).where(eq(programs.id, programId));
  });
}

// ── Stage nodes (groups) ────────────────────────────────────────────────────
async function insertStageTree(
  tx: Tx, orgId: string, challengeId: string | null, nodes: Row[],
  parentId: string | null, parentPath: string, depth: number, programId: string | null,
): Promise<Row[]> {
  const out: Row[] = [];
  for (const n of nodes) {
    const id = randomUUID();
    const segment = `${n.stage_type}-${id.slice(0, 8)}`;
    const path = parentPath !== "/" ? `${parentPath}${segment}/` : `/${segment}/`;
    const [row] = await tx.insert(stageNodes).values({
      id, orgId, challengeId: challengeId ?? null, parentId, programId: programId ?? (n.program_id as string) ?? null,
      stageType: n.stage_type as string, name: n.name as string, depth, path,
      discordUrl: (n.discord_url as string) ?? null, eventAt: (n.event_at as unknown as Date) ?? null,
    }).returning();
    out.push(stageRow(row));
    const children = (n.children as Row[]) ?? [];
    if (children.length) out.push(...(await insertStageTree(tx, orgId, challengeId, children, id, path, depth + 1, programId)));
  }
  return out;
}

export async function addStageNodes(orgId: string, nodes: Row[], parentId: string | null = null, programId: string | null = null): Promise<Row[]> {
  return scoped(async (tx) => {
    let parentPath = "/", depth = 0, pid = programId;
    if (parentId) {
      const p = await tx.select().from(stageNodes).where(eq(stageNodes.id, parentId)).limit(1);
      if (p.length) { parentPath = p[0].path; depth = (p[0].depth ?? 0) + 1; pid = pid ?? p[0].programId ?? null; }
    }
    return insertStageTree(tx, orgId, null, nodes, parentId, parentPath, depth, pid);
  });
}

export async function getStageNode(stageId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(stageNodes).where(eq(stageNodes.id, stageId)).limit(1);
    return r.length ? stageRow(r[0]) : null;
  });
}

export async function listStageNodes(orgId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(stageNodes).where(eq(stageNodes.orgId, orgId))).map(stageRow));
}

// ── Offerings ─────────────────────────────────────────────────────────────
async function uniqueOfferingSlug(tx: Tx, programId: string, base: string): Promise<string> {
  let slug = base, n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await tx.select({ id: offerings.id }).from(offerings).where(and(eq(offerings.programId, programId), eq(offerings.slug, slug)));
    if (!hit.length) return slug;
    n += 1; slug = `${base}-${n}`;
  }
}

const DEFAULT_SIGNUP_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "age", label: "Age", type: "number", required: false },
  { key: "email", label: "Email", type: "email", required: true },
];

export async function createOffering(orgId: string, programId: string, name: string, offeringType: string, opts: localKeys.OfferingOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const slug = await uniqueOfferingSlug(tx, programId, (opts.slug as string) || slugify(name));
    const [o] = await tx.insert(offerings).values({
      organizationId: orgId, programId, stageNodeId: (opts.stageNodeId as string) ?? null,
      name, slug, offeringType,
      description: (opts.description as string) ?? null,
      startDate: (opts.startDate as unknown as Date) ?? null,
      endDate: (opts.endDate as unknown as Date) ?? null,
      registrationOpen: (opts.registrationOpen as boolean) ?? false,
      approvalMode: (opts.approvalMode as string) ?? "manual_approve",
      signupFields: opts.signupFields != null ? opts.signupFields : DEFAULT_SIGNUP_FIELDS,
      platformModule: (opts.platformModule as string) ?? "nexus_only",
      registeredAppId: (opts.registeredAppId as string) ?? null,
      externalRuntimeUrl: (opts.externalRuntimeUrl as string) ?? null,
      participantLabelSingular: (opts.participantLabelSingular as string) ?? null,
      participantLabelPlural: (opts.participantLabelPlural as string) ?? null,
      metadata: (opts.metadata as Record<string, unknown>) ?? {},
    }).returning();
    return { ...offeringRow(o), ...(await offeringCounts(tx, o.id)) };
  });
}

export async function listOfferings(programId: string): Promise<Row[]> {
  return scoped(async (tx) => {
    const rows = await tx.select().from(offerings).where(eq(offerings.programId, programId));
    return Promise.all(rows.map(async (o) => ({ ...offeringRow(o), ...(await offeringCounts(tx, o.id)) })));
  });
}

export async function getOffering(offeringId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(offerings).where(eq(offerings.id, offeringId)).limit(1);
    if (!r.length) return null;
    return { ...offeringRow(r[0]), ...(await offeringCounts(tx, offeringId)) };
  });
}

const CAMEL: Record<string, string> = {
  status: "status", description: "description", name: "name", slug: "slug",
  start_date: "startDate", end_date: "endDate", registration_open: "registrationOpen",
  approval_mode: "approvalMode", signup_fields: "signupFields", platform_module: "platformModule",
  registered_app_id: "registeredAppId", external_runtime_url: "externalRuntimeUrl",
  participant_label_singular: "participantLabelSingular", participant_label_plural: "participantLabelPlural",
  metadata: "metadata",
};

export async function updateOffering(offeringId: string, patch: Row): Promise<Row> {
  return scoped(async (tx) => {
    const set: Row = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) continue;
      const col = CAMEL[k];
      if (col) set[col] = v;
    }
    const [o] = await tx.update(offerings).set(set).where(eq(offerings.id, offeringId)).returning();
    return { ...offeringRow(o), ...(await offeringCounts(tx, offeringId)) };
  });
}

export async function deleteOffering(offeringId: string): Promise<void> {
  await scoped(async (tx) => {
    await tx.delete(registrations).where(eq(registrations.offeringId, offeringId));
    await tx.delete(participants).where(eq(participants.offeringId, offeringId));
    await tx.delete(registeredApps).where(eq(registeredApps.offeringId, offeringId));
    await tx.delete(offerings).where(eq(offerings.id, offeringId));
  });
}

// ── Registered apps ─────────────────────────────────────────────────────────
export async function createRegisteredApp(orgId: string, programId: string | null, appName: string, opts: localKeys.RegisteredAppOptions = {}): Promise<[Row, string]> {
  return scoped(async (tx) => {
    let slug = (opts.appSlug as string) || slugify(appName), n = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hit = await tx.select({ id: registeredApps.id }).from(registeredApps).where(and(eq(registeredApps.organizationId, orgId), eq(registeredApps.appSlug, slug)));
      if (!hit.length) break;
      n += 1; slug = `${(opts.appSlug as string) || slugify(appName)}-${n}`;
    }
    const [rawKey, keyHash, keyPrefix] = localKeys.generateApiKey();
    const [a] = await tx.insert(registeredApps).values({
      organizationId: orgId, programId, offeringId: (opts.offeringId as string) ?? null,
      appName, appSlug: slug, apiKeyHash: keyHash, keyPrefix,
      allowedIdentifiers: (opts.allowedIdentifiers as string) ?? "email",
      launchUrl: (opts.launchUrl as string) ?? null,
      launchContext: (opts.launchContext as Record<string, unknown>) ?? {},
    }).returning();
    return [appRow(a), rawKey] as [Row, string];
  });
}

export async function listRegisteredApps(programId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(registeredApps).where(eq(registeredApps.programId, programId))).map(appRow));
}

export async function getRegisteredApp(appId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(registeredApps).where(eq(registeredApps.id, appId)).limit(1);
    return r.length ? appRow(r[0]) : null;
  });
}

export async function getRegisteredAppByHash(apiKeyHash: string): Promise<Row | null> {
  // App-key auth: no user context; must be privileged.
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(registeredApps).where(eq(registeredApps.apiKeyHash, apiKeyHash)).limit(1);
    return r.length ? appRow(r[0]) : null;
  });
}

const APP_CAMEL: Record<string, string> = {
  app_name: "appName", allowed_identifiers: "allowedIdentifiers", status: "status",
  launch_url: "launchUrl", launch_context: "launchContext", offering_id: "offeringId",
};

export async function updateRegisteredApp(appId: string, patch: Row): Promise<Row> {
  return scoped(async (tx) => {
    const set: Row = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) continue;
      const col = APP_CAMEL[k];
      if (col) set[col] = v;
    }
    const [a] = await tx.update(registeredApps).set(set).where(eq(registeredApps.id, appId)).returning();
    return appRow(a);
  });
}

export async function rotateAppApiKey(appId: string): Promise<[Row, string]> {
  return scoped(async (tx) => {
    const [rawKey, keyHash, keyPrefix] = localKeys.generateApiKey();
    const [a] = await tx.update(registeredApps).set({ apiKeyHash: keyHash, keyPrefix, updatedAt: new Date() }).where(eq(registeredApps.id, appId)).returning();
    return [appRow(a), rawKey] as [Row, string];
  });
}

export async function revokeApp(appId: string): Promise<Row> {
  return scoped(async (tx) => {
    const [a] = await tx.update(registeredApps).set({ status: "revoked", apiKeyHash: null, updatedAt: new Date() }).where(eq(registeredApps.id, appId)).returning();
    return appRow(a);
  });
}

// ── Registrations ─────────────────────────────────────────────────────────
export async function createRegistration(orgId: string, offeringId: string | null, opts: localKeys.RegistrationOptions = {}, privileged = false): Promise<Row> {
  // `privileged` forces an RLS bypass — used by PUBLIC gate sign-up, where the
  // caller may be anonymous OR carry an unrelated user's token; the GATE (not
  // the caller's identity) authorizes the insert. Authenticated routes leave it
  // false so RLS still scopes them to the acting user.
  const run = privileged ? asPrivileged : scoped;
  return run(async (tx) => {
    const userId = await resolveProfileId(tx, (opts.userId as string) ?? null, orgId);
    const createdBy = await resolveProfileId(tx, (opts.createdByUserId as string) ?? null, orgId);
    const [r] = await tx.insert(registrations).values({
      organizationId: orgId, programId: (opts.programId as string) ?? null, offeringId,
      stageNodeId: (opts.stageNodeId as string) ?? null, registeredAppId: (opts.registeredAppId as string) ?? null,
      registrationSource: (opts.registrationSource as string) ?? "app_hook",
      email: (opts.email as string) ?? null, phone: (opts.phone as string) ?? null,
      name: (opts.name as string) ?? null, age: (opts.age as number) ?? null,
      userId, status: (opts.status as string) ?? "pending_review",
      fieldData: (opts.fieldData as Record<string, unknown>) ?? {}, createdByUserId: createdBy,
    }).returning();
    return regRow(r);
  });
}

export async function getRegistration(registrationId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(registrations).where(eq(registrations.id, registrationId)).limit(1);
    return r.length ? regRow(r[0]) : null;
  });
}

export async function listRegistrations(offeringId: string, status: string | null = null): Promise<Row[]> {
  return scoped(async (tx) => {
    const where = status ? and(eq(registrations.offeringId, offeringId), eq(registrations.status, status)) : eq(registrations.offeringId, offeringId);
    return (await tx.select().from(registrations).where(where).orderBy(desc(registrations.createdAt))).map(regRow);
  });
}

/** All registrations for a PROGRAM — the program's participant roster (both program-level and offering-level). */
export async function listRegistrationsByProgram(programId: string, status: string | null = null): Promise<Row[]> {
  return scoped(async (tx) => {
    const where = status ? and(eq(registrations.programId, programId), eq(registrations.status, status)) : eq(registrations.programId, programId);
    return (await tx.select().from(registrations).where(where).orderBy(desc(registrations.createdAt))).map(regRow);
  });
}

export async function setRegistrationStatus(registrationId: string, status: string, reviewedByUserId: string | null): Promise<Row> {
  return scoped(async (tx) => {
    const cur = await tx.select({ orgId: registrations.organizationId }).from(registrations).where(eq(registrations.id, registrationId)).limit(1);
    const reviewer = await resolveProfileId(tx, reviewedByUserId, cur.length ? cur[0].orgId : null);
    const [r] = await tx.update(registrations).set({ status, reviewedByUserId: reviewer, reviewedAt: new Date() }).where(eq(registrations.id, registrationId)).returning();
    return regRow(r);
  });
}

// ── Participants ────────────────────────────────────────────────────────────
export async function createParticipant(orgId: string, offeringId: string, opts: localKeys.ParticipantOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const type = (opts.participantType as string) ?? "learner";
    const userId = await resolveProfileId(tx, (opts.userId as string) ?? null, orgId);
    const addedBy = await resolveProfileId(tx, (opts.addedByUserId as string) ?? null, orgId);
    if (userId) {
      const existing = await tx.select().from(participants)
        .where(and(eq(participants.offeringId, offeringId), eq(participants.userId, userId), eq(participants.participantType, type))).limit(1);
      if (existing.length) return partRow(existing[0]);
    }
    const [p] = await tx.insert(participants).values({
      organizationId: orgId, programId: (opts.programId as string) ?? null, offeringId,
      stageNodeId: (opts.stageNodeId as string) ?? null, userId,
      participantType: type, status: (opts.status as string) ?? "active",
      addedByUserId: addedBy, registrationId: (opts.registrationId as string) ?? null,
      metadata: (opts.metadata as Record<string, unknown>) ?? {},
    }).returning();
    return partRow(p);
  });
}

export async function listParticipants(offeringId: string, status: string | null = null): Promise<Row[]> {
  return scoped(async (tx) => {
    const where = status ? and(eq(participants.offeringId, offeringId), eq(participants.status, status)) : eq(participants.offeringId, offeringId);
    return (await tx.select().from(participants).where(where)).map(partRow);
  });
}

/**
 * Program-level participant (offering_id null) — a student joining the PROGRAM,
 * which is what grants platform access. Dedups by program + user + type so a
 * re-invite doesn't stack rows.
 */
export async function createProgramParticipant(orgId: string, programId: string, opts: localKeys.ParticipantOptions = {}, privileged = false): Promise<Row> {
  // See createRegistration: `privileged` bypasses RLS for public gate sign-up.
  const run = privileged ? asPrivileged : scoped;
  return run(async (tx) => {
    const type = (opts.participantType as string) ?? "learner";
    const userId = await resolveProfileId(tx, (opts.userId as string) ?? null, orgId);
    const addedBy = await resolveProfileId(tx, (opts.addedByUserId as string) ?? null, orgId);
    if (userId) {
      const existing = await tx.select().from(participants)
        .where(and(eq(participants.programId, programId), eq(participants.userId, userId), eq(participants.participantType, type), isNull(participants.offeringId))).limit(1);
      if (existing.length) return partRow(existing[0]);
    }
    const [p] = await tx.insert(participants).values({
      organizationId: orgId, programId, offeringId: null,
      userId, participantType: type, status: (opts.status as string) ?? "active",
      addedByUserId: addedBy, registrationId: (opts.registrationId as string) ?? null,
    }).returning();
    return partRow(p);
  });
}

/**
 * Deactivate every participant row for a registration (student removal). Access
 * is derived from the ACTIVE participant row, so flipping status to 'removed'
 * revokes platform access on the next check — no membership to unwind. Covers
 * duplicate rows from re-approval.
 */
export async function removeParticipantsByRegistration(registrationId: string): Promise<void> {
  return scoped(async (tx) => {
    await tx.update(participants).set({ status: "removed" }).where(eq(participants.registrationId, registrationId));
  });
}

// ── Members ─────────────────────────────────────────────────────────────────
export async function listMembers(orgId: string): Promise<Row[]> {
  return scoped(async (tx) => {
    const rows = await tx.select().from(orgMemberships).where(eq(orgMemberships.orgId, orgId));
    const pids = [...new Set(rows.map((r) => r.profileId))];
    const sids = rows.map((r) => r.stageNodeId).filter((x): x is string => Boolean(x));
    const profs = pids.length ? await tx.select().from(profiles).where(inArray(profiles.id, pids)) : [];
    const stages = sids.length ? await tx.select().from(stageNodes).where(inArray(stageNodes.id, sids)) : [];
    const profMap = new Map(profs.map((p) => [p.id, p]));
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    return rows.map((m) => {
      const p = profMap.get(m.profileId);
      const s = m.stageNodeId ? stageMap.get(m.stageNodeId) : undefined;
      return {
        id: m.id, org_id: m.orgId, profile_id: m.profileId, role: m.role, program_id: m.programId,
        stage_node_id: m.stageNodeId, access: m.access,
        profiles: p ? { email: p.email, display_name: p.displayName, name: p.name } : {},
        stage_nodes: s ? { name: s.name, stage_type: s.stageType } : null,
      };
    });
  });
}

export async function getMembership(memberId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(orgMemberships).where(eq(orgMemberships.id, memberId)).limit(1);
    if (!r.length) return null;
    const m = r[0];
    return { id: m.id, org_id: m.orgId, profile_id: m.profileId, role: m.role, program_id: m.programId, stage_node_id: m.stageNodeId, access: m.access };
  });
}

export async function updateMemberAccess(memberId: string, access: string): Promise<Row> {
  return scoped(async (tx) => {
    const [m] = await tx.update(orgMemberships).set({ access }).where(eq(orgMemberships.id, memberId)).returning();
    return { id: m.id, org_id: m.orgId, profile_id: m.profileId, role: m.role, program_id: m.programId, stage_node_id: m.stageNodeId, access: m.access };
  });
}

/** Remove a membership (org- or program-scoped). Returns true if a row was deleted. */
export async function deleteMembership(memberId: string): Promise<boolean> {
  return scoped(async (tx) => {
    const r = await tx.delete(orgMemberships).where(eq(orgMemberships.id, memberId)).returning({ id: orgMemberships.id });
    return r.length > 0;
  });
}

export async function getUserOrgs(profileId: string): Promise<Row[]> {
  return scoped(async (tx) => {
    // The caller may hold the auth-credential id, while memberships point at
    // org-scoped profile ids (one login -> many org profiles). Resolve both.
    const myProfiles = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.authUserId, profileId));
    const ids = [...new Set([profileId, ...myProfiles.map((p) => p.id)])];
    const rows = await tx.select().from(orgMemberships).where(inArray(orgMemberships.profileId, ids));
    const oids = [...new Set(rows.map((r) => r.orgId))];
    const orgs = oids.length ? await tx.select().from(organizations).where(inArray(organizations.id, oids)) : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    return rows.map((m) => {
      const o = orgMap.get(m.orgId);
      return {
        id: m.id, org_id: m.orgId, profile_id: m.profileId, role: m.role, program_id: m.programId,
        stage_node_id: m.stageNodeId, access: m.access,
        organizations: o ? { id: o.id, name: o.name, slug: o.slug } : {},
      };
    });
  });
}

// ── Entitlements ──────────────────────────────────────────────────────────
export async function listEntitlements(orgId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(entitlements).where(eq(entitlements.organizationId, orgId))).map(entRow));
}

export async function setEntitlement(orgId: string, module: string, status: string, opts: localKeys.EntitlementOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const subjectType = (opts.subjectType as string) ?? "organization";
    const subjectId = (opts.subjectId as string) || orgId;
    const values: Row = { organizationId: orgId, subjectType, subjectId, module, status };
    if (opts.limits != null) values.limits = opts.limits;
    const [e] = await tx.insert(entitlements).values(values as never)
      .onConflictDoUpdate({ target: [entitlements.subjectType, entitlements.subjectId, entitlements.module], set: { status, ...(opts.limits != null ? { limits: opts.limits } : {}) } })
      .returning();
    return entRow(e);
  });
}

// ── Integrations ─────────────────────────────────────────────────────────
export async function listIntegrations(orgId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(integrations).where(eq(integrations.organizationId, orgId))).map(integrationRow));
}

export async function createIntegration(orgId: string, integrationType: string, config: Row, permissionLevel: string, programId: string | null = null): Promise<Row> {
  return scoped(async (tx) => {
    const [i] = await tx.insert(integrations).values({ organizationId: orgId, programId, integrationType, config, permissionLevel }).returning();
    return integrationRow(i);
  });
}

// ── Audit (read) ──────────────────────────────────────────────────────────
function auditRow(e: typeof auditEvents.$inferSelect): Row {
  return {
    id: e.id, organization_id: e.organizationId, actor_user_id: e.actorUserId, action: e.action,
    scope_type: e.scopeType, scope_id: e.scopeId, target_type: e.targetType, target_id: e.targetId,
    metadata: e.metadata, created_at: e.createdAt,
  };
}

export async function listAuditEvents(orgId: string, limit = 50): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, orgId)).orderBy(desc(auditEvents.createdAt)).limit(limit))
      .map(auditRow),
  );
}

/** Platform operator: every audit event across every org, newest first. */
export async function listAllAuditEvents(limit = 100): Promise<Row[]> {
  return asPrivileged(async (tx) =>
    (await tx.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit)).map(auditRow),
  );
}

// ── Launch tokens ────────────────────────────────────────────────────────
export async function createLaunchToken(registeredAppId: string, userId: string, ttlSeconds = 60): Promise<[Row, string]> {
  return scoped(async (tx) => {
    const [rawKey, keyHash] = localKeys.generateApiKey();
    // userId may be the auth id — resolve to the launcher's org-scoped profile.
    const app = await tx.select({ orgId: registeredApps.organizationId }).from(registeredApps).where(eq(registeredApps.id, registeredAppId)).limit(1);
    const profileId = await resolveProfileId(tx, userId, app.length ? app[0].orgId : null);
    const [t] = await tx.insert(appLaunchTokens).values({
      tokenHash: keyHash, registeredAppId, userId: profileId ?? userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    }).returning();
    return [{ id: t.id, token_hash: t.tokenHash, registered_app_id: t.registeredAppId, user_id: t.userId, expires_at: t.expiresAt, used_at: t.usedAt, created_at: t.createdAt }, rawKey] as [Row, string];
  });
}

export async function consumeLaunchToken(rawToken: string): Promise<Row | null> {
  // Launch exchange has no user session yet → privileged.
  return asPrivileged(async (tx) => {
    const tokenHash = localKeys.hashApiKey(rawToken);
    const r = await tx.select().from(appLaunchTokens).where(eq(appLaunchTokens.tokenHash, tokenHash)).limit(1);
    if (!r.length || r[0].usedAt) return null;
    if (r[0].expiresAt && new Date(r[0].expiresAt) < new Date()) return null;
    const [t] = await tx.update(appLaunchTokens).set({ usedAt: new Date() }).where(eq(appLaunchTokens.id, r[0].id)).returning();
    return { id: t.id, token_hash: t.tokenHash, registered_app_id: t.registeredAppId, user_id: t.userId, expires_at: t.expiresAt, used_at: t.usedAt, created_at: t.createdAt };
  });
}

// ── Slice 5b: theme, join codes, org setup, student registration ────────────
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
async function makeCode(tx: Tx, length = 8): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let code = "";
    for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    const hit = await tx.select({ id: joinCodesTable.id }).from(joinCodesTable).where(eq(joinCodesTable.code, code)).limit(1);
    if (!hit.length) return code;
  }
}

const joinCodeRow = (j: typeof joinCodesTable.$inferSelect): Row => ({
  id: j.id, org_id: j.orgId, stage_node_id: j.stageNodeId, program_id: j.programId, code: j.code, kind: j.kind,
  active: j.active, delivery_method: j.deliveryMethod, email: j.email, max_uses: j.maxUses,
  uses_remaining: j.usesRemaining, expires_at: j.expiresAt, created_by_user_id: j.createdByUserId, created_at: j.createdAt,
});

export async function updateOrgTheme(orgId: string, accentColor: string | null | undefined, logoUrl: string | null | undefined): Promise<Row> {
  return scoped(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const settings: Record<string, unknown> = { ...((r[0]?.settings as Record<string, unknown>) ?? {}) };
    const theme: Record<string, unknown> = { ...((settings.theme as Record<string, unknown>) ?? {}) };
    if (accentColor != null) theme.accent_color = accentColor;
    if (logoUrl != null) theme.logo_url = logoUrl;
    settings.theme = theme;
    const [o] = await tx.update(organizations).set({ settings }).where(eq(organizations.id, orgId)).returning();
    return { id: o.id, name: o.name, slug: o.slug, owner_id: o.ownerId, settings: o.settings, created_at: o.createdAt };
  });
}

/** Rename an organization (display name; slug is left untouched so links stay stable). */
export async function updateOrgName(orgId: string, name: string): Promise<Row> {
  return scoped(async (tx) => {
    const [o] = await tx.update(organizations).set({ name }).where(eq(organizations.id, orgId)).returning();
    if (!o) throw new HttpError(404, "Organization not found");
    return { id: o.id, name: o.name, slug: o.slug, owner_id: o.ownerId, settings: o.settings, created_at: o.createdAt };
  });
}

/** Rename a program (display name). */
export async function updateProgramName(programId: string, name: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const [p] = await tx.update(programs).set({ name }).where(eq(programs.id, programId)).returning();
    return p ? programRow(p) : null;
  });
}

// ── Capability envelope (Nexus §3.5 governance — boundary, not content) ─────
// Stored in organizations.settings.capabilities, mirroring the theme pattern.
// Default envelope: a freshly-provisioned org can do everything until an
// operator restricts it (matches "grant default entitlements" at provisioning
// — a locked-out-by-default org would be unusable on day one).
export const DEFAULT_CAPABILITIES = {
  programTypes: { edu: true, game: true },
  offeringTypes: { course: true, challenge: true, app: true },
  // Feature-areas an org may use — the SAME six keys as per-program features,
  // so the Nexus envelope and the org's program config speak one vocabulary.
  // Everything on by default; the operator narrows per org.
  features: { learning: true, bridge: true, appbuilder: true, community: true, teams: true, partners: true },
  // Max programs the org may create; null = unlimited.
  programCapacity: null as number | null,
} as const;

// Older envelopes stored platform-flavored keys — translate on read so a
// previously-set restriction keeps meaning something.
const LEGACY_FEATURE_KEYS: Record<string, string> = { learningPlatform: "learning", appShells: "appbuilder" };
function _normalizeCapFeatures(raw: Row | undefined): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const key = LEGACY_FEATURE_KEYS[k] ?? k;
    if (key in DEFAULT_CAPABILITIES.features) out[key] = v;
  }
  return out;
}

function _capsFromSettings(settings: Record<string, unknown>): Row {
  const caps = (settings.capabilities as Row | undefined) ?? {};
  return {
    programTypes: { ...DEFAULT_CAPABILITIES.programTypes, ...((caps.programTypes as Row) ?? {}) },
    offeringTypes: { ...DEFAULT_CAPABILITIES.offeringTypes, ...((caps.offeringTypes as Row) ?? {}) },
    features: { ...DEFAULT_CAPABILITIES.features, ..._normalizeCapFeatures(caps.features as Row) },
    programCapacity: (caps.programCapacity as number | null | undefined) ?? null,
  };
}

export async function getOrgCapabilities(orgId: string): Promise<Row> {
  return scoped(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!r.length) throw new Error("Organization not found");
    return _capsFromSettings((r[0].settings as Record<string, unknown>) ?? {});
  });
}

export async function setOrgCapabilities(orgId: string, patch: Row): Promise<Row> {
  return scoped(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!r.length) throw new Error("Organization not found");
    const settings: Record<string, unknown> = { ...((r[0].settings as Record<string, unknown>) ?? {}) };
    const existing = _capsFromSettings(settings);
    const merged: Row = {
      programTypes: { ...(existing.programTypes as Row), ...((patch.programTypes as Row) ?? {}) },
      offeringTypes: { ...(existing.offeringTypes as Row), ...((patch.offeringTypes as Row) ?? {}) },
      features: { ...(existing.features as Row), ..._normalizeCapFeatures(patch.features as Row) },
      programCapacity:
        "programCapacity" in patch ? ((patch.programCapacity as number | null) ?? null) : existing.programCapacity,
    };
    settings.capabilities = merged;
    await tx.update(organizations).set({ settings }).where(eq(organizations.id, orgId));
    return merged;
  });
}

// ── Platform settings (Nexus's own branding) ────────────────────────────────
// Boundary/platform data — privileged by nature (no org scope exists).
export async function getPlatformSetting(key: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
    return r.length ? (r[0].value as Row) : null;
  });
}

export async function setPlatformSetting(key: string, value: Row): Promise<Row> {
  return asPrivileged(async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
    return value;
  });
}

/** Switch a program's primary category and/or replace its secondary list. */
export async function updateProgramCategories(
  programId: string,
  patch: { category?: string; secondaryCategories?: string[] },
): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!r.length) return null;
    const primary = patch.category ?? r[0].category;
    const meta: Row = { ...((r[0].metadataJson as Row) ?? {}) };
    if (patch.secondaryCategories !== undefined) {
      meta.secondary_categories = [...new Set(patch.secondaryCategories)].filter((c) => c !== primary);
    } else {
      // keep existing secondaries, but never let one duplicate the new primary
      meta.secondary_categories = (((meta.secondary_categories as string[]) ?? [])).filter((c) => c !== primary);
    }
    const [p] = await tx.update(programs)
      .set({ category: primary, metadataJson: meta })
      .where(eq(programs.id, programId)).returning();
    return p ? programRow(p) : null;
  });
}

/**
 * Program branding (accent/logo/cover) in metadata_json.branding; null clears
 * (revert). `cover` is the card background image on the Programs page — distinct
 * from `logo`, which paints the shell/sidebar.
 */
export async function setProgramBranding(
  programId: string,
  branding: { accent?: string | null; logo?: string | null; cover?: string | null } | null,
): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!r.length) return null;
    const meta: Row = { ...((r[0].metadataJson as Row) ?? {}) };
    if (branding === null) {
      delete meta.branding;
    } else {
      const cur = (meta.branding as Row) ?? {};
      meta.branding = {
        accent: branding.accent !== undefined ? branding.accent : (cur.accent ?? null),
        logo: branding.logo !== undefined ? branding.logo : (cur.logo ?? null),
        cover: branding.cover !== undefined ? branding.cover : (cur.cover ?? null),
      };
    }
    await tx.update(programs).set({ metadataJson: meta }).where(eq(programs.id, programId));
    return (meta.branding as Row) ?? null;
  });
}

// ── Org-defined program categories (Settings → Categories) ──────────────────
// The taxonomy lives in organizations.settings.program_categories. When unset
// (orgs that predate the feature), the effective list derives from categories
// already in use, so nothing ever disappears.
async function _effectiveCategories(tx: Tx, orgId: string): Promise<string[]> {
  const r = await tx.select({ settings: organizations.settings }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);
  const stored = ((r[0]?.settings as Row | undefined)?.program_categories as string[] | undefined) ?? null;
  if (stored) return stored;
  const progs = await tx.select({ category: programs.category }).from(programs).where(eq(programs.orgId, orgId));
  return [...new Set(progs.map((p) => p.category))].sort((a, b) => a.localeCompare(b));
}

async function _saveCategories(tx: Tx, orgId: string, list: string[]): Promise<void> {
  const r = await tx.select({ settings: organizations.settings }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);
  const settings: Row = { ...((r[0]?.settings as Row) ?? {}) };
  settings.program_categories = list;
  await tx.update(organizations).set({ settings }).where(eq(organizations.id, orgId));
}

export async function listOrgCategories(orgId: string): Promise<string[]> {
  return scoped((tx) => _effectiveCategories(tx, orgId));
}

export async function addOrgCategory(orgId: string, name: string): Promise<string[]> {
  return scoped(async (tx) => {
    const list = await _effectiveCategories(tx, orgId);
    if (!list.some((c) => c.toLowerCase() === name.toLowerCase())) list.push(name);
    await _saveCategories(tx, orgId, list);
    return list;
  });
}

/** Remove a category. Refused while any program uses it as PRIMARY; silently
 * stripped from secondaries. */
export async function removeOrgCategory(orgId: string, name: string): Promise<string[]> {
  return scoped(async (tx) => {
    const inUse = await tx.select({ id: programs.id }).from(programs)
      .where(and(eq(programs.orgId, orgId), eq(programs.category, name)));
    if (inUse.length > 0) {
      throw new Error(`${inUse.length} program${inUse.length !== 1 ? "s" : ""} use this as their primary category — reassign them first`);
    }
    const progs = await tx.select().from(programs).where(eq(programs.orgId, orgId));
    for (const p of progs) {
      const meta = { ...((p.metadataJson as Row) ?? {}) };
      const secs = (meta.secondary_categories as string[]) ?? [];
      if (secs.includes(name)) {
        meta.secondary_categories = secs.filter((c) => c !== name);
        await tx.update(programs).set({ metadataJson: meta }).where(eq(programs.id, p.id));
      }
    }
    const list = (await _effectiveCategories(tx, orgId)).filter((c) => c !== name);
    await _saveCategories(tx, orgId, list);
    return list;
  });
}

/** Rename a category everywhere: the stored list, every program's primary, and
 * every secondary list. Renaming onto an existing name merges the two. */
export async function renameOrgCategory(orgId: string, from: string, to: string): Promise<string[]> {
  return scoped(async (tx) => {
    await tx.update(programs).set({ category: to })
      .where(and(eq(programs.orgId, orgId), eq(programs.category, from)));
    const progs = await tx.select().from(programs).where(eq(programs.orgId, orgId));
    for (const p of progs) {
      const meta = { ...((p.metadataJson as Row) ?? {}) };
      const secs = (meta.secondary_categories as string[]) ?? [];
      if (secs.includes(from)) {
        // map from→to, dedupe, and drop a secondary that now equals the primary
        const primary = p.category === from ? to : p.category;
        meta.secondary_categories = [...new Set(secs.map((c) => (c === from ? to : c)))].filter((c) => c !== primary);
        await tx.update(programs).set({ metadataJson: meta }).where(eq(programs.id, p.id));
      }
    }
    const list = [...new Set((await _effectiveCategories(tx, orgId)).map((c) => (c === from ? to : c)))];
    await _saveCategories(tx, orgId, list);
    return list;
  });
}

/**
 * The org's allowed feature-areas (for clamping program features). Reads the
 * org row inside the SAME transaction the caller already holds.
 */
async function _orgFeatureCaps(tx: Tx, orgId: string): Promise<Record<string, boolean>> {
  const r = await tx.select({ settings: organizations.settings }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);
  const caps = _capsFromSettings((r[0]?.settings as Record<string, unknown>) ?? {});
  return caps.features as Record<string, boolean>;
}

/** Effective program features = program's own toggles AND the org envelope. */
function _clampFeatures(features: ProgramFeatures, orgCaps: Record<string, boolean>): ProgramFeatures {
  const out = { ...features };
  for (const k of Object.keys(out) as (keyof ProgramFeatures)[]) {
    if (orgCaps[k] === false) out[k] = false;
  }
  return out;
}

export async function createJoinCode(stageNodeId: string, kind: string, opts: localKeys.JoinCodeOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const s = await tx.select().from(stageNodes).where(eq(stageNodes.id, stageNodeId)).limit(1);
    if (!s.length) throw new Error("Stage not found");
    const code = await makeCode(tx);
    const createdBy = await resolveProfileId(tx, opts.createdByUserId ?? null, s[0].orgId);
    const [j] = await tx.insert(joinCodesTable).values({
      orgId: s[0].orgId, stageNodeId, code, kind,
      deliveryMethod: opts.deliveryMethod ?? "join_code", email: opts.email ?? null,
      maxUses: opts.maxUses ?? null, usesRemaining: opts.maxUses ?? null,
      expiresAt: (opts.expiresAt as unknown as Date) ?? null, createdByUserId: createdBy,
    }).returning();
    return joinCodeRow(j);
  });
}

export async function createProgramJoinCode(programId: string, kind: string, opts: localKeys.JoinCodeOptions = {}): Promise<Row> {
  return scoped(async (tx) => {
    const p = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!p.length) throw new Error("Program not found");
    const code = await makeCode(tx);
    const createdBy = await resolveProfileId(tx, opts.createdByUserId ?? null, p[0].orgId);
    const [j] = await tx.insert(joinCodesTable).values({
      orgId: p[0].orgId, stageNodeId: null, programId, code, kind,
      deliveryMethod: opts.deliveryMethod ?? "join_code", email: opts.email ?? null,
      maxUses: opts.maxUses ?? null, usesRemaining: opts.maxUses ?? null,
      expiresAt: (opts.expiresAt as unknown as Date) ?? null, createdByUserId: createdBy,
    }).returning();
    return joinCodeRow(j);
  });
}

export async function getOrgChallenge(orgId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const orgs = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!orgs.length) return null;
    const ch = await tx.select().from(challenges).where(eq(challenges.orgId, orgId)).limit(1);
    if (!ch.length) return { org_id: orgId, org_name: orgs[0].name, enabled: false, stage_types: [] };
    const cfg = await tx.select().from(challengeStageConfig)
      .where(and(eq(challengeStageConfig.challengeId, ch[0].id), eq(challengeStageConfig.enabled, true)))
      .orderBy(challengeStageConfig.position);
    return { org_id: orgId, org_name: orgs[0].name, enabled: ch[0].enabled ?? false, name: ch[0].name ?? null, stage_types: cfg.map((c) => c.stageType) };
  });
}

export async function setupOrganization(orgId: string, payload: Row): Promise<Row> {
  return scoped(async (tx) => {
    const [ch] = await tx.insert(challenges)
      .values({ orgId, enabled: (payload.has_challenge as boolean) ?? false, name: (payload.challenge_name as string) ?? null })
      .onConflictDoUpdate({ target: challenges.orgId, set: { enabled: (payload.has_challenge as boolean) ?? false, name: (payload.challenge_name as string) ?? null } })
      .returning();
    const challengeId = payload.has_challenge ? ch.id : null;

    if (payload.has_challenge) {
      const stageTypes = (payload.stage_types as string[]) ?? [];
      for (let i = 0; i < stageTypes.length; i++) {
        await tx.insert(challengeStageConfig)
          .values({ challengeId: ch.id, stageType: stageTypes[i], position: i, enabled: true })
          .onConflictDoUpdate({ target: [challengeStageConfig.challengeId, challengeStageConfig.stageType], set: { position: i, enabled: true } });
      }
      const initial = (payload.initial_stages as Row[]) ?? [];
      if (initial.length) {
        const existing = await tx.select({ id: stageNodes.id }).from(stageNodes).where(eq(stageNodes.orgId, orgId)).limit(1);
        if (!existing.length) await insertStageTree(tx, orgId, challengeId, initial, null, "/", 0, null);
      }
    }

    const defaults = (payload.permission_defaults as Record<string, Row>) ?? {};
    for (const [role, cfg] of Object.entries(defaults)) {
      await tx.insert(orgPermissionDefaults)
        .values({ orgId, role, defaultAccess: (cfg.default_access as string) ?? "view", perLevelOverrides: (cfg.per_level_overrides as Record<string, unknown>) ?? {} })
        .onConflictDoUpdate({ target: [orgPermissionDefaults.orgId, orgPermissionDefaults.role], set: { defaultAccess: (cfg.default_access as string) ?? "view", perLevelOverrides: (cfg.per_level_overrides as Record<string, unknown>) ?? {} } });
    }

    if (payload.discord_link) {
      const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      const settings: Record<string, unknown> = { ...((r[0]?.settings as Record<string, unknown>) ?? {}), discord_link: payload.discord_link };
      await tx.update(organizations).set({ settings }).where(eq(organizations.id, orgId));
      await tx.insert(integrations).values({ organizationId: orgId, integrationType: "discord", config: { server_url: payload.discord_link }, permissionLevel: (payload.discord_permission_level as string) || "per_level" });
    }

    for (const prog of (payload.programs as Row[]) ?? []) {
      const [p] = await tx.insert(programs).values({
        orgId, name: prog.name as string, category: prog.category as string,
        description: (prog.description as string) ?? null, icon: (prog.icon as string) ?? null,
        instructorLabel: (prog.instructor_label as string) ?? null, learnerLabel: (prog.learner_label as string) ?? null,
      }).returning();
      if (prog.category === "edu") {
        await insertStageTree(tx, orgId, challengeId, [{ stage_type: (prog.stage_type as string) || "national", name: prog.name }], null, "/", 0, p.id);
      } else {
        const classNames = (prog.class_names as string[]) ?? [];
        if (classNames.length) await insertStageTree(tx, orgId, null, classNames.map((cn) => ({ stage_type: "chapter", name: cn })), null, "/", 0, p.id);
      }
    }
    return { org_id: orgId, challenge_id: challengeId };
  });
}

export async function registerStudent(authUserId: string, joinCodeRowIn: Row, displayName: string | null = null): Promise<Row> {
  // Join-code redemption is a bootstrap (the student isn't a member yet), so it
  // runs privileged — the code itself is the authorization. The student gets an
  // org-scoped profile in the code's org.
  const orgId = joinCodeRowIn.org_id as string;
  const result = await asPrivileged(async (tx) => {
    const profileId = await ensureOrgProfile(tx, authUserId, orgId, { role: "student", displayName });
    if (displayName) await tx.update(profiles).set({ displayName, name: displayName }).where(eq(profiles.id, profileId));
    const [reg] = await tx.insert(studentRegistrations)
      .values({ orgId, stageNodeId: (joinCodeRowIn.stage_node_id as string) ?? null, profileId, joinCodeId: (joinCodeRowIn.id as string) ?? null, currentStageNodeId: (joinCodeRowIn.stage_node_id as string) ?? null })
      .onConflictDoUpdate({ target: [studentRegistrations.profileId, studentRegistrations.orgId], set: { stageNodeId: (joinCodeRowIn.stage_node_id as string) ?? null } })
      .returning();
    return { reg, profileId };
  });
  if (joinCodeRowIn.code) await consumeJoinCodePg((joinCodeRowIn.code as string));
  await bridgeParticipant(result.profileId, joinCodeRowIn);
  const r = result.reg;
  return { id: r.id, org_id: r.orgId, stage_node_id: r.stageNodeId, profile_id: r.profileId, join_code_id: r.joinCodeId, current_stage_node_id: r.currentStageNodeId, registered_at: r.registeredAt };
}

async function consumeJoinCodePg(code: string): Promise<void> {
  await asPrivileged(async (tx) => {
    const r = await tx.select().from(joinCodesTable).where(eq(joinCodesTable.code, code.trim().toUpperCase())).limit(1);
    if (!r.length || r[0].usesRemaining == null) return;
    const remaining = Math.max(0, (r[0].usesRemaining as number) - 1);
    await tx.update(joinCodesTable).set({ usesRemaining: remaining, active: remaining > 0 }).where(eq(joinCodesTable.id, r[0].id));
  });
}

async function bridgeParticipant(profileId: string, joinCodeRowIn: Row): Promise<void> {
  try {
    const programId = joinCodeRowIn.program_id as string | null;
    if (!programId) return;
    const offs = await asPrivileged((tx) => tx.select().from(offerings).where(eq(offerings.programId, programId)));
    if (!offs.length) return;
    const off = offs.find((o) => o.offeringType === "course" || o.offeringType === "class") ?? offs[0];
    await asPrivileged(async (tx) => {
      const existing = await tx.select().from(participants)
        .where(and(eq(participants.offeringId, off.id), eq(participants.userId, profileId), eq(participants.participantType, "learner"))).limit(1);
      if (existing.length) return;
      await tx.insert(participants).values({
        organizationId: joinCodeRowIn.org_id as string, programId, offeringId: off.id,
        stageNodeId: (joinCodeRowIn.stage_node_id as string) ?? null, userId: profileId, participantType: "learner",
      });
    });
  } catch {
    // non-fatal
  }
}

export async function listStudentRegistrationsForStages(orgId: string, visibleStages: StageNode[]): Promise<Row[]> {
  return scoped(async (tx) => {
    const regs = await tx.select().from(studentRegistrations).where(eq(studentRegistrations.orgId, orgId));
    const pids = [...new Set(regs.map((r) => r.profileId))];
    const sids = [...new Set(regs.map((r) => r.stageNodeId).filter((x): x is string => Boolean(x)))];
    const profs = pids.length ? await tx.select().from(profiles).where(inArray(profiles.id, pids)) : [];
    const stages = sids.length ? await tx.select().from(stageNodes).where(inArray(stageNodes.id, sids)) : [];
    const profMap = new Map(profs.map((p) => [p.id, p]));
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const visibleById = new Map(visibleStages.map((s) => [s.id, s]));

    const out: Row[] = [];
    for (const r of regs) {
      const stage = r.stageNodeId ? stageMap.get(r.stageNodeId) : undefined;
      const rowPath = stage?.path ?? "/";
      const inScope = (r.stageNodeId && visibleById.has(r.stageNodeId)) ||
        visibleStages.some((s) => { const norm = s.path.endsWith("/") ? s.path : s.path + "/"; return rowPath === s.path || rowPath.startsWith(norm); });
      if (!inScope) continue;
      const p = profMap.get(r.profileId);
      out.push({
        id: r.id, org_id: r.orgId, stage_node_id: r.stageNodeId, profile_id: r.profileId,
        join_code_id: r.joinCodeId, current_stage_node_id: r.currentStageNodeId, registered_at: r.registeredAt,
        profiles: p ? { email: p.email, display_name: p.displayName, name: p.name } : {},
        stage_nodes: stage ? { name: stage.name, path: stage.path, stage_type: stage.stageType } : {},
      });
    }
    return out;
  });
}
