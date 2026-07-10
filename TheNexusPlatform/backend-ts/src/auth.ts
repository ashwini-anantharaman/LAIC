/** Supabase Auth JWT verification and platform user context. */

import type { Context } from "hono";

import { HttpError } from "./httpError";
import type { Membership } from "./permissions";
import { useLocal } from "./platformDb";
import * as local from "./platformLocalStore";
import { createEphemeralClient, requireAdminClient, requireClient } from "./supabaseClient";

type Row = Record<string, any>;

export interface PlatformUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  memberships: Membership[];
}

// Test hook mirroring FastAPI's `app.dependency_overrides[get_current_user]`.
let _currentUserOverride: (() => PlatformUser | Promise<PlatformUser>) | null = null;
export function setCurrentUserOverride(
  fn: (() => PlatformUser | Promise<PlatformUser>) | null,
): void {
  _currentUserOverride = fn;
}

function _rowToMembership(row: Row, stageRow?: Row | null): Membership {
  return {
    id: row.id,
    org_id: row.org_id,
    profile_id: row.profile_id,
    role: row.role,
    stage_node_id: row.stage_node_id ?? null,
    access: row.access ?? "view",
    stage_path: stageRow ? stageRow.path ?? null : null,
    stage_type: stageRow ? stageRow.stage_type ?? null : null,
  };
}

export async function verifyToken(token: string): Promise<{ id: string; email: string }> {
  const client = requireAdminClient();
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user) {
      throw new HttpError(401, "Invalid token");
    }
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    throw new HttpError(401, "Invalid token");
  }
}

export async function loadPlatformUser(userId: string, email: string): Promise<PlatformUser> {
  if (await useLocal()) {
    const profile = local.localGetProfile(userId);
    if (!profile) throw new HttpError(404, "Profile not found");
    const membershipRows = local.localGetMemberships(userId);
    const stageMap = new Map<string, Row>();
    for (const m of membershipRows) {
      const orgId = m.org_id;
      if (orgId) {
        for (const s of local.localListStageNodes(orgId)) stageMap.set(s.id, s as unknown as Row);
      }
    }
    const memberships = membershipRows.map((m) =>
      _rowToMembership(m, m.stage_node_id ? stageMap.get(m.stage_node_id) : null),
    );
    return {
      id: userId,
      email: email || profile.email || "",
      display_name: profile.display_name || profile.name || null,
      role: profile.role || "student",
      memberships,
    };
  }

  const client = requireClient();

  const { data: profiles } = await client.from("profiles").select("*").eq("id", userId).limit(1);
  if (!profiles || profiles.length === 0) throw new HttpError(404, "Profile not found");

  const profile = profiles[0];
  const { data: membershipRows0 } = await client
    .from("org_memberships")
    .select("*")
    .eq("profile_id", userId);
  const membershipRows = membershipRows0 ?? [];

  const stageIds = membershipRows.filter((m) => m.stage_node_id).map((m) => m.stage_node_id);
  const stageMap = new Map<string, Row>();
  if (stageIds.length) {
    const { data: stages } = await client.from("stage_nodes").select("*").in("id", stageIds);
    for (const s of stages ?? []) stageMap.set(s.id, s);
  }

  const memberships = membershipRows.map((m) =>
    _rowToMembership(m, m.stage_node_id ? stageMap.get(m.stage_node_id) : null),
  );

  return {
    id: userId,
    email: email || profile.email || "",
    display_name: profile.display_name || profile.name || null,
    role: profile.role || "student",
    memberships,
  };
}

function _bearer(c: Context): string | null {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

export async function getCurrentUser(c: Context): Promise<PlatformUser> {
  if (_currentUserOverride) return _currentUserOverride();
  const token = _bearer(c);
  if (!token) throw new HttpError(401, "Authentication required");
  const auth = await verifyToken(token);
  return loadPlatformUser(auth.id, auth.email);
}

export async function getOptionalUser(c: Context): Promise<PlatformUser | null> {
  if (_currentUserOverride) return _currentUserOverride();
  const token = _bearer(c);
  if (!token) return null;
  try {
    const auth = await verifyToken(token);
    return await loadPlatformUser(auth.id, auth.email);
  } catch (exc) {
    if (exc instanceof HttpError) return null;
    throw exc;
  }
}

export async function createAuthUser(email: string, password: string): Promise<Row> {
  const client = requireAdminClient();
  try {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data || !data.user) throw new HttpError(400, "Failed to create user");
    return { id: data.user.id, email: data.user.email ?? email };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    const msg = exc instanceof Error ? exc.message : String(exc);
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("duplicate")) {
      throw new HttpError(409, "Email already registered");
    }
    throw new HttpError(400, `Signup failed: ${msg}`);
  }
}

export async function signInUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string; access_token: string }> {
  // Ephemeral client so login never overwrites the admin client's service-role session.
  const client = createEphemeralClient();
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data || !data.session || !data.user) {
      throw new HttpError(401, "Invalid credentials");
    }
    return {
      id: data.user.id,
      email: data.user.email ?? email,
      access_token: data.session.access_token,
    };
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    throw new HttpError(401, "Invalid credentials");
  }
}
