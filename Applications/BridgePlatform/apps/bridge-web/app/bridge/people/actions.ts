"use server";

// People & Roles server actions: assign/clear a pre-built Bridge role for a
// program member. Nexus authorizes (bridge admin grant) and stores centrally.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { inviteBridgePerson, nexusProgramId, setBridgeRole } from "@/lib/nexusPeople";

export async function setBridgeRoleAction(formData: FormData): Promise<void> {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  const programId = nexusProgramId(context);
  if (!programId) throw new Error("No Nexus program in this context");
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!email) throw new Error("email required");
  await setBridgeRole(programId, email, role === "none" ? null : role);
  revalidatePath("/bridge/people");
}

export async function inviteBridgePersonAction(formData: FormData): Promise<void> {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  const programId = nexusProgramId(context);
  if (!programId) throw new Error("No Nexus program in this context");
  const email = String(formData.get("email") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!email) throw new Error("email required");
  const inv = await inviteBridgePerson(programId, {
    email,
    displayName: displayName || undefined,
    role: role === "none" ? null : role,
  });
  revalidatePath("/bridge/people");
  redirect(`/bridge/people?invited=${encodeURIComponent(inv.redeem_url)}&who=${encodeURIComponent(email)}`);
}
