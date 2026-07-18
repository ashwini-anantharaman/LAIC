/**
 * Program Offering + Registered App admin CRUD, plus the registration approval
 * queue. User-session auth (getCurrentUser) — distinct from routes/hook.ts's
 * app-key auth used by external apps to push signups.
 */

import { Hono } from "hono";
import { z } from "zod";

import { getCurrentUser, type PlatformUser } from "../auth";
import { getSettings } from "../config";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { dbEnabled } from "../db/client";
import * as graph from "../db/orgGraphRepo";
import { isOfferingAdmin } from "../permissions";
import {
  adminAddRegistrationSchema,
  appCreateSchema,
  appUpdateSchema,
  normalizeProgramFeatures,
  normalizeSignupField,
  offeringCreateSchema,
  offeringUpdateSchema,
  parseBody,
  parsePatch,
} from "../schemas";

type Row = Record<string, any>;

export const offeringsRouter = new Hono();

function _requireOfferingAdmin(user: PlatformUser, orgId: string, programId: string | null): void {
  if (user.role === "platform_admin") return;
  if (!isOfferingAdmin(user.memberships, orgId, programId)) {
    throw new HttpError(403, "Offering admin access required");
  }
}

function _requireOrgMember(user: PlatformUser, orgId: string): void {
  if (user.role === "platform_admin") return;
  if (!user.memberships.some((m) => m.org_id === orgId)) {
    throw new HttpError(403, "Not a member of this organization");
  }
}

// Phase 1 people isolation: endpoints that return or mutate PEOPLE (members,
// invitations, registrations, role assignments) refuse the platform operator —
// Nexus governs the org's boundary, never the people inside it. Content
// endpoints (offerings, apps, roles-as-definitions) keep the standard guards.
function _requireOrgPeopleMember(user: PlatformUser, orgId: string): void {
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot access an organization's members");
  }
  _requireOrgMember(user, orgId);
}

function _requireOfferingPeopleAdmin(user: PlatformUser, orgId: string, programId: string | null): void {
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot access an organization's members");
  }
  _requireOfferingAdmin(user, orgId, programId);
}

function _offeringResponse(row: Row): Row {
  return {
    id: row.id,
    organization_id: row.organization_id,
    program_id: row.program_id,
    stage_node_id: row.stage_node_id ?? null,
    name: row.name,
    slug: row.slug,
    offering_type: row.offering_type,
    status: row.status ?? "draft",
    description: row.description ?? null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    registration_open: row.registration_open ?? false,
    approval_mode: row.approval_mode ?? "manual_approve",
    signup_fields: (row.signup_fields ?? []).map(normalizeSignupField),
    platform_module: row.platform_module ?? "nexus_only",
    registered_app_id: row.registered_app_id ?? null,
    external_runtime_url: row.external_runtime_url ?? null,
    participant_label_singular: row.participant_label_singular ?? null,
    participant_label_plural: row.participant_label_plural ?? null,
    metadata: row.metadata ?? {},
    content_package: row.content_package ?? null,
    registration_count: row.registration_count ?? 0,
    pending_count: row.pending_count ?? 0,
    participant_count: row.participant_count ?? 0,
  };
}

function _appResponse(row: Row): Row {
  return {
    id: row.id,
    organization_id: row.organization_id,
    program_id: row.program_id ?? null,
    offering_id: row.offering_id ?? null,
    app_name: row.app_name,
    app_slug: row.app_slug,
    key_prefix: row.key_prefix ?? null,
    allowed_identifiers: row.allowed_identifiers ?? "email",
    status: row.status ?? "active",
    launch_url: row.launch_url ?? null,
    launch_context: row.launch_context ?? {},
  };
}

function _registrationResponse(row: Row): Row {
  return {
    id: row.id,
    organization_id: row.organization_id,
    program_id: row.program_id ?? null,
    offering_id: row.offering_id,
    stage_node_id: row.stage_node_id ?? null,
    registered_app_id: row.registered_app_id ?? null,
    registration_source: row.registration_source ?? "app_hook",
    email: row.email ?? null,
    phone: row.phone ?? null,
    name: row.name ?? null,
    age: row.age ?? null,
    user_id: row.user_id ?? null,
    status: row.status,
    field_data: row.field_data ?? {},
    reviewed_by_user_id: row.reviewed_by_user_id ?? null,
    reviewed_at: row.reviewed_at ?? null,
    created_at: row.created_at,
  };
}

// ── Offerings ────────────────────────────────────────────────────────────
offeringsRouter.get("/programs/:program_id/offerings", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  return c.json((await db.listOfferings(programId)).map(_offeringResponse));
});

