/**
 * Program Offering + Registered App admin CRUD, plus the registration approval
 * queue. User-session auth (getCurrentUser) — distinct from routes/hook.ts's
 * app-key auth used by external apps to push signups.
 */

import { Hono } from "hono";
import { z } from "zod";

import { createAuthUser, getCurrentUser, type PlatformUser } from "../auth";
import { getSettings } from "../config";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { dbEnabled } from "../db/client";
import * as graph from "../db/orgGraphRepo";
import { validGrantsAcross, getCatalogue, type CatalogueRef } from "../accessCatalogue/store";
import { grantableCapabilities } from "../accessCatalogue/resolver";
import { requireCapability } from "../accessCatalogue/enforce";
import { isOfferingAdmin } from "../permissions";
import { platformRoleConfig } from "../platformAccess";
import { BRIDGE_PREBUILT_ROLES } from "../platformAccess";
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

/**
 * Members OR students. Students hold no memberships — their standing is an
 * active learner participant record (the Registrations funnel) — so surfaces
 * a student legitimately uses (the platform launch seams) check both.
 */
async function _requireOrgMemberOrLearner(
  user: PlatformUser,
  orgId: string,
  programId: string | null,
): Promise<void> {
  if (user.role === "platform_admin" || user.memberships.some((m) => m.org_id === orgId)) return;
  if (user.email) {
    const parts = await graph.findLearnerParticipations(user.email, programId).catch(() => [] as Row[]);
    // A program-scoped active learner participation authorizes the launch: the
    // participation is already filtered to THIS program (which belongs to this
    // org), so being its learner IS org standing. This MUST agree with the
    // app's own enrollment check (getMyData uses the same participation lookup);
    // an extra `organization_id === orgId` re-check here can disagree with it
    // (stale/mismatched participant.organization_id) and wrongly 403 a student
    // the app already let in. Fall back to the org match only when no program
    // scopes the request.
    if (programId ? parts.length > 0 : parts.some((p) => p.organization_id === orgId)) return;
  }
  throw new HttpError(403, "Not a member of this organization");
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

// A single program, readable by any member of it (program-scoped admins/members
// included). The org-wide programs list requires ORG-LEVEL staff, so the shell
// can't use it to load a program for a program-scoped person (e.g. a partner
// admin) — this fills that gap so the workspace always knows its program.
offeringsRouter.get("/programs/:program_id", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgMember(user, program.org_id as string);
  return c.json({ ...program, features: normalizeProgramFeatures(program.features as Record<string, unknown>) });
});

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
  // Fine-grained gate (Access Catalogue): only bites for roles that carry
  // capabilities; structural tiers + legacy coarse roles are unaffected.
  await requireCapability(user, { providerId: "program-console", orgId: program.org_id, programId }, "program.offerings.create");
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
    if ((caps.features as Row).appbuilder === false) {
      throw new HttpError(403, "App building isn't enabled for this organization");
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

offeringsRouter.delete("/apps/:app_id", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const appId = c.req.param("app_id");
  const app = await db.getRegisteredApp(appId);
  if (!app) throw new HttpError(404, "App not found");
  // An App Shell is the org's content, not its boundary — deleting one is the
  // org's call. The platform operator is refused outright (people-isolation
  // posture), same as the org's people surfaces.
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot delete an organization's App Shells");
  }
  _requireOfferingAdmin(user, app.organization_id, app.program_id ?? null);
  await graph.deleteRegisteredApp(appId);
  await db.recordAuditEvent("registered_app.deleted", {
    orgId: app.organization_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: app.program_id ?? app.organization_id,
    targetType: "registered_app",
    targetId: appId,
    metadata: { app_name: app.app_name, app_slug: app.app_slug },
  });
  return c.json({ ok: true });
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
  // Directly-added = already approved: grant access now (learners only).
  if (req.participant_type === "learner") {
    await db.grantStudentAccess(row).catch((err) => console.error("admin-add: access grant failed", err));
  }
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

// Remove a participant: deactivate their participant row(s) — access is
// derived from the active row, so this revokes it immediately — and mark the
// registration removed. Distinct from reject (which declines a pending signup);
// remove revokes an already-active student.
offeringsRouter.post("/registrations/:registration_id/remove", async (c) => {
  const user = await getCurrentUser(c);
  const registrationId = c.req.param("registration_id");
  const reg = await db.getRegistration(registrationId);
  if (!reg) throw new HttpError(404, "Registration not found");
  _requireOfferingPeopleAdmin(user, reg.organization_id, reg.program_id ?? null);
  await db.removeRegistrationParticipants(registrationId);
  const updated = await db.setRegistrationStatus(registrationId, "removed", user.id);
  await db.recordAuditEvent("registration.removed", {
    orgId: reg.organization_id,
    actorUserId: user.id,
    scopeType: "offering",
    scopeId: reg.offering_id,
    targetType: "registration",
    targetId: registrationId,
    metadata: { name: reg.name ?? null, email: reg.email ?? null },
  });
  return c.json(_registrationResponse(updated));
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
// ── Program-level participants ──────────────────────────────────────────────
// Students join the PROGRAM — that's the access unit (resolvePlatformAccess
// keys on program_id). These create/list program-scoped participants
// (offering_id null); the offering admin-add above stays as optional finer-
// grained course enrollment.
const programInviteSchema = z.object({ email: z.string().email(), name: z.string().nullish() });

offeringsRouter.get("/programs/:program_id/participant-registrations", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  return c.json((await db.listRegistrationsByProgram(programId)).map(_registrationResponse));
});

offeringsRouter.post("/programs/:program_id/participants", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const req = parseBody(programInviteSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const reg = await db.createRegistration(program.org_id, null, {
    programId,
    registrationSource: "admin_add",
    email: req.email,
    name: req.name ?? null,
    userId: null,
    status: "directly_added",
    createdByUserId: user.id,
  });
  await db.createProgramParticipant(program.org_id, programId, {
    userId: reg.user_id ?? null,
    participantType: "learner",
    addedByUserId: user.id,
    registrationId: reg.id,
  });
  await db.grantStudentAccess(reg).catch((err) => console.error("program invite: grant failed", err));
  await db.recordAuditEvent("program.participant_invited", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "registration", targetId: reg.id, metadata: { email: req.email },
  });
  return c.json(_registrationResponse(reg));
});

// ── Gates: program entrance pages at /@/<org-slug>/<gate-slug> ──────────────
const _gateSlugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const gateWriteSchema = z.object({
  slug: z.string().optional(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  audience: z.enum(["participant", "member"]).optional(),
  role_id: z.string().nullish(),
  role_ids: z.array(z.string()).optional(),
  allow_signin: z.boolean().optional(),
  allow_signup: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  landing: z.string().nullish(),
  /**
   * Which PLATFORMS a sign-up through this gate joins, and with which role:
   * { "bridge": "bridge_learner", "learning": "student" }. Signing up then
   * writes a platform role assignment per entry, so the person appears under
   * that platform's People with a real role (not just in Registrations).
   * Omitted/empty = registration only (pre-existing behavior).
   */
  platform_roles: z.record(z.string(), z.string()).optional(),
});

/** Validate a gate's platform→role map against each platform's assignable
 *  roles. Unknown platform or non-assignable role is a 400 — a gate must not
 *  advertise a grant the resolver would refuse. */
function _validatePlatformRoles(map: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!map) return undefined;
  const out: Record<string, string> = {};
  for (const [platform, role] of Object.entries(map)) {
    const cfg = platformRoleConfig(platform);
    if (!cfg) throw new HttpError(400, `Unknown platform "${platform}"`);
    if (!cfg.assignable.includes(role)) {
      throw new HttpError(
        400,
        `"${role}" is not an assignable ${platform} role (choose one of: ${cfg.assignable.join(", ")})`,
      );
    }
    out[platform] = role;
  }
  return out;
}

offeringsRouter.get("/programs/:program_id/gates", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  return c.json(await graph.listGates(programId));
});

