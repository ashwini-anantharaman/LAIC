/**
 * Program Offering + Registered App admin CRUD, plus the registration approval
 * queue. User-session auth (getCurrentUser) — distinct from routes/hook.ts's
 * app-key auth used by external apps to push signups.
 */

import { Hono } from "hono";

import { getCurrentUser, type PlatformUser } from "../auth";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { isOfferingAdmin } from "../permissions";
import {
  adminAddRegistrationSchema,
  appCreateSchema,
  appUpdateSchema,
  normalizeSignupField,
  offeringCreateSchema,
  offeringUpdateSchema,
  parseBody,
  parsePatch,
} from "../schemas";

type Row = Record<string, any>;

export const offeringsRouter = new Hono();

function _requireOfferingAdmin(user: PlatformUser, orgId: string, programId: string | null): void {
  if (!isOfferingAdmin(user.memberships, orgId, programId)) {
    throw new HttpError(403, "Offering admin access required");
  }
}

function _requireOrgMember(user: PlatformUser, orgId: string): void {
  if (!user.memberships.some((m) => m.org_id === orgId)) {
    throw new HttpError(403, "Not a member of this organization");
  }
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
  _requireOfferingAdmin(user, offering.organization_id, offering.program_id);
  return c.json((await db.listRegistrations(offeringId, status)).map(_registrationResponse));
});

offeringsRouter.post("/offerings/:offering_id/registrations/admin-add", async (c) => {
  const user = await getCurrentUser(c);
  const offeringId = c.req.param("offering_id");
  const req = parseBody(adminAddRegistrationSchema, await c.req.json());
  const offering = await db.getOffering(offeringId);
  if (!offering) throw new HttpError(404, "Offering not found");
  _requireOfferingAdmin(user, offering.organization_id, offering.program_id);

  const profile = await db.getProfileByEmail(req.email);
  const row = await db.createRegistration(offering.organization_id, offeringId, {
    programId: offering.program_id ?? null,
    stageNodeId: req.stage_node_id ?? offering.stage_node_id ?? null,
    registrationSource: "admin_add",
    email: req.email,
    phone: req.phone ?? null,
    name: req.name ?? null,
    age: req.age ?? null,
    userId: profile ? profile.id : null,
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
  _requireOfferingAdmin(user, reg.organization_id, reg.program_id ?? null);
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
  _requireOfferingAdmin(user, reg.organization_id, reg.program_id ?? null);
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