offeringsRouter.post("/programs/:program_id/offerings", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const req = parseBody(offeringCreateSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingAdmin(user, program.org_id, programId);
  if (user.role !== "platform_admin" && ["course", "challenge", "app"].includes(req.offering_type)) {
    const caps = await db.getOrgCapabilities(program.org_id);
    if (!(caps.offeringTypes as Row)[req.offering_type]) {
      throw new HttpError(403, `This organization is not permitted to publish '${req.offering_type}' offerings`);
    }
  }
  const row = await db.createOffering(program.org_id, programId, req.name, req.offering_type, {
    slug: req.slug ?? null,
    stageNodeId: req.stage_node_id ?? null,
    description: req.description ?? null,
    startDate: req.start_date ?? null,
    endDate: req.end_date ?? null,
    registrationOpen: req.registration_open,
    approvalMode: req.approval_mode,
    signupFields: req.signup_fields ?? null,
    platformModule: req.platform_module,
    registeredAppId: req.registered_app_id ?? null,
    externalRuntimeUrl: req.external_runtime_url ?? null,
    participantLabelSingular: req.participant_label_singular ?? null,
    participantLabelPlural: req.participant_label_plural ?? null,
    metadata: req.metadata,
  });
  await db.recordAuditEvent("offering.created", {
    orgId: program.org_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: row.id,
    metadata: { name: row.name, offering_type: row.offering_type },
  });
  return c.json(_offeringResponse(row));
});

offeringsRouter.get("/offerings/:offering_id", async (c) => {
  const user = await getCurrentUser(c);
  const row = await db.getOffering(c.req.param("offering_id"));
  if (!row) throw new HttpError(404, "Offering not found");
  _requireOrgMember(user, row.organization_id);
  return c.json(_offeringResponse(row));
});

offeringsRouter.patch("/offerings/:offering_id", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const patch = parsePatch(offeringUpdateSchema, await c.req.json()) as Row;
  const row = await db.getOffering(offeringId);
  if (!row) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id);
  const updated = await db.updateOffering(offeringId, patch);
  await db.recordAuditEvent("offering.updated", {
    orgId: row.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: offeringId,
    metadata: { fields: Object.keys(patch).sort() },
  });
  return c.json(_offeringResponse(updated));
});

offeringsRouter.post("/offerings/:offering_id/publish", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const row = await db.getOffering(offeringId);
  if (!row) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id);
  const updated = await db.setOfferingStatus(offeringId, "open");
  await db.recordAuditEvent("offering.published", {
    orgId: row.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: offeringId,
    metadata: { name: row.name },
  });
  return c.json(_offeringResponse(updated));
});

offeringsRouter.delete("/offerings/:offering_id", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const row = await db.getOffering(offeringId);
  if (!row) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id);
  await db.deleteOffering(offeringId);
  await db.recordAuditEvent("offering.deleted", {
    orgId: row.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: offeringId,
    metadata: { name: row.name, offering_type: row.offering_type },
  });
  return c.json({ ok: true });
});

offeringsRouter.post("/offerings/:offering_id/close", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const row = await db.getOffering(offeringId);
  if (!row) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id);
  const updated = await db.setOfferingStatus(offeringId, "closed");
  await db.recordAuditEvent("offering.closed", {
    orgId: row.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: offeringId,
    metadata: { name: row.name },
  });
  return c.json(_offeringResponse(updated));
});

// ── Registered Apps ──────────────────────────────────────────────────────
offeringsRouter.get("/programs/:program_id/apps", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  return c.json((await db.listRegisteredApps(programId)).map(_appResponse));
});

offeringsRouter.post("/programs/:program_id/apps", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const req = parseBody(appCreateSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingAdmin(user, program.org_id, programId);
  if (user.role !== "platform_admin") {
    const caps = await db.getOrgCapabilities(program.org_id);
    if (!(caps.features as Row).appShells) {
      throw new HttpError(403, "App Shell building isn't enabled for this organization");
    }
  }
  const [row, rawKey] = await db.createRegisteredApp(program.org_id, programId, req.app_name, {
    appSlug: req.app_slug ?? null,
    offeringId: req.offering_id ?? null,
    allowedIdentifiers: req.allowed_identifiers,
    launchUrl: req.launch_url ?? null,
    launchContext: req.launch_context,
  });
  await db.recordAuditEvent("registered_app.created", {
    orgId: program.org_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: programId,
    targetType: "registered_app",
    targetId: row.id,
    metadata: { app_name: row.app_name, app_slug: row.app_slug },
  });
  return c.json({ ..._appResponse(row), api_key: rawKey });
});