offeringsRouter.post("/programs/:program_id/gates", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const req = parseBody(gateWriteSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const slug = _gateSlugify(req.slug || req.title || "gate") || "gate";
  try {
    const platformRoles = _validatePlatformRoles(req.platform_roles);
    const gate = await graph.createGate(program.org_id, programId, {
      slug, title: req.title ?? null, subtitle: req.subtitle ?? null,
      audience: req.audience, roleId: req.role_id ?? null, roleIds: req.role_ids,
      allowSignin: req.allow_signin, allowSignup: req.allow_signup,
      approvalRequired: req.approval_required, landing: req.landing ?? null,
      ...(platformRoles ? { config: { platform_roles: platformRoles } } : {}),
    });
    await db.recordAuditEvent("gate.created", {
      orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
      targetType: "gate", targetId: gate.id as string, metadata: { slug },
    });
    return c.json(gate);
  } catch (e) {
    if (String(e).includes("gates_org_slug_idx") || String(e).toLowerCase().includes("duplicate")) {
      throw new HttpError(409, `A gate with the address "${slug}" already exists in this organization`);
    }
    throw e;
  }
});

offeringsRouter.patch("/gates/:gate_id", async (c) => {
  const user = await getCurrentUser(c);
  const gateId = c.req.param("gate_id");
  const patch = parsePatch(gateWriteSchema, await c.req.json()) as Row;
  const gate = await graph.getGate(gateId);
  if (!gate) throw new HttpError(404, "Gate not found");
  _requireOfferingPeopleAdmin(user, gate.organization_id as string, gate.program_id as string);
  if (typeof patch.slug === "string") patch.slug = _gateSlugify(patch.slug);
  // Platform grants live in the gate's config jsonb; merge so editing them
  // doesn't drop unrelated config (branding/copy overrides).
  if (patch.platform_roles !== undefined) {
    const validated = _validatePlatformRoles(patch.platform_roles as Record<string, string>);
    patch.config = {
      ...((gate.config as Row | undefined) ?? {}),
      platform_roles: validated ?? {},
    };
    delete patch.platform_roles;
  }
  return c.json(await graph.updateGate(gateId, patch));
});

