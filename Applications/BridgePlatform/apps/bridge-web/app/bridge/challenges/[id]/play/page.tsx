// /bridge/challenges/[id]/play — the entry route (spec ADDENDUM A1).
//
// This page renders NOTHING. Tapping a challenge starts or resumes play
// immediately, so the route's whole job is to resolve the viewer's next
// unplayed board, create-or-resume that board's session, and redirect: to the
// table if there is a board left, to the results view once every board is
// behind them. The old "pre-start" screen was deleted from the design and must
// not come back here.
//
// ONE exception, and it is the only reason this route reads searchParams:
// `?board=k&practice=1`, the "replay for practice (unscored)" link the results
// view offers once the challenge is finished. That takes a different door
// (`enterChallengePractice`) because it must NOT touch the play record, the
// pointer or the lock — see entry.ts.

import { notFound, redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { enterChallenge, enterChallengePractice } from "./entry";

export default async function ChallengePlayEntryPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<{ board?: string; practice?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");

  const { id } = await params;
  const { board, practice } = await searchParams;

  // A practice replay names its board; anything unreadable falls back to the
  // ordinary entry rather than guessing which deal was meant.
  const boardNo = Number(board);
  const wantsPractice = practice === "1" && Number.isInteger(boardNo) && boardNo > 0;

  const href = wantsPractice
    ? await enterChallengePractice(id, boardNo, context)
    : await enterChallenge(id, context);
  // No such challenge (or its boards are gone): a 404, never a half-open table.
  if (!href) notFound();
  redirect(href);
}