offeringsRouter.get("/apps/:app_id", async (c) => {
  const user = await getCurrentUser(c);
  const row = await db.getRegisteredApp(c.req.param("app_id"));
  if (!row) throw new HttpError(404, "App not found");
  _requireOrgMember(user, row.organization_id);
  return c.json(_appResponse(row));
});

offeringsRouter.patch("/apps/:app_id", async (c) => {
  const user = await getCurrentUser(c);
  const appId = c.req.param("app_id");
  const patch = parsePatch(appUpdateSchema, await c.req.json()) as Row;
  const row = await db.getRegisteredApp(appId);
  if (!row) throw new HttpError(404, "App not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id ?? null);
  const updated = await db.updateRegisteredApp(appId, patch);
  await db.recordAuditEvent("registered_app.updated", {
    orgId: row.organization_id,
    actorUserId: user.id,
    targetType: "registered_app",
    targetId: appId,
    metadata: { fields: Object.keys(patch).sort() },
  });
  return c.json(_appResponse(updated));
});

offeringsRouter.post("/apps/:app_id/rotate-key", async (c) => {
  const user = await getCurrentUser(c);
  const appId = c.req.param("app_id");
  const row = await db.getRegisteredApp(appId);
  if (!row) throw new HttpError(404, "App not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id ?? null);
  const [updated, rawKey] = await db.rotateAppApiKey(appId);
  await db.recordAuditEvent("registered_app.key_rotated", {
    orgId: row.organization_id,
    actorUserId: user.id,
    targetType: "registered_app",
    targetId: appId,
    metadata: { app_name: row.app_name },
  });
  return c.json({ ..._appResponse(updated), api_key: rawKey });
});

offeringsRouter.post("/apps/:app_id/revoke", async (c) => {
  const user = await getCurrentUser(c);
  const appId = c.req.param("app_id");
  const row = await db.getRegisteredApp(appId);
  if (!row) throw new HttpError(404, "App not found");
  _requireOfferingAdmin(user, row.organization_id, row.program_id ?? null);
  const updated = await db.revokeApp(appId);
  await db.recordAuditEvent("registered_app.revoked", {
    orgId: row.organization_id,
    actorUserId: user.id,
    targetType: "registered_app",
    targetId: appId,
    metadata: { app_name: row.app_name },
  });
  return c.json(_appResponse(updated));
});

offeringsRouter.get("/apps/:app_id/launch-context", async (c) => {
  const user = await getCurrentUser(c);
  const appId = c.req.param("app_id");
  const row = await db.getRegisteredApp(appId);
  if (!row) throw new HttpError(404, "App not found");
  _requireOrgMember(user, row.organization_id);
  // Entitlement gate: the offering's platform module must be enabled for the org.
  let module = "nexus_only";
  if (row.offering_id) {
    const offering = await db.getOffering(row.offering_id);
    if (offering) module = offering.platform_module ?? "nexus_only";
  }
  if (!(await db.checkModuleAccess(row.organization_id, module))) {
    throw new HttpError(
      403,
      `The ${module} module is disabled for this organization. Enable it in organization settings.`,
    );
  }
  const [tokenRow, rawToken] = await db.createLaunchToken(appId, user.id);
  const membership = user.memberships.find((m) => m.org_id === row.organization_id) ?? null;
  const context = {
    organization_id: row.organization_id,
    program_id: row.program_id ?? null,
    offering_id: row.offering_id ?? null,
    group_id: membership ? membership.stage_node_id : null,
    role: membership ? membership.role : null,
  };
  return c.json({
    app_slug: row.app_slug,
    launch_url: row.launch_url ?? null,
    launch_token: rawToken,
    expires_at: tokenRow.expires_at,
    context,
  });
});

// ── Participants ─────────────────────────────────────────────────────────
offeringsRouter.get("/offerings/:offering_id/participants", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const offering = await db.getOffering(offeringId);
  if (!offering) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, offering.organization_id, offering.program_id);

  const result: Row[] = [];
  for (const p of await db.listParticipants(offeringId)) {
    // Resolve a display name/email: linked profile first, else the
    // registration the participant came from (hook signups often have no
    // Nexus user yet).
    let displayName: string | null = null;
    let email: string | null = null;
    if (p.user_id) {
      const profile = (await db.getProfile(p.user_id)) ?? {};
      displayName = profile.display_name || profile.name || null;
      email = profile.email ?? null;
    }
    if ((!displayName || !email) && p.registration_id) {
      const reg = (await db.getRegistration(p.registration_id)) ?? {};
      displayName = displayName || reg.name || null;
      email = email || reg.email || null;
    }
    result.push({
      id: p.id,
      organization_id: p.organization_id,
      program_id: p.program_id ?? null,
      offering_id: p.offering_id,
      stage_node_id: p.stage_node_id ?? null,
      user_id: p.user_id ?? null,
      participant_type: p.participant_type ?? "learner",
      status: p.status ?? "active",
      registration_id: p.registration_id ?? null,
      display_name: displayName,
      email,
      created_at: p.created_at,
    });
  }
  return c.json(result);
});