offeringsRouter.delete("/gates/:gate_id", async (c) => {
  const user = await getCurrentUser(c);
  const gateId = c.req.param("gate_id");
  const gate = await graph.getGate(gateId);
  if (!gate) throw new HttpError(404, "Gate not found");
  _requireOfferingPeopleAdmin(user, gate.organization_id as string, gate.program_id as string);
  await graph.deleteGate(gateId);
  await db.recordAuditEvent("gate.deleted", {
    orgId: gate.organization_id as string, actorUserId: user.id, scopeType: "program",
    scopeId: gate.program_id as string, targetType: "gate", targetId: gateId, metadata: {},
  });
  return c.json({ ok: true });
});

// Public pre-auth render config for a gate (like boot-config). No auth.
offeringsRouter.get("/gates/by-path/:org_slug/:gate_slug", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getPublicGate(c.req.param("org_slug"), c.req.param("gate_slug"));
  if (!gate) throw new HttpError(404, "Gate not found");
  return c.json(gate);
});

// Partner gate — resolved by the PARTNER's own slug (/partner/<slug>/<gate>).
offeringsRouter.get("/gates/partner/:partner_slug/:gate_slug", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getPublicPartnerGate(c.req.param("partner_slug"), c.req.param("gate_slug"));
  if (!gate) throw new HttpError(404, "Gate not found");
  return c.json(gate);
});

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
  if (((req.participant_type as string) ?? "learner") === "learner" && req.email) {
    await db
      .grantStudentAccess({
        organization_id: group.organization_id,
        program_id: (group.program_id as string) ?? null,
        email: req.email,
        name: req.name ?? null,
        user_id: null,
        stage_node_id: null,
      })
      .catch((err) => console.error("coach-add: access grant failed", err));
  }
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
  // Auto-approve offerings: imported rows are already active students — grant
  // each one access (pending-review offerings grant at approval instead).
  if (offering.approval_mode === "auto_approve") {
    for (const r of rows) {
      if (!r.email) continue;
      await db
        .grantStudentAccess({
          organization_id: offering.organization_id,
          program_id: offering.program_id ?? null,
          email: r.email,
          name: r.name ?? null,
          user_id: null,
          stage_node_id: null,
        })
        .catch((err) => console.error("bulk-import: access grant failed", err));
    }
  }
  await db.recordAuditEvent("registration.bulk_imported", {
    orgId: offering.organization_id, actorUserId: user.id, scopeType: "offering", scopeId: offeringId,
    metadata: { count: result.created },
  });
  return c.json(result);
});

// ── Per-program custom roles (§3.5 Team & Roles) ────────────────────────────
// Platform areas: learning grants "administrator" as a single toggle; bridge
// grants one of the pre-built Bridge roles (the picker). Other areas keep the
// graded view/edit/comment levels.
const _ACCESS_LEVEL = z.enum(["view", "edit", "comment", "administrator"]);
const _BRIDGE_ROLE = z.enum(BRIDGE_PREBUILT_ROLES);
// perms.capabilities (fine-grained capability ids) rides inside this same blob
// (see _permsWithCapabilities / the capabilities fold below) and round-trips
// through the client on every edit, so the value union must accept it too.
const _programRolePerms = z.record(z.string(), z.union([_ACCESS_LEVEL, _BRIDGE_ROLE, z.array(z.string())]));
// Roles now exist at three altitudes: program (org+program set), organization
// (program null), and nexus (both null). The guard follows the scope.
function _requireScopedRoleAdmin(user: PlatformUser, role: Row): void {
  if (!role.organization_id) {
    if (user.role !== "platform_admin") throw new HttpError(403, "Nexus operator access required");
    return;
  }
  _requireOfferingAdmin(user, role.organization_id as string, (role.program_id as string) ?? null);
}

const programRoleCreateSchema = z.object({
  name: z.string().min(1),
  perms: _programRolePerms.default({}),
  display_as_group: z.boolean().optional(),
  parent_group_id: z.string().uuid().nullable().optional(),
  // Fine-grained capability ids from the Access Catalogue (additive; stored in
  // perms.capabilities). Coarse area perms above are untouched.
  capabilities: z.array(z.string()).optional(),
});
const programRoleUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  perms: _programRolePerms.optional(),
  display_as_group: z.boolean().optional(),
  parent_group_id: z.string().uuid().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
});

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

