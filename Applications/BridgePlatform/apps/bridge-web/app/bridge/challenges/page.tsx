import type { Challenge, ChallengeInvite } from "@bridge/challenges";
import Link from "next/link";
import { redirect } from "next/navigation";
import { respondInviteAction } from "./actions";
import { SCORING_OPTIONS, STANDINGS_OPTIONS } from "./draft";
import { canCreateChallenge, requireFeature } from "@/lib/access";
import {
  challengeViewerAccess,
  listChallengesForUser,
  listInvitesForUser,
  type ChallengeViewerAccess,
} from "@/lib/challenges";
import { getBridgeContext } from "@/lib/nexus";

const scoringLabel = (key: string) =>
  SCORING_OPTIONS.find((s) => s.key === key)?.full ?? key;
const standingsLabel = (key: string) =>
  STANDINGS_OPTIONS.find((s) => s.key === key)?.label ?? key;

interface Row {
  challenge: Challenge;
  invite: ChallengeInvite | undefined;
  access: ChallengeViewerAccess;
}

/**
 * The challenges list (ADDENDUM A1). There is no challenge landing page:
 * tapping a card starts or resumes the next unplayed board, or opens the
 * results once you have finished them all. A pending invite opens nothing —
 * its Accept / Decline live on the card itself.
 */
export default async function ChallengesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ created?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");
  const canCreate = await canCreateChallenge(context);
  const { created, error } = await searchParams;

  const userId = context.nexusUserId;
  const [challenges, invites] = await Promise.all([
    listChallengesForUser(userId),
    listInvitesForUser(userId),
  ]);
  const inviteFor = new Map(invites.map((i) => [i.challengeId, i]));
  const rows: Row[] = await Promise.all(
    challenges.map(async (challenge) => ({
      challenge,
      invite: inviteFor.get(challenge.challengeId),
      access: await challengeViewerAccess(challenge.challengeId, userId),
    })),
  );

  const pending = rows.filter((r) => r.invite?.status === "pending");
  const accepted = rows.filter((r) => r.access.viewerAccepted);
  const playing = accepted.filter(
    (r) => !r.access.viewerFinished && r.challenge.status === "open",
  );
  const finished = accepted.filter(
    (r) => r.access.viewerFinished || r.challenge.status === "archived",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Challenges</h1>
          <p className="mt-1 text-sm text-neutral-600">
            The same boards, the same seat, BEN in the other three. Play them
            through, then see where you finished.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/bridge/challenges/new"
            className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            New challenge
          </Link>
        )}
      </header>

      {/* The entry route refuses to start a board it cannot play honestly (no
          BEN endpoint = no challenge play, spec §2) and sends the reason here.
          Saying so beats a card that silently does nothing when tapped. */}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {created && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <span className="font-semibold">{created}</span> created — invites are
          out, and a silent BEN baseline is on its way for every board.
        </p>
      )}

      {rows.length === 0 && (
        <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-5 py-10 text-center">
          <p className="text-sm font-medium text-neutral-700">
            No challenges yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            When someone invites you, the invitation lands here. {canCreate
              ? "Or build one yourself — 1 to 16 boards, your scoring, your table rules."
              : ""}
          </p>
          {canCreate && (
            <Link
              href="/bridge/challenges/new"
              className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Create a challenge
            </Link>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <Section title="Invited" count={pending.length} hint="Accept to open it.">
          {pending.map((row) => (
            <InviteCard key={row.challenge.challengeId} row={row} />
          ))}
        </Section>
      )}

      {playing.length > 0 && (
        <Section title="Yours" count={playing.length} hint="In progress.">
          {playing.map((row) => (
            <PlayCard key={row.challenge.challengeId} row={row} />
          ))}
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="Finished" count={finished.length}>
          {finished.map((row) => (
            <PlayCard key={row.challenge.challengeId} row={row} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: Readonly<{
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}>) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
          {title}
        </h2>
        <span className="text-[11px] font-semibold text-neutral-400">{count}</span>
        {hint && <span className="text-[11px] text-neutral-400">· {hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

/** Title, creator, boards, scoring — the shared top half of every card. */
function CardFacts({ row }: Readonly<{ row: Row }>) {
  const { challenge, access } = row;
  return (
    <>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug text-neutral-900">
          {challenge.title}
        </h3>
        {challenge.editorBadge && (
          <span
            title="The creator opened the pack editor — they have seen the hands"
            className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-draft"
          >
            &lt;&gt; set the boards
          </span>
        )}
      </div>
      {challenge.description && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-neutral-600">
          {challenge.description}
        </p>
      )}
      <p className="mt-1.5 text-xs text-neutral-500">
        {challenge.createdByName ?? challenge.createdBy} ·{" "}
        {access.totalBoards || "?"} board{access.totalBoards === 1 ? "" : "s"} ·{" "}
        {scoringLabel(challenge.scoring)}
        {challenge.standingsVisibility === "always" &&
          ` · standings ${standingsLabel("always").toLowerCase()}`}
      </p>
    </>
  );
}

/** Your progress through the boards — a rule that fills as you finish them. */
function Progress({ access }: Readonly<{ access: ChallengeViewerAccess }>) {
  const total = Math.max(access.totalBoards, 1);
  const pct = Math.round((access.finishedBoards / total) * 100);
  return (
    <div className="mt-3">
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">
        {access.finishedBoards} of {access.totalBoards}{" "}
        {access.totalBoards === 1 ? "board" : "boards"} played
        {access.viewerIsModerator && " · moderator"}
      </p>
    </div>
  );
}

/**
 * A pending invite. Nothing here navigates into the challenge — the whole card
 * is inert until Accept has been pressed (ADDENDUM A1).
 */
function InviteCard({ row }: Readonly<{ row: Row }>) {
  const { challenge } = row;
  return (
    <article className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <CardFacts row={row} />
      <p className="mt-2 text-xs text-neutral-600">
        Invited by {row.invite?.invitedBy === challenge.createdBy
          ? (challenge.createdByName ?? "the creator")
          : (row.invite?.invitedBy ?? "a moderator")}
        {row.invite?.moderator && " · you would join as a moderator"}
      </p>
      <div className="mt-3 flex gap-2">
        <form action={respondInviteAction}>
          <input type="hidden" name="challengeId" value={challenge.challengeId} />
          <input type="hidden" name="response" value="accept" />
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Accept
          </button>
        </form>
        <form action={respondInviteAction}>
          <input type="hidden" name="challengeId" value={challenge.challengeId} />
          <input type="hidden" name="response" value="decline" />
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400"
          >
            Decline
          </button>
        </form>
      </div>
    </article>
  );
}

/**
 * An accepted challenge. Tapping it starts or resumes the next unplayed board;
 * once every board is played it opens the results instead.
 */
function PlayCard({ row }: Readonly<{ row: Row }>) {
  const { challenge, access } = row;
  const done = access.viewerFinished || challenge.status === "archived";
  const href = done
    ? `/bridge/challenges/${challenge.challengeId}/results`
    : `/bridge/challenges/${challenge.challengeId}/play`;
  const cta = done
    ? access.viewerFinished
      ? "See the results"
      : "Archived — see the results"
    : access.finishedBoards === 0
      ? `Start · board ${access.nextBoardNo ?? 1} of ${access.totalBoards}`
      : `Resume · board ${access.nextBoardNo ?? access.totalBoards} of ${access.totalBoards}`;

  return (
    <Link
      href={href}
      className="block rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-emerald-400"
    >
      <CardFacts row={row} />
      <Progress access={access} />
      <p className="mt-2 text-sm font-semibold text-emerald-800">{cta} →</p>
    </Link>
  );
}