// ── Registration admin (approval queue, direct add) ─────────────────────
offeringsRouter.get("/offerings/:offering_id/registrations", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const status = c.req.query("status") ?? null;
  const offering = await db.getOffering(offeringId);
  if (!offering) throw new HttpError(404, "Offering not found");
  _requireOfferingPeopleAdmin(user, offering.organization_id, offering.program_id);
  return c.json((await db.listRegistrations(offeringId, status)).map(_registrationResponse));
});

offeringsRouter.post("/offerings/:offering_id/registrations/admin-add", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const req = parseBody(adminAddRegistrationSchema, await c.req.json());
  const offering = await db.getOffering(offeringId);
  if (!offering) throw new HttpError(404, "Offering not found");
  _requireOfferingPeopleAdmin(user, offering.organization_id, offering.program_id);

  // Org-scoped world: an admin-added person is identified by email until they
  // authenticate into this org (then their org profile links via registration).
  const row = await db.createRegistration(offering.organization_id, offeringId, {
    programId: offering.program_id ?? null,
    stageNodeId: req.stage_node_id ?? offering.stage_node_id ?? null,
    registrationSource: "admin_add",
    email: req.email,
    phone: req.phone ?? null,
    name: req.name ?? null,
    age: req.age ?? null,
    userId: null,
    status: "directly_added",
    fieldData: req.field_data,
    createdByUserId: user.id,
  });
  await db.createParticipant(offering.organization_id, offeringId, {
    programId: offering.program_id ?? null,
    stageNodeId: row.stage_node_id ?? null,
    userId: row.user_id ?? null,
    participantType: req.participant_type,
    addedByUserId: user.id,
    registrationId: row.id,
  });
  await db.recordAuditEvent("registration.admin_added", {
    orgId: offering.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: offeringId,
    targetType: "registration",
    targetId: row.id,
    metadata: { email: req.email, participant_type: req.participant_type },
  });
  return c.json(_registrationResponse(row));
});

offeringsRouter.post("/registrations/:registration_id/approve", async (c) => {
  const user = await getCurrentUser(c);
  const registrationId = c.req.param("registration_id");
  const reg = await db.getRegistration(registrationId);
  if (!reg) throw new HttpError(404, "Registration not found");
  _requireOfferingPeopleAdmin(user, reg.organization_id, reg.program_id ?? null);
  const result = await db.approveRegistration(registrationId, user.id);
  await db.recordAuditEvent("registration.approved", {
    orgId: reg.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: reg.offering_id,
    targetType: "registration",
    targetId: registrationId,
    metadata: { name: reg.name ?? null, email: reg.email ?? null },
  });
  return c.json(_registrationResponse(result.registration));
});

offeringsRouter.post("/registrations/:registration_id/reject", async (c) => {
  const user = await getCurrentUser(c);
  const registrationId = c.req.param("registration_id");
  const reg = await db.getRegistration(registrationId);
  if (!reg) throw new HttpError(404, "Registration not found");
  _requireOfferingPeopleAdmin(user, reg.organization_id, reg.program_id ?? null);
  const result = await db.rejectRegistration(registrationId, user.id);
  await db.recordAuditEvent("registration.rejected", {
    orgId: reg.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: reg.offering_id,
    targetType: "registration",
    targetId: registrationId,
    metadata: { name: reg.name ?? null, email: reg.email ?? null },
  });
  return c.json(_registrationResponse(result));
});