// Platform areas provisioned "Partial" cap what their roles may grant. Drop any
// learning/bridge capability the program (intersected with the org envelope)
// didn't provision. Full/unrestricted platforms pass through untouched.
const _FEATURE_ACCESS_PROVIDER: Record<string, "learning" | "bridge"> = { learning: "learning", bridge: "bridge" };
async function _clampCapsToProvisioning(program: Record<string, unknown>, capabilities: string[]): Promise<string[]> {
  const featureAccess = (program.feature_access as Record<string, { capabilities?: string[] }> | null) ?? {};
  const enabled = normalizeProgramFeatures(program.features as Record<string, unknown>);
  const orgCaps = await db.getOrgCapabilities(program.org_id as string).catch(() => null);
  const orgAccess = (orgCaps?.featureAccess as Record<string, { capabilities?: string[] }> | undefined) ?? {};
  // The allowed set for one platform key: program partial ∩ org partial (either
  // absent = no restriction from that level). null = fully unrestricted.
  const allowedFor = (key: string): Set<string> | null => {
    const prog = featureAccess[key]?.capabilities;
    const org = orgAccess[key]?.capabilities;
    if (prog && org) return new Set(prog.filter((c) => org.includes(c)));
    if (prog) return new Set(prog);
    if (org) return new Set(org);
    return null;
  };
  const platformCapSets: Record<string, Set<string>> = {};
  const platformAllowed: Record<string, Set<string> | null> = {};
  for (const key of Object.keys(_FEATURE_ACCESS_PROVIDER)) {
    platformCapSets[key] = new Set(grantableCapabilities(await getCatalogue(_FEATURE_ACCESS_PROVIDER[key])));
    platformAllowed[key] = allowedFor(key);
  }
  return capabilities.filter((id) => {
    for (const key of Object.keys(_FEATURE_ACCESS_PROVIDER)) {
      if (platformCapSets[key].has(id)) {
        // A DISABLED platform grants nothing, regardless of any stale caps sent.
        if (enabled[key as keyof typeof enabled] === false) return false;
        const allowed = platformAllowed[key];
        return allowed ? allowed.has(id) : true;
      }
    }
    return true; // not a platform capability → unaffected
  });
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
  const validCaps = req.capabilities !== undefined
    ? await _clampCapsToProvisioning(
        program,
        await validGrantsAcross(
          [{ providerId: "program-console", instanceId: programId }, { providerId: "learning" }, { providerId: "bridge" }],
          req.capabilities,
        ),
      )
    : undefined;
  const finalPerms: Record<string, unknown> =
    validCaps !== undefined ? { ...perms, capabilities: validCaps } : perms;
  const row = await graph.createProgramRole(
    program.org_id, programId, req.name, finalPerms, null, req.display_as_group, req.parent_group_id,
  );
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
  _requireScopedRoleAdmin(user, existing);
  let perms: Record<string, unknown> | undefined = req.perms;
  // Only program-scoped roles are clamped to program features; org/nexus roles
  // use a different (free-form) permission vocabulary and must pass through.
  if (perms !== undefined && existing.program_id) {
    const program = await db.getProgram(existing.program_id as string);
    perms = _permsWithinFeatures(perms, program?.features);
  }
  // Fold fine-grained capabilities into perms without wiping the area perms.
  if (req.capabilities !== undefined) {
    const refs: CatalogueRef[] = existing.program_id
      ? [{ providerId: "program-console", instanceId: existing.program_id as string }, { providerId: "learning" }, { providerId: "bridge" }]
      : existing.organization_id
        ? [{ providerId: "org-console", instanceId: existing.organization_id as string }]
        : [{ providerId: "nexus-console" }];
    let validCaps = await validGrantsAcross(refs, req.capabilities);
    // Program roles: also clamp to the program's Partial provisioning envelope.
    if (existing.program_id) {
      const program = await db.getProgram(existing.program_id as string);
      if (program) validCaps = await _clampCapsToProvisioning(program, validCaps);
    }
    const base = (perms ?? (existing.perms as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    perms = { ...base, capabilities: validCaps };
  }
  const row = await graph.updateProgramRole(roleId, {
    name: req.name, perms, displayAsGroup: req.display_as_group, parentGroupId: req.parent_group_id,
  });
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
  _requireScopedRoleAdmin(user, existing);
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
      return {
        membership_id: m.id, invitation_id: null as string | null,
        email: p.email ?? null, display_name: p.display_name ?? p.name ?? null, role: m.role, status: "active",
      };
    });
  const invited = dbEnabled()
    ? (await graph.listInvitations(program.org_id))
        .filter((i: Row) => i.status === "pending" && i.program_id === programId && i.role === "administrator")
        .map((i: Row) => ({
          membership_id: null as string | null, invitation_id: i.id,
          email: i.email, display_name: i.display_name ?? null, role: "administrator", status: "invited",
        }))
    : [];
  return c.json([...members, ...invited]);
});

const assignAdminSchema = z.object({ email: z.string().email(), display_name: z.string().nullish() });

