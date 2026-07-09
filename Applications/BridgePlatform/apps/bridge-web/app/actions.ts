"use server";

import { findStubUser } from "@bridge/nexus-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_USER_COOKIE, nexusMode } from "@/lib/nexus";

/** Dev-only sign-in: select a seeded stub user (stub mode replaces login). */
export async function setDevUser(formData: FormData) {
  if (nexusMode() !== "stub") {
    throw new Error("Dev user selection is only available in stub mode");
  }
  const devUserId = formData.get("devUserId");
  if (typeof devUserId !== "string" || !findStubUser(devUserId)) {
    throw new Error(`Unknown dev user: ${String(devUserId)}`);
  }
  const cookieStore = await cookies();
  cookieStore.set(DEV_USER_COOKIE, devUserId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/bridge/home");
}

/** Dev-only sign-out: clear the selected stub user. */
export async function clearDevUser() {
  const cookieStore = await cookies();
  cookieStore.delete(DEV_USER_COOKIE);
  redirect("/welcome");
}