// ── Slice 11: coach-add + bulk import ──────────────────────────────────────
offeringsRouter.post("/groups/:group_id/participants/coach-add", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const groupId = c.req.param("group_id");
  const group = await graph.getGroup(groupId);
  if (!group) throw new HttpError(404, "Group not found");
  _requireOfferingPeopleAdmin(user, group.organization_id as string, (group.program_id as string) ?? null);
  const req = (await c.req.json()) as Row;
  const row = await graph.coachAddParticipant(groupId, user.id, {
    email: req.email ?? null, name: req.name ?? null,
    offeringId: req.offering_id ?? null, participantType: (req.participant_type as string) ?? "learner",
  });
  await db.recordAuditEvent("participant.coach_added", {
    orgId: group.organization_id as string, actorUserId: user.id, scopeType: "group", scopeId: groupId,
    targetType: "participant", targetId: row.id as string, metadata: { email: req.email ?? null },
  });
  return c.json(row);
});

offeringsRouter.post("/offerings/:offering_id/registrations/bulk-import", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const offeringId = c.req.param("offering_id");
  const offering = await db.getOffering(offeringId);
  if (!offering) throw new HttpError(404, "Offering not found");
  _requireOfferingPeopleAdmin(user, offering.organization_id, offering.program_id);
  const req = (await c.req.json()) as { rows?: Array<{ email?: string; name?: string; age?: number; field_data?: Row }> };
  const rows = Array.isArray(req.rows) ? req.rows : [];
  const result = await graph.bulkImportRegistrations(offering.organization_id, offeringId, rows, user.id);
  await db.recordAuditEvent("registration.bulk_imported", {
    orgId: offering.organization_id, actorUserId: user.id, scopeType: "offering", scopeId: offeringId,
    metadata: { count: result.created },
  });
  return c.json(result);
});

// ── Per-program custom roles (§3.5 Team & Roles) ────────────────────────────
const _ACCESS_LEVEL = z.enum(["view", "edit", "comment"]);
const _programRolePerms = z.record(z.string(), _ACCESS_LEVEL);
const programRoleCreateSchema = z.object({ name: z.string().min(1), perms: _programRolePerms.default({}) });
const programRoleUpdateSchema = z.object({ name: z.string().min(1).optional(), perms: _programRolePerms.optional() });

/**
 * A role may only grant access to areas the program has enabled (the org admin's
 * per-program feature config). Perms for disabled features are dropped, so a
 * stale/forged client can never grant an area the program doesn't expose.
 */
function _permsWithinFeatures<V>(perms: Record<string, V>, programFeatures: unknown): Record<string, V> {
  const enabled = normalizeProgramFeatures(programFeatures as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(perms).filter(([area]) => enabled[area as keyof typeof enabled]),
  ) as Record<string, V>;
}

offeringsRouter.get("/programs/:program_id/roles", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  return c.json(await graph.listProgramRoles(programId));
});

offeringsRouter.post("/programs/:program_id/roles", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(programRoleCreateSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingAdmin(user, program.org_id, programId);
  // created_by is provenance only; skip it to avoid the demo-mode auth-id vs
  // profile-id mismatch (the FK targets profiles.id).
  const perms = _permsWithinFeatures(req.perms, program.features);
  const row = await graph.createProgramRole(program.org_id, programId, req.name, perms);
  await db.recordAuditEvent("program.role.created", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { name: req.name },
  });
  return c.json(row);
});

offeringsRouter.patch("/roles/:role_id", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const roleId = c.req.param("role_id");
  const req = parseBody(programRoleUpdateSchema, await c.req.json());
  const existing = await graph.getProgramRole(roleId);
  if (!existing) throw new HttpError(404, "Role not found");
  _requireOfferingAdmin(user, existing.organization_id as string, existing.program_id as string);
  let perms = req.perms;
  if (perms !== undefined) {
    const program = await db.getProgram(existing.program_id as string);
    perms = _permsWithinFeatures(perms, program?.features);
  }
  const row = await graph.updateProgramRole(roleId, { name: req.name, perms });
  await db.recordAuditEvent("program.role.updated", {
    orgId: existing.organization_id as string, actorUserId: user.id, scopeType: "program",
    scopeId: existing.program_id as string, metadata: { name: req.name ?? existing.name },
  });
  return c.json(row);
});

offeringsRouter.delete("/roles/:role_id", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const roleId = c.req.param("role_id");
  const existing = await graph.getProgramRole(roleId);
  if (!existing) throw new HttpError(404, "Role not found");
  _requireOfferingAdmin(user, existing.organization_id as string, existing.program_id as string);
  await graph.deleteProgramRole(roleId);
  await db.recordAuditEvent("program.role.deleted", {
    orgId: existing.organization_id as string, actorUserId: user.id, scopeType: "program",
    scopeId: existing.program_id as string, metadata: { name: existing.name },
  });
  return c.json({ ok: true });
});