// Invite = immediate membership (no pending/accept step). The person becomes an
// active member of the program right away, with an account created if they
// didn't have one. A new account gets a shared dev password (returned so the
// admin can pass it along) until the real reset flow lands.
const DEFAULT_MEMBER_PASSWORD = "NexusDev2026!";
async function _enrollActiveMember(
  orgId: string,
  programId: string,
  opts: { email: string; displayName?: string | null; membershipRole: string; roleId?: string | null },
): Promise<{ email: string; created: boolean }> {
  const email = opts.email.trim().toLowerCase();
  const existing = await db.getProfileByEmail(email);
  let authId: string;
  let created = false;
  if (existing) {
    authId = (existing.auth_user_id as string) ?? (existing.id as string);
  } else {
    authId = (await createAuthUser(email, DEFAULT_MEMBER_PASSWORD)).id as string;
    created = true;
  }
  const profileId = await db.ensureOrgProfile(authId, orgId, { email, role: "teacher", displayName: opts.displayName ?? null });
  const members = await db.listMembers(orgId).catch(() => [] as Row[]);
  const existingMembership = members.find(
    (m) => m.profile_id === profileId && ((m.program_id as string | null) ?? null) === programId,
  );
  if (!existingMembership) {
    await db.addMembership(orgId, profileId, opts.membershipRole, null, "edit", programId);
  } else if (existingMembership.role !== opts.membershipRole) {
    // PROMOTE (or demote) an existing member rather than silently doing nothing.
    // Previously this branch was `if (!already) add…`, so appointing an
    // administrator who was already a plain member was a no-op: the console
    // reported success while memberships.role stayed "member". That is why a
    // custom program role named "admin" looked like the only way to do it —
    // custom roles never touch memberships.role, so nothing downstream (this
    // app's coach/learner split included) could see it.
    await db.updateMemberRole(existingMembership.id as string, opts.membershipRole);
  }
  if (opts.roleId) {
    await graph.setProgramRoleAssignment(orgId, programId, email, opts.roleId).catch((e) => console.error("enroll role:", e));
  }
  return { email, created };
}

offeringsRouter.post("/programs/:program_id/administrators", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(assignAdminSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  // Super Admin only. isOfferingAdmin() treats any administrator whose
  // stage_node_id is null as org-level, so a PROGRAM-scoped administrator
  // (e.g. a Club 1 admin) passed it and could appoint peers. Adding an
  // administrator is the org owner's act alone — the mirror of the
  // owner-only rule on administrator REMOVAL.
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot access an organization's members");
  }
  if (!user.memberships.some((m) => m.org_id === program.org_id && m.role === "owner" && !m.program_id)) {
    throw new HttpError(403, "Only the Super Admin can add an administrator");
  }
  const result = await _enrollActiveMember(program.org_id, programId, {
    email: req.email, displayName: req.display_name ?? null, membershipRole: "administrator",
  });
  await db.recordAuditEvent("program.administrator.assigned", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email },
  });
  return c.json({ active: true, email: result.email, created: result.created, temp_password: result.created ? DEFAULT_MEMBER_PASSWORD : null });
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

offeringsRouter.get("/programs/:program_id/members/summary", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgPeopleMember(user, program.org_id);
  return c.json(await graph.listProgramTeamSummary(program.org_id, programId));
});

offeringsRouter.get("/programs/:program_id/members/group", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgPeopleMember(user, program.org_id);
  const platform = c.req.query("platform");
  const role = c.req.query("role");
  if (!platform || !role) throw new HttpError(400, "platform and role required");
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));
  return c.json(await graph.listPlatformGroupMembers(program.org_id, programId, platform, role, offset, limit));
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  display_name: z.string().nullish(),
  role_id: z.string().nullish(),
  /** Explicit group placement (real groups); role-groups are implicit. */
  group_ids: z.array(z.string()).optional(),
});

offeringsRouter.post("/programs/:program_id/members", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(inviteMemberSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const result = await _enrollActiveMember(program.org_id, programId, {
    email: req.email, displayName: req.display_name ?? null, membershipRole: "instructor", roleId: req.role_id ?? null,
  });
  if (req.group_ids) {
    await graph.setPersonGroups(program.org_id, programId, req.email, req.group_ids);
  }
  await db.recordAuditEvent("program.member.added", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email, role_id: req.role_id ?? null },
  });
  return c.json({ active: true, email: result.email, created: result.created, temp_password: result.created ? DEFAULT_MEMBER_PASSWORD : null });
});

// Link-based program invitation (the true system): creates a PENDING invitation
// and returns an activation link (`/invite/:token`). The person opens it at the
// org portal, creates their account + sets their OWN password, and accepts —
// then they're a program member. Optionally pre-assigns a role, stored
// email-keyed so it takes effect on acceptance. `platform` selects which role
// system the role_id belongs to (program | learning | bridge).
const programLinkInviteSchema = z.object({
  email: z.string().email(),
  display_name: z.string().nullish(),
  platform: z.enum(["program", "learning", "bridge"]).optional(),
  role_id: z.string().nullish(),
  group_ids: z.array(z.string()).optional(),
});

