"use server";

// Test access-catalogue experiment: write the COMPILED capability-set matrix
// straight to the live program-wide catalogue. Same store, same audit action,
// same layout revalidation as the real editor at /bridge/teams — the only
// difference is where the rules came from (a set assignment, compiled down).

import {
  ACCESS_FEATURES,
  ALL_BRIDGE_ROLES,
  GLOBAL_CATALOGUE_ID,
} from "@bridge/access";
import type { BridgeRole } from "@laic/learner-contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessStore, canEditCatalogue } from "@/lib/access";
import { AccessError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";

const KNOWN_KEYS = new Set(ACCESS_FEATURES.map((f) => f.key));
const KNOWN_ROLES = new Set<string>(ALL_BRIDGE_ROLES);
const DEFAULT_BY_KEY = new Map(ACCESS_FEATURES.map((f) => [f.key, f.defaultRoles]));

/** Roles differ from the feature default (order-independent set compare). */
function differsFromDefault(roles: readonly BridgeRole[], defaults: readonly BridgeRole[]): boolean {
  if (roles.length !== defaults.length) return true;
  const set = new Set(defaults);
  return roles.some((r) => !set.has(r));
}

/**
 * Validate an untrusted compiled ruleset: every key must be a known registry
 * key and every role a known BridgeRole. Rejects anything else — the live
 * catalogue only ever holds real keys/roles.
 */
function parseRules(raw: unknown): Record<string, BridgeRole[]> {
  if (typeof raw !== "string") throw new AccessError("Missing compiled rules");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccessError("Compiled rules are not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AccessError("Compiled rules must be an object");
  }
  const rules: Record<string, BridgeRole[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) throw new AccessError(`Unknown feature key: ${key}`);
    if (!Array.isArray(value)) throw new AccessError(`Roles for ${key} must be an array`);
    for (const role of value) {
      if (typeof role !== "string" || !KNOWN_ROLES.has(role)) {
        throw new AccessError(`Unknown role for ${key}: ${String(role)}`);
      }
    }
    rules[key] = value as BridgeRole[];
  }
  return rules;
}

/** Write the compiled capability-set matrix to the live catalogue (audited). */
export async function applyCompiledAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  if (!canEditCatalogue(context)) throw new AccessError("Cannot edit access catalogue");

  const rules = parseRules(formData.get("rules"));

  let changed = 0;
  for (const [key, roles] of Object.entries(rules)) {
    if (differsFromDefault(roles, DEFAULT_BY_KEY.get(key) ?? [])) changed += 1;
  }

  await accessStore().putCatalogue({
    catalogueId: GLOBAL_CATALOGUE_ID,
    rules,
    updatedBy: context.nexusUserId,
    updatedAt: new Date().toISOString(),
  });
  await audit(context, "access.catalogue.update", "access_catalogue", GLOBAL_CATALOGUE_ID, {
    source: "test-page",
    changed,
  });
  revalidatePath("/", "layout");
  redirect("/bridge/test-access-catalogue?applied=1");
}