// ── Program-administrator assignment (§3.5 delegation) ──────────────────────
// The org-altitude action: name the administrator of a program without the
// org admin having to manage that program's internal roles (those are the
// program admin's own job — see /programs/:id/roles above). Reuses the
// existing invitation mechanism, scoped with role="administrator" + program_id.
offeringsRouter.get("/programs/:program_id/administrators", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgPeopleMember(user, program.org_id);
  const members = (await db.listMembers(program.org_id))
    .filter((m: Row) => m.program_id === programId && (m.role === "administrator" || m.role === "owner"))
    .map((m: Row) => {
      const p = (m.profiles ?? {}) as Row;
      return { email: p.email ?? null, display_name: p.display_name ?? p.name ?? null, role: m.role, status: "active" };
    });
  const invited = dbEnabled()
    ? (await graph.listInvitations(program.org_id))
        .filter((i: Row) => i.status === "pending" && i.program_id === programId && i.role === "administrator")
        .map((i: Row) => ({ email: i.email, display_name: i.display_name ?? null, role: "administrator", status: "invited" }))
    : [];
  return c.json([...members, ...invited]);
});

const assignAdminSchema = z.object({ email: z.string().email(), display_name: z.string().nullish() });

offeringsRouter.post("/programs/:program_id/administrators", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(assignAdminSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  // Org-altitude action: requires org-level access (owner/administrator),
  // NOT program-scoped access — this is how the org assigns a program's admin.
  _requireOfferingPeopleAdmin(user, program.org_id, null);
  const { invitation, token } = await graph.createInvitation(program.org_id, user.id, {
    email: req.email,
    displayName: req.display_name ?? null,
    role: "administrator",
    programId,
  });
  await db.recordAuditEvent("program.administrator.assigned", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email },
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});

// ── Program members + custom-role assignment (§3.5 Team & Roles: People) ────
offeringsRouter.get("/programs/:program_id/members", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgPeopleMember(user, program.org_id);
  return c.json(await graph.listProgramMembers(program.org_id, programId));
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  display_name: z.string().nullish(),
  role_id: z.string().nullish(),
});

offeringsRouter.post("/programs/:program_id/members", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(inviteMemberSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const { invitation, token } = await graph.createInvitation(program.org_id, user.id, {
    email: req.email,
    displayName: req.display_name ?? null,
    role: "instructor",
    programId,
  });
  if (req.role_id) {
    await graph.setProgramRoleAssignment(program.org_id, programId, req.email, req.role_id);
  }
  await db.recordAuditEvent("program.member.invited", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email, role_id: req.role_id ?? null },
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});

const setMemberRoleSchema = z.object({ email: z.string().email(), role_id: z.string().nullable() });

offeringsRouter.put("/programs/:program_id/members/role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(setMemberRoleSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const row = await graph.setProgramRoleAssignment(program.org_id, programId, req.email, req.role_id);
  await db.recordAuditEvent("program.member.role_assigned", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email, role_id: req.role_id },
  });
  return c.json(row ?? { ok: true, cleared: true });
});

// The signed-in member's own custom role in this program (drives the confined
// member view). Program admins/owners get full access regardless — the
// frontend checks membership role first and only confines non-admin members.
offeringsRouter.get("/programs/:program_id/my-role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  if (!user.email) return c.json(null);
  return c.json(await graph.getProgramRoleForEmail(programId, user.email));
});

// ── App Shell config + versions (Phase 4) ───────────────────────────────────
// The working config the editor edits. Loose zod validation on purpose — the
// shape evolves with the editor; the runtime validates strictly on its side.
const shellConfigSchema = z.record(z.string(), z.any());

offeringsRouter.get("/apps/:app_id/config", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const appId = c.req.param("app_id");
  const app = await db.getRegisteredApp(appId);
  if (!app) throw new HttpError(404, "App not found");
  _requireOrgMember(user, app.organization_id);
  const row = await graph.getShellConfig(appId);
  const versions = await graph.listConfigVersions(appId);
  return c.json({
    app_id: appId,
    config: row?.config ?? {},
    latest_version: versions.length ? versions[0].version : null,
    versions: versions.map((v: Row) => ({ version: v.version, created_at: v.created_at })),
  });
});

offeringsRouter.put("/apps/:app_id/config", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const appId = c.req.param("app_id");
  const config = parseBody(shellConfigSchema, await c.req.json());
  const app = await db.getRegisteredApp(appId);
  if (!app) throw new HttpError(404, "App not found");
  _requireOfferingAdmin(user, app.organization_id, app.program_id ?? null);
  const row = await graph.setShellConfig(appId, config);
  return c.json(row);
});