offeringsRouter.post("/programs/:program_id/invite", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(programLinkInviteSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  const { invitation, token } = await graph.createInvitation(program.org_id, user.id, {
    email: req.email, displayName: req.display_name ?? null, role: "member", programId,
  });
  // Pre-assign the chosen role email-keyed (applies when they accept).
  if (req.role_id) {
    const platform = req.platform ?? "program";
    if (platform === "learning") {
      await graph.setLearningRoleAssignment(program.org_id, programId, req.email, req.role_id).catch((e) => console.error("invite learning role:", e));
    } else if (platform === "bridge") {
      await graph.setPlatformRoleAssignment(program.org_id, programId, "bridge", req.email, req.role_id, user.id).catch((e) => console.error("invite bridge role:", e));
    } else {
      await graph.setProgramRoleAssignment(program.org_id, programId, req.email, req.role_id).catch((e) => console.error("invite program role:", e));
    }
  }
  // Groups are email-keyed too — pre-place them for when they accept.
  if (req.group_ids?.length) {
    await graph.setPersonGroups(program.org_id, programId, req.email, req.group_ids).catch((e) => console.error("invite groups:", e));
  }
  await db.recordAuditEvent("program.member.invited", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email, platform: req.platform ?? "program", role_id: req.role_id ?? null },
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

// ── Groups vs Roles: the People-tab groups model + explicit placement ───────
offeringsRouter.get("/programs/:program_id/groups-model", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOrgPeopleMember(user, program.org_id);
  return c.json(await graph.listProgramGroupsModel(program.org_id, programId));
});

const setMemberGroupsSchema = z.object({ email: z.string().email(), group_ids: z.array(z.string()) });

offeringsRouter.put("/programs/:program_id/members/groups", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const req = parseBody(setMemberGroupsSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireOfferingPeopleAdmin(user, program.org_id, programId);
  await graph.setPersonGroups(program.org_id, programId, req.email, req.group_ids);
  await db.recordAuditEvent("program.member.groups_set", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email: req.email, group_ids: req.group_ids },
  });
  return c.json({ ok: true });
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
  // Direct org members resolve their own program role below. A PARTNER-org
  // member (not in this program's org) instead inherits their org's affiliation
  // grant — a catalog-based gated view of the program (see Partners).
  const isOrgMember = user.role === "platform_admin" || user.memberships.some((m) => m.org_id === program.org_id);
  if (!isOrgMember) {
    const orgIds = [...new Set(user.memberships.map((m) => m.org_id as string))];
    const partner = await graph.getActivePartnerAccessForOrgs(programId, orgIds).catch(() => null);
    if (!partner) throw new HttpError(403, "Not a member of this organization");
    return c.json({
      role_id: null,
      role_name: "Partner access",
      perms: { ...(partner.access.perms ?? {}), capabilities: partner.access.capabilities ?? [] },
      bridge_role: null,
      learning_role: null,
      partner: true,
    });
  }
  if (!user.email) return c.json(null);
  // A person's effective grants = their custom program role (Team & Roles)
  // merged with platform-role assignments made inside the platforms (e.g.
  // Bridge People & Roles). The merge is what makes a Bridge-assigned learner
  // see (and auto-launch into) the Bridge card even with "No role" here.
  const role = await graph.getProgramRoleForEmail(programId, user.email);
  // Merge in platform-role assignments (made inside each platform's own People
  // & Roles UI). This is what makes a platform-assigned member see (and
  // auto-launch into) that platform's card even with "No role" in Team & Roles.
  const perms = { ...((role?.perms as Record<string, unknown>) ?? {}) };
  let anyPlatformRole = false;
  for (const platform of ["bridge", "learning"]) {
    const assigned = await graph.getPlatformRoleForEmail(programId, platform, user.email).catch(() => null);
    if (assigned) {
      perms[platform] = assigned;
      anyPlatformRole = true;
    }
  }
  // A custom Learning role (the learning app's own People tab, stored in
  // learning_role_assignments) also grants the Learning platform — surface it
  // as perms.learning so Nexus shows the Learning card and auto-launches a
  // learning-only member, just like a prebuilt assignment.
  if (!perms.learning) {
    const lr = await graph.getLearningRoleForEmail(programId, user.email).catch(() => null);
    if (lr) {
      const lp = (lr.perms as Record<string, string>) ?? {};
      perms.learning = Object.values(lp).includes("edit") ? "edit" : "view";
      anyPlatformRole = true;
    }
  }
  if (!role && !anyPlatformRole) return c.json(null);
  return c.json({
    role_id: role?.role_id ?? null,
    role_name: role?.role_name ?? null,
    perms,
    // Convenience mirrors (perms already carries these).
    bridge_role: (perms.bridge as string) ?? null,
    learning_role: (perms.learning as string) ?? null,
  });
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

const CONTENT_PLATFORMS = ["learning", "bridge"];

/**
 * The content section (App Shell Studio, 2026-07): which platforms this app's
 * launch cards connect to. Read from the Studio's dialect (`cfg.studio.content`)
 * or a top-level `content` key; unknown platforms are dropped, shape is
 * normalized so the runtime never sees a malformed connection.
 */
function _adaptContentSection(cfg: Row): Row | null {
  const studio = (cfg.studio ?? {}) as Row;
  const raw = (studio.content ?? cfg.content ?? null) as Row | null;
  if (!raw || !Array.isArray(raw.connections)) return null;
  const connections = (raw.connections as Row[])
    .filter((c) => CONTENT_PLATFORMS.includes(String(c.platform)))
    .map((c) => ({
      platform: String(c.platform),
      enabled: Boolean(c.enabled),
      label: String(c.label ?? ""),
      description: String(c.description ?? ""),
    }));
  return { sectionTitle: String(raw.sectionTitle ?? ""), connections };
}

function _adaptShellConfig(app: Row, cfg: Row, version: number, org?: { slug: string; name: string } | null): Row {
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
    // The org's public door — what the Player needs for org-scoped login.
    org: org ? { slug: org.slug, name: org.name } : null,
    // Content section: the platform launch cards (null when none configured).
    content: _adaptContentSection(cfg),
    // The Studio's full config dialect, verbatim — the Player renders from
    // this when present (branding/labels only; the record never holds keys).
    studio: (cfg.studio as Row | undefined) ?? null,
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
  const org = await graph.getOrgPublicIdentity(app.organization_id as string);
  const adapted = _adaptShellConfig(app, published.config as Row, published.version as number, org);
  // "Create an account" target: the Studio's explicit URL wins; otherwise auto-
  // resolve the program's participant sign-up gate so the link works without the
  // author pasting a URL. Null when the program has no public sign-up gate.
  const studio = adapted.studio as Row | null;
  const explicitUrl = (studio?.signupGateUrl as string | undefined) || null; // legacy manual override
  const chosenSlug = (studio?.signupGateSlug as string | undefined) || null; // gate picked in the Studio
  let signupGateUrl: string | null = explicitUrl;
  const programId = app.program_id as string | null;
  // Only an EXPLICITLY chosen gate is used — no auto-pick. No choice → no link.
  if (!signupGateUrl && chosenSlug && programId && org?.slug) {
    const gates = await graph.listGates(programId).catch(() => [] as Row[]);
    const gate = gates.find((g) => g.slug === chosenSlug && g.allow_signup);
    if (gate) {
      const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
      signupGateUrl = `${base}/@/${org.slug}/${gate.slug}`;
    }
  }
  return c.json({ ...adapted, signupGateUrl });
});

