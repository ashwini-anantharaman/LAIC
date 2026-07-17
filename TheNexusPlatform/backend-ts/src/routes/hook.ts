/**
 * The Signup Hook — apps push registrations here using a per-app API key.
 *
 * Distinct from routes/platform.ts (user-session auth) and routes/offerings.ts
 * (admin CRUD, also user-session auth): every endpoint here authenticates via
 * getAuthenticatedApp — a Registered App's API key, not a user token.
 */

import { Hono } from "hono";
import type { Context } from "hono";

import { getAuthenticatedApp, type AuthenticatedApp } from "../auth";
import { getSettings } from "../config";
import { dbEnabled } from "../db/client";
import * as graph from "../db/orgGraphRepo";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { allowRequest } from "../rateLimit";
import { hookRegistrationSchema, normalizeSignupField, parseBody } from "../schemas";

type Row = Record<string, any>;

export const hookRouter = new Hono();

/** Authenticate the app, then apply a per-app rate limit (v0.4 §31). */
async function _authAndLimit(c: Context): Promise<AuthenticatedApp> {
  const app = await getAuthenticatedApp(c);
  if (!allowRequest(`hook:${app.id}`, getSettings().hookRateLimitPerMin, 60_000)) {
    throw new HttpError(429, "Rate limit exceeded — too many hook requests, slow down");
  }
  return app;
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

async function _resolveOffering(app: AuthenticatedApp, offeringId: string): Promise<Row> {
  const offering = await db.getOffering(offeringId);
  if (!offering || offering.organization_id !== app.organization_id) {
    throw new HttpError(404, "Offering not found");
  }
  if (app.offering_id && app.offering_id !== offeringId) {
    throw new HttpError(403, "This app is not registered for that offering");
  }
  return offering;
}

function _validateFieldData(offering: Row, fieldData: Row): void {
  for (const f of offering.signup_fields ?? []) {
    if (f.required && !fieldData[f.key]) {
      throw new HttpError(400, `Missing required field: ${f.key}`);
    }
  }
}

function _requireQuery(c: { req: { query: (k: string) => string | undefined } }, key: string): string {
  const value = c.req.query(key);
  if (value === undefined) {
    throw new HttpError(422, [
      { loc: ["query", key], msg: "Field required", type: "missing" },
    ]);
  }
  return value;
}

hookRouter.get("/signup-fields", async (c) => {
  const app = await _authAndLimit(c);
  const appSlug = _requireQuery(c, "appSlug");
  const offeringId = _requireQuery(c, "offeringId");
  if (appSlug !== app.app_slug) {
    throw new HttpError(403, "App slug does not match the provided API key");
  }
  const offering = await _resolveOffering(app, offeringId);
  // Signup fields: the App Shell config wins when the app defines them (the
  // shell's Sign-up & Login tab IS the app's signup screen — Phase 4 §3.4);
  // fall back to the offering's own fields otherwise.
  let fields = (offering.signup_fields ?? []) as Row[];
  if (dbEnabled()) {
    const shell = await graph.getShellConfig(app.id);
    const shellFields = ((shell?.config as Row | undefined)?.signupFields ?? null) as Row[] | null;
    if (Array.isArray(shellFields) && shellFields.length > 0) fields = shellFields;
  }
  return c.json({
    offering_id: offering.id,
    offering_name: offering.name,
    registration_open: offering.registration_open ?? false,
    fields: fields.map(normalizeSignupField),
  });
});

hookRouter.post("/registrations", async (c) => {
  const app = await _authAndLimit(c);
  const req = parseBody(hookRegistrationSchema, await c.req.json());
  const offering = await _resolveOffering(app, req.offering_id);
  if (
    !offering.registration_open ||
    !(offering.status === "open" || offering.status === "private_beta")
  ) {
    throw new HttpError(400, "This offering is not accepting registrations");
  }

  if (app.allowed_identifiers === "email" && !req.email) {
    throw new HttpError(400, "This app requires an email");
  }
  if (app.allowed_identifiers === "phone" && !req.phone) {
    throw new HttpError(400, "This app requires a phone number");
  }

  const fieldData: Row = { ...(req.field_data ?? {}) };
  if (!("name" in fieldData)) fieldData.name = req.name ?? null;
  if (!("age" in fieldData)) fieldData.age = req.age ?? null;
  if (!("email" in fieldData)) fieldData.email = req.email ?? null;
  _validateFieldData(offering, fieldData);

  let row = await db.createRegistration(app.organization_id, offering.id, {
    programId: offering.program_id ?? null,
    stageNodeId: offering.stage_node_id ?? null,
    registeredAppId: app.id,
    registrationSource: "app_hook",
    email: req.email ?? null,
    phone: req.phone ?? null,
    name: req.name ?? null,
    age: req.age ?? null,
    fieldData,
    status: "pending_review",
  });

  await db.recordAuditEvent("registration.hook_received", {
    orgId: app.organization_id,
    scopeType: "offering",
    scopeId: offering.id,
    targetType: "registration",
    targetId: row.id,
    metadata: { app_slug: app.app_slug, name: req.name ?? null, email: req.email ?? null },
  });

  if (offering.approval_mode === "auto_approve") {
    const result = await db.approveRegistration(row.id, null);
    row = result.registration;
    await db.recordAuditEvent("registration.approved", {
      orgId: app.organization_id,
      scopeType: "offering",
      scopeId: offering.id,
      targetType: "registration",
      targetId: row.id,
      metadata: { auto: true, app_slug: app.app_slug },
    });
  }

  return c.json(_registrationResponse(row));
});

hookRouter.get("/registrations/:registration_id", async (c) => {
  const app = await _authAndLimit(c);
  const row = await db.getRegistration(c.req.param("registration_id"));
  if (!row || row.organization_id !== app.organization_id) {
    throw new HttpError(404, "Registration not found");
  }
  return c.json(_registrationResponse(row));
});