offeringsRouter.post("/apps/:app_id/publish-version", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const appId = c.req.param("app_id");
  const app = await db.getRegisteredApp(appId);
  if (!app) throw new HttpError(404, "App not found");
  _requireOfferingAdmin(user, app.organization_id, app.program_id ?? null);
  const version = await graph.publishConfigVersion(app.organization_id, appId);
  await db.recordAuditEvent("app_shell.version_published", {
    orgId: app.organization_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: app.program_id ?? app.organization_id,
    targetType: "registered_app",
    targetId: appId,
    metadata: { version: version.version },
  });
  return c.json(version);
});

// ── Public app boot config (Phase 4: the real runtime's config source) ──────
// No auth: an app boots BEFORE anyone signs in, exactly like fetching a static
// config file. Serves only the latest PUBLISHED snapshot (never the working
// draft, never keys), adapted to the @laic/app-shell AppShellConfig contract.
function _adaptShellConfig(app: Row, cfg: Row, version: number): Row {
  const identity = (cfg.identity ?? {}) as Row;
  const branding = (cfg.branding ?? {}) as Row;
  const copy = (cfg.copy ?? {}) as Row;
  const auth = (cfg.auth ?? {}) as Row;
  const navigation = ((cfg.navigation ?? []) as Row[]).filter((t) => t.label);
  const onboarding = ((cfg.onboarding ?? []) as Row[]).filter((q) => q.label);
  const KNOWN_METHODS = ["email", "phone", "otp", "google", "apple"];
  const methods = ((auth.methods as string[] | undefined) ?? ["email"]).filter((m) => KNOWN_METHODS.includes(m));
  // All tabs live under the learning module's /learn prefix so the demo
  // runtime always has a mounted module behind the door.
  const tabs = (navigation.length ? navigation : [{ key: "home", label: "Home" }]).map((t, i) => ({
    key: String(t.key ?? `t${i}`),
    label: String(t.label),
    route: i === 0 ? "/learn" : `/learn/${t.key ?? i}`,
  }));
  const homeRoute = tabs[0].route;
  return {
    appId: app.id,
    slug: app.app_slug,
    status: "published",
    version: `${version}.0.0`,
    identity: {
      displayName: (identity.displayName as string) || (app.app_name as string),
      shortName: (identity.shortName as string) || (app.app_name as string),
    },
    programContext: {
      nexusOrgId: app.organization_id,
      programId: app.program_id ?? "",
      offeringId: app.offering_id ?? undefined,
      defaultDomainId: "general",
    },
    branding: {
      primaryColor: (branding.primaryColor as string) || "#4f46e5",
      accentColor: (branding.accentColor as string) || undefined,
      backgroundColor: (branding.backgroundColor as string) || undefined,
      textColor: (branding.textColor as string) || undefined,
      markGlyph: (branding.logoText as string) || undefined,
      scheme: "light",
    },
    copy: {
      welcomeTitle: (copy.welcomeTitle as string) || (app.app_name as string),
      welcomeSubtitle: (copy.welcomeSubtitle as string) || undefined,
      footerText: (copy.footerText as string) || undefined,
    },
    auth: {
      allowedMethods: methods.length ? methods : ["email"],
      requireInviteCode: Boolean(auth.requireInviteCode),
      allowSelfSignup: auth.allowSelfSignup !== false,
      allowAdminEnrollment: false,
    },
    roleButtons: [
      {
        key: "member",
        label: "Get started",
        roleRequested: "learner",
        entryFlow: "signup",
        defaultRouteAfterLogin: homeRoute,
        visible: true,
        sortOrder: 0,
      },
    ],
    onboarding: {
      questions: [
        // The runtime's auth form is fixed (name/email/password), so the
        // shell's EXTRA sign-up fields are collected right after — as
        // onboarding questions — and the registration posts with them.
        ...((cfg.signupFields ?? []) as Row[])
          .filter((f) => f.key && !["name", "email"].includes(String(f.key)))
          .map((f) => ({
            key: String(f.key),
            label: String(f.label ?? f.key),
            type: "text",
            required: Boolean(f.required),
          })),
        ...onboarding.map((q, i) => ({
          key: String(q.key ?? `q${i}`),
          label: String(q.label),
          type: "text",
          required: false,
        })),
      ],
    },
    navigation: { homeRoute, tabs },
    enabledModules: { learning: true },
    featureFlags: {},
    entitlements: { requiredEntitlementKeys: [] },
    build: {
      appVariant: app.app_slug,
      runtimeTemplate: "general-app",
      environment: "dev",
      configFrozenAtBuild: false,
    },
  };
}