// ── App Shell per-user data (Phase 2): a student's onboarding answers ────────
// The published app reads/writes ITS OWN data for the signed-in student. Access
// is gated on active participation in the app's PROGRAM (not just the org), so a
// participant of a different program in the same org can't enter this app.
const appUserDataSchema = z.object({
  answers: z.record(z.string(), z.any()).default({}),
  onboarding_completed: z.boolean().optional(),
});

/** The onboarding questions the app published (for required-answer validation). */
function _onboardingQuestions(cfg: Row): Array<{ prompt?: string; required?: boolean }> {
  const studio = (cfg.studio ?? {}) as Row;
  const fromStudio = studio.onboardingQuestions as Array<Row> | undefined;
  const fromRecord = cfg.onboarding as Array<Row> | undefined;
  return (fromStudio ?? fromRecord ?? []) as Array<{ prompt?: string; required?: boolean }>;
}

offeringsRouter.get("/apps/:slug/me/data", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const app = await graph.getRegisteredAppBySlug(c.req.param("slug"));
  if (!app || app.status !== "active") throw new HttpError(404, "App not found");
  const programId = (app.program_id as string | null) ?? null;
  // Enrolled? Active participant of THIS program. (200 with enrolled:false so
  // the app can show a clean "not enrolled" screen rather than an error.)
  const parts = programId && user.email ? await graph.findLearnerParticipations(user.email, programId).catch(() => []) : [];
  if (!parts.length) return c.json({ enrolled: false, onboarding_completed: false, answers: {} });
  const data = await graph.getAppUserData(app.id as string, user.id);
  return c.json({
    enrolled: true,
    onboarding_completed: Boolean(data?.onboarding_completed),
    answers: (data?.answers as Row) ?? {},
  });
});

