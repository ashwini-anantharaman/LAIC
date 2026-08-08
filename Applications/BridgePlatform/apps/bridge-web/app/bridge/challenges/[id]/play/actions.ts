"use server";

// The same entry as the /play route, as a server action — so a challenges-list
// card can POST "start or resume" from a form instead of navigating first
// (ADDENDUM A1: the card tap IS the start). One resolver behind both, so the
// one-attempt/resume-only rule cannot differ between the two doors.

import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { requireContext } from "@/lib/api";
import { enterChallenge } from "./entry";

export async function enterChallengeAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.challenges");
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  if (!challengeId) redirect("/bridge/challenges");

  const href = await enterChallenge(challengeId, context);
  redirect(href ?? "/bridge/challenges");
}