offeringsRouter.get("/apps/by-slug/:slug/boot-config", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const app = await graph.getRegisteredAppBySlug(c.req.param("slug"));
  if (!app || app.status !== "active") throw new HttpError(404, "App not found");
  const published = await graph.getPublishedConfig(app.id as string);
  if (!published) throw new HttpError(404, "This app has no published configuration yet");
  return c.json(_adaptShellConfig(app, published.config as Row, published.version as number));
});

// ── Learning Platform launch seam (Phase 5 — placeholder interior) ──────────
// The LP is launched like any registered app: find-or-create its app record
// for this program, mint a single-use launch token, hand back the context.
// Today launch_url is null and the console shows a branded placeholder pane;
// when a real LP lands, set launch_url on the "learning-platform" app and this
// same seam opens it with the token — no console changes.
offeringsRouter.post("/programs/:program_id/learning-platform/launch", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  if (!normalizeProgramFeatures(program.features as Record<string, unknown>).learning) {
    throw new HttpError(403, "The Learning Platform is not enabled for this program");
  }
  if (!(await db.checkModuleAccess(program.org_id, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }

  // Find-or-create the program's LP app record.
  const apps = await db.listRegisteredApps(programId);
  let lp = apps.find((a: Row) => a.app_slug?.startsWith("learning-platform"));
  if (!lp) {
    const [row] = await db.createRegisteredApp(program.org_id, programId, "Learning Platform", {
      appSlug: `learning-platform-${programId.slice(0, 8)}`,
    });
    lp = row;
    await db.recordAuditEvent("learning_platform.provisioned", {
      orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
      targetType: "registered_app", targetId: lp.id,
    });
  }

  const [tokenRow, rawToken] = await db.createLaunchToken(lp.id, user.id);
  const membership = user.memberships.find((m) => m.org_id === program.org_id) ?? null;
  return c.json({
    app_slug: lp.app_slug,
    launch_url: lp.launch_url ?? null,
    launch_token: rawToken,
    expires_at: tokenRow.expires_at,
    context: {
      organization_id: program.org_id,
      program_id: programId,
      program_name: program.name,
      role: membership?.role ?? user.role,
    },
  });
});

// ── Bridge Platform launch seam (placeholder interior) ─────────────────────
// Same seam as the Learning Platform launch: find-or-create the program's Bridge
// app record, mint a single-use launch token, hand back the verified context.
// Gated by the program's `bridge` feature (org-admin config), not an org module.
offeringsRouter.post("/programs/:program_id/bridge-platform/launch", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id);
  if (!normalizeProgramFeatures(program.features as Record<string, unknown>).bridge) {
    throw new HttpError(403, "The Bridge Platform is not enabled for this program");
  }

  // Find-or-create the program's Bridge app record. When BRIDGE_PLATFORM_URL
  // is configured, its launch entry (`/nexus/launch`) becomes the app's
  // launch_url — the console then hands off with a single-use launch token
  // instead of showing the placeholder pane.
  const bridgeBase = getSettings().bridgePlatformUrl;
  const bridgeLaunchUrl = bridgeBase ? `${bridgeBase}/nexus/launch` : null;
  const apps = await db.listRegisteredApps(programId);
  let bridge = apps.find((a: Row) => a.app_slug?.startsWith("bridge-platform"));
  if (!bridge) {
    const [row] = await db.createRegisteredApp(program.org_id, programId, "Bridge Platform", {
      appSlug: `bridge-platform-${programId.slice(0, 8)}`,
      launchUrl: bridgeLaunchUrl,
    });
    bridge = row;
    await db.recordAuditEvent("bridge_platform.provisioned", {
      orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
      targetType: "registered_app", targetId: bridge.id,
    });
  } else if (!bridge.launch_url && bridgeLaunchUrl) {
    // Backfill records provisioned before the env was configured.
    bridge = await db.updateRegisteredApp(bridge.id as string, { launch_url: bridgeLaunchUrl });
  }

  const [tokenRow, rawToken] = await db.createLaunchToken(bridge.id, user.id);
  const membership = user.memberships.find((m) => m.org_id === program.org_id) ?? null;
  return c.json({
    app_slug: bridge.app_slug,
    launch_url: bridge.launch_url ?? null,
    launch_token: rawToken,
    expires_at: tokenRow.expires_at,
    context: {
      organization_id: program.org_id,
      program_id: programId,
      program_name: program.name,
      role: membership?.role ?? user.role,
    },
  });
});