offeringsRouter.put("/apps/:slug/me/data", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const app = await graph.getRegisteredAppBySlug(c.req.param("slug"));
  if (!app || app.status !== "active") throw new HttpError(404, "App not found");
  const programId = (app.program_id as string | null) ?? null;
  const parts = programId && user.email ? await graph.findLearnerParticipations(user.email, programId).catch(() => []) : [];
  if (!parts.length) throw new HttpError(403, "You're not enrolled in this program.");

  const req = parseBody(appUserDataSchema, await c.req.json());
  const completing = req.onboarding_completed ?? false;
  // When marking onboarding complete, every REQUIRED question must be answered.
  if (completing) {
    const published = await graph.getPublishedConfig(app.id as string);
    const questions = published ? _onboardingQuestions(published.config as Row) : [];
    const missing = questions.some((q, i) => {
      if (!q.required) return false;
      const v = (req.answers as Row)[String(i)];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });
    if (missing) throw new HttpError(400, "Please answer all required questions.");
  }
  const saved = await graph.upsertAppUserData({
    registeredAppId: app.id as string,
    userId: user.id,
    orgId: app.organization_id as string,
    programId,
    answers: req.answers as Row,
    onboardingCompleted: completing,
  });
  return c.json({ enrolled: true, ...saved });
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
  // Students can't read program rows under RLS — fall back to the privileged
  // access-check read (the guard below still decides whether they may launch).
  const program = (await db.getProgram(programId)) ?? (await graph.getProgramForAccess(programId));
  if (!program) throw new HttpError(404, "Program not found");
  await _requireOrgMemberOrLearner(user, program.org_id, programId);
  if (!normalizeProgramFeatures(program.features as Record<string, unknown>).learning) {
    throw new HttpError(403, "The Learning Platform is not enabled for this program");
  }
  if (!(await db.checkModuleAccess(program.org_id, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }

  // When LEARNING_PLATFORM_URL is configured, the app origin becomes the
  // registered app's launch_url, so the console does the real token handoff
  // instead of showing the placeholder pane (mirror of Bridge). The helper
  // find-or-creates the app record and backfills launch_url when the env
  // arrives after provisioning.
  const learningBase = getSettings().learningPlatformUrl;
  const launch = await graph.mintPlatformLaunch({
    orgId: program.org_id as string,
    programId,
    appName: "Learning Platform",
    slugPrefix: "learning-platform",
    launchUrl: learningBase || null,
    launcherAuthId: user.id,
  });
  if (launch.created) {
    await db.recordAuditEvent("learning_platform.provisioned", {
      orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
      targetType: "registered_app", targetId: launch.app.id as string,
    });
  }
  const membership = user.memberships.find((m) => m.org_id === program.org_id) ?? null;
  return c.json({
    app_slug: launch.app.app_slug,
    // Current env's LEARNING_PLATFORM_URL is authoritative (see Bridge note);
    // a stored launch_url can be stale across dev/prod.
    launch_url: learningBase || (launch.app.launch_url ?? null),
    launch_token: launch.rawToken,
    expires_at: launch.expiresAt,
    context: {
      organization_id: program.org_id,
      program_id: programId,
      program_name: program.name,
      role: membership?.role ?? "student",
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
  // Students can't read program rows under RLS — fall back to the privileged
  // access-check read (the guard below still decides whether they may launch).
  const program = (await db.getProgram(programId)) ?? (await graph.getProgramForAccess(programId));
  if (!program) throw new HttpError(404, "Program not found");
  await _requireOrgMemberOrLearner(user, program.org_id, programId);
  if (!normalizeProgramFeatures(program.features as Record<string, unknown>).bridge) {
    throw new HttpError(403, "The Bridge Platform is not enabled for this program");
  }

  // Find-or-create the program's Bridge app record. When BRIDGE_PLATFORM_URL
  // is configured, its launch entry (`/nexus/launch`) becomes the app's
  // launch_url — the console then hands off with a single-use launch token
  // instead of showing the placeholder pane.
  const bridgeBase = getSettings().bridgePlatformUrl;
  const launch = await graph.mintPlatformLaunch({
    orgId: program.org_id as string,
    programId,
    appName: "Bridge Platform",
    slugPrefix: "bridge-platform",
    launchUrl: bridgeBase ? `${bridgeBase}/nexus/launch` : null,
    launcherAuthId: user.id,
  });
  if (launch.created) {
    await db.recordAuditEvent("bridge_platform.provisioned", {
      orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
      targetType: "registered_app", targetId: launch.app.id as string,
    });
  }
  const membership = user.memberships.find((m) => m.org_id === program.org_id) ?? null;
  return c.json({
    app_slug: launch.app.app_slug,
    // The current env's BRIDGE_PLATFORM_URL is authoritative for where the launch
    // lands — a stored launch_url can be stale (e.g. a prod Vercel URL provisioned
    // earlier while you now run Bridge locally). Fall back to stored only if unset.
    launch_url: bridgeBase ? `${bridgeBase}/nexus/launch` : (launch.app.launch_url ?? null),
    launch_token: launch.rawToken,
    expires_at: launch.expiresAt,
    context: {
      organization_id: program.org_id,
      program_id: programId,
      program_name: program.name,
      role: membership?.role ?? "student",
    },
  });
});
