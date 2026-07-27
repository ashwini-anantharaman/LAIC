"use server";

// Teams & Roles server actions — capability-bound custom roles, assignment,
// invite, and "Test as", all authorized by the caller's Nexus session
// (bridge-admin) and stored centrally in Nexus. Mirrors the learning app.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { inviteBridgePerson, nexusProgramId, removeBridgePerson, setBridgeRole } from "@/lib/nexusPeople";
import { createBridgeRole, deleteBridgeRole, testAsPerson, updateBridgeRole } from "@/lib/nexusBridgeRoles";

async function requireAdminProgramId(): Promise<string> {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  if (!context.is_admin) throw new Error("Bridge admin access required");
  const programId = nexusProgramId(context);
  if (!programId) throw new Error("No Nexus program in this context");
  return programId;
}

export async function createRoleAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Role name required");
  const capabilities = formData.getAll("cap").map(String).filter(Boolean);
  await createBridgeRole(programId, { name, capabilities });
  revalidatePath("/bridge/teams");
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) throw new Error("roleId required");
  const name = String(formData.get("name") ?? "").trim();
  const capabilities = formData.getAll("cap").map(String).filter(Boolean);
  await updateBridgeRole(programId, roleId, { name: name || undefined, capabilities });
  revalidatePath("/bridge/teams");
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) throw new Error("roleId required");
  await deleteBridgeRole(programId, roleId);
  revalidatePath("/bridge/teams");
}

export async function assignRoleAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!email) throw new Error("email required");
  await setBridgeRole(programId, email, role === "none" ? null : role);
  revalidatePath("/bridge/teams");
}

export async function inviteAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email) throw new Error("email required");
  const inv = await inviteBridgePerson(programId, {
    email,
    displayName: displayName || undefined,
    role: role === "none" ? null : role,
  });
  revalidatePath("/bridge/teams");
  // Share the activation link — the person sets their own password at the org
  // portal and accepts; their role applies on acceptance.
  redirect(`/bridge/teams?invited=${encodeURIComponent(inv.redeem_url)}&who=${encodeURIComponent(email)}`);
}

export async function removePersonAction(formData: FormData): Promise<void> {
  const programId = await requireAdminProgramId();
  const email = String(formData.get("email") ?? "");
  if (!email) throw new Error("email required");
  await removeBridgePerson(programId, email);
  revalidatePath("/bridge/teams");
}

export async function testAsAction(formData: FormData): Promise<void> {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  if (!context.is_admin) throw new Error("Bridge admin access required");
  const email = String(formData.get("email") ?? "");
  if (!email) throw new Error("email required");
  await testAsPerson(email, context.laicOrgId ?? null);
  redirect("/bridge/home");
}
