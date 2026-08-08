// /bridge/challenges/[id]/compare — two lines of the same board, side by side
// (spec §6 "Comparison", ADDENDUM A5; the validated canvas is
// docs/design/challenges/Play Comparison.dc.html, checked at 390x844).
//
// The results scorecard sends readers here by picking two cells in one board
// row, so the route is addressable: `?board=3&a=<key>&b=<key>` where a key is a
// userId or the literal `BEN`. Everything else — which BEN line, where the fork
// is taken — is a choice made on the surface itself.
//
// WHAT THE SERVER DOES: the two gates (the catalogue key, then
// `challengeViewerAccess` — the only reader of `resultsUnlocked`), the frozen
// snapshots, and the bridge law behind each line (declarer, trump, trick
// winners) so the client stays pure.
//
// WHAT THE SERVER DOES NOT DO: wait for BEN. A missing reference line is a
// minutes-long playout, so the page renders an honest "BEN is playing this
// board…" state and the client asks for it in resumable rounds. An empty page
// is never the answer.

import type { ChallengeBaseline, ChallengePlay, ChallengeSnapshot } from "@bridge/challenges";
import { stubDisplayName } from "@bridge/nexus-client";
import type { Seat, Vul } from "@bridge/events";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireFeature } from "@/lib/access";
import {
  challengeViewerAccess,
  getChallengeBoard,
  listChallengeBaselines,
  listChallengeInvites,
  listChallengePlays,
} from "@/lib/challenges";
import { getBridgeContext } from "@/lib/nexus";
import { CompareClient } from "./CompareClient";
import {
  BEN_KEY,
  YOUR_CONTRACT_KEY,
  SEAT_NAME,
  initials,
  type LineSlot,
  type SourceOption,
} from "./compareView";
import { benIdentity, buildCompareLine, type LineIdentity } from "./lineModel";

/** A from-point round can take the whole function; its own budget stops first. */
export const maxDuration = 300;

const VUL_LABEL: Record<Vul, string> = {
  none: "None vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable",
};

const FROM_HERE_PREFIX = "BEN.here.";

export default async function ChallengeComparePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.challenges");

  const { id } = await params;
  const query = await searchParams;
  const viewerId = context.nexusUserId;
  const access = await challengeViewerAccess(id, viewerId);
  const challenge = access.challenge;
  // Same posture as the results view: a challenge that is not this person's is
  // a 404, never a 403, and an unaccepted invite opens nothing (A1).
  if (!challenge) notFound();
  if (!access.viewerAccepted && !access.viewerIsModerator) notFound();

  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const boardNo = Number(one(query.board) ?? NaN);
  if (!Number.isInteger(boardNo)) notFound();
  const board = await getChallengeBoard(id, boardNo);
  if (!board) notFound();

  const backHref = `/bridge/challenges/${id}/results`;

  // ── the gate ──────────────────────────────────────────────────────────────
  // Locked means locked: no contracts, no results, and above all no cards —
  // a comparison is the most spoiler-dense surface in the feature.
  if (!access.resultsUnlocked)
    return (
      <LockedPanel
        title={challenge.title}
        done={access.finishedBoards}
        total={access.totalBoards}
        backHref={`/bridge/challenges/${id}/play`}
      />
    );

  const [plays, invites, baselines] = await Promise.all([
    listChallengePlays(id),
    listChallengeInvites(id),
    listChallengeBaselines(id),
  ]);

  const boardPlays = plays.filter((p) => p.boardNo === boardNo);
  const boardBaselines = baselines.filter((b) => b.boardNo === boardNo);

  // Names as the results view resolves them: the invite rows first (the
  // people search wrote them there), then the dev stub roster.
  const inviteName = new Map(
    invites.filter((i) => i.userName).map((i) => [i.userId, i.userName as string]),
  );
  const nameOf = (userId: string): string =>
    inviteName.get(userId) ??
    (userId === challenge.createdBy ? challenge.createdByName : undefined) ??
    stubDisplayName(userId) ??
    userId;

  // ── the two lines ─────────────────────────────────────────────────────────

  const completedPlay = (userId: string): (ChallengePlay & { snapshot: ChallengeSnapshot }) | null => {
    const play = boardPlays.find((p) => p.userId === userId);
    return play && play.status === "completed" && play.snapshot
      ? (play as ChallengePlay & { snapshot: ChallengeSnapshot })
      : null;
  };

  const userIdentity = (userId: string): LineIdentity => {
    const isViewer = userId === viewerId;
    const name = isViewer ? "You" : nameOf(userId);
    return {
      key: userId,
      kind: "user",
      who: name,
      short: isViewer ? "You" : (name.split(/\s+/)[0] ?? name),
      badge: isViewer ? "YOUR LINE" : "PLAYER",
      editor: challenge.editorBadge && userId === challenge.createdBy,
      isViewer,
    };
  };

  const baselineFor = (
    kind: ChallengeBaseline["kind"],
    opts?: { userId?: string; ply?: number },
  ): ChallengeBaseline | undefined =>
    boardBaselines.find(
      (b) =>
        b.kind === kind &&
        (opts?.userId === undefined || b.userId === opts.userId) &&
        (opts?.ply === undefined || b.ply === opts.ply),
    );

  const benSlot = (
    kind: "full_ben" | "your_contract" | "from_point",
    key: string,
    baseline: ChallengeBaseline | undefined,
  ): LineSlot => {
    const identity = benIdentity(kind, key);
    if (baseline?.status === "ready" && baseline.snapshot)
      return {
        ready: true,
        line: buildCompareLine({
          identity,
          snapshot: baseline.snapshot,
          board,
          rawScore: baseline.rawScore,
        }),
      };
    return {
      ready: false,
      pending: {
        key,
        kind,
        who: identity.who,
        short: identity.short,
        badge: identity.badge,
        // No record yet simply means nobody has asked; that is a `pending`
        // the client resolves by asking, not a failure.
        status: baseline?.status === "failed" ? "failed" : "pending",
        note: baseline?.error,
      },
    };
  };

  const slotFor = (key: string): LineSlot => {
    if (key === BEN_KEY) return benSlot("full_ben", key, baselineFor("full_ben"));
    if (key === YOUR_CONTRACT_KEY)
      return benSlot("your_contract", key, baselineFor("your_contract", { userId: viewerId }));
    if (key.startsWith(FROM_HERE_PREFIX)) {
      const ply = Number(key.slice(FROM_HERE_PREFIX.length));
      return benSlot(
        "from_point",
        key,
        Number.isInteger(ply) ? baselineFor("from_point", { userId: viewerId, ply }) : undefined,
      );
    }
    const play = completedPlay(key);
    const identity = userIdentity(key);
    if (!play)
      return {
        ready: false,
        pending: {
          key,
          kind: "user",
          who: identity.who,
          short: identity.short,
          badge: identity.badge,
          status: "unfinished",
          note: `${identity.who === "You" ? "You have" : `${identity.who} has`} not finished this board yet.`,
        },
      };
    return {
      ready: true,
      line: buildCompareLine({
        identity,
        snapshot: play.snapshot,
        board,
        rawScore: play.rawScore,
      }),
    };
  };

  // The viewer's own line is always the PRIMARY one when it is in the pair —
  // "compare from this point" only ever forks a line its owner is reading.
  const aKey = one(query.a) || viewerId;
  const bKey = one(query.b) || BEN_KEY;
  const flip = bKey === viewerId && aKey !== viewerId;
  const mineKey = flip ? bKey : aKey;
  const cmpKey = flip ? aKey : bKey;

  const mine = slotFor(mineKey);
  const cmp = cmpKey === mineKey ? slotFor(BEN_KEY) : slotFor(cmpKey);

  // ── the source picker ─────────────────────────────────────────────────────

  const summarize = (userId: string): { sub: string; res: string; made: boolean } => {
    const play = completedPlay(userId);
    if (!play) return { sub: "Still playing this board", res: "", made: false };
    const line = buildCompareLine({
      identity: userIdentity(userId),
      snapshot: play.snapshot,
      board,
      rawScore: play.rawScore,
    });
    return { sub: `${line.contract} ${line.byLine} · ${line.result}`, res: line.rawText, made: line.made };
  };

  const benBaseline = baselineFor("full_ben");
  const benSummary =
    benBaseline?.status === "ready" && benBaseline.snapshot
      ? (() => {
          const line = buildCompareLine({
            identity: benIdentity("full_ben", BEN_KEY),
            snapshot: benBaseline.snapshot,
            board,
            rawScore: benBaseline.rawScore,
          });
          return { sub: `${line.contract} ${line.byLine} · ${line.result}`, res: line.rawText, made: line.made };
        })()
      : { sub: "BEN is still playing this board", res: "", made: false };

  const sources: SourceOption[] = [
    {
      key: BEN_KEY,
      kind: "full_ben",
      name: "BEN's board",
      sub: benSummary.sub,
      initials: "BEN",
      editor: false,
      res: benSummary.res,
      resMade: benSummary.made,
      active: cmpKey === BEN_KEY,
    },
  ];
  // "BEN in your contract" exists precisely for the contract-mismatch case, so
  // it is offered only when one of the two lines is the viewer's own (spec §2).
  const viewerOwnsMine = mineKey === viewerId && mine.ready;
  if (viewerOwnsMine) {
    const yc = baselineFor("your_contract", { userId: viewerId });
    sources.push({
      key: YOUR_CONTRACT_KEY,
      kind: "your_contract",
      name: "BEN in your contract",
      sub:
        yc?.status === "ready"
          ? "BEN played your auction out"
          : "Computed when you ask — BEN adopts your auction",
      initials: "BEN",
      editor: false,
      res: "",
      resMade: false,
      active: cmpKey === YOUR_CONTRACT_KEY,
    });
  }
  for (const play of boardPlays) {
    if (play.status !== "completed" || !play.snapshot) continue;
    if (play.userId === mineKey) continue;
    const name = play.userId === viewerId ? "You" : nameOf(play.userId);
    const summary = summarize(play.userId);
    sources.push({
      key: play.userId,
      kind: "user",
      name,
      sub: summary.sub,
      initials: initials(name === "You" ? nameOf(play.userId) : name),
      editor: challenge.editorBadge && play.userId === challenge.createdBy,
      res: summary.res,
      resMade: summary.made,
      active: cmpKey === play.userId,
    });
  }

  return (
    <CompareClient
      challengeId={id}
      boardNo={boardNo}
      title={challenge.title}
      dealLine={`Board ${boardNo} · dealer ${SEAT_NAME[board.dealer as Seat]} · ${VUL_LABEL[board.vul]}`}
      dealer={board.dealer}
      vul={board.vul}
      humanSeat={board.humanSeat}
      mineKey={mineKey}
      cmpKey={cmpKey}
      mine={mine}
      cmp={cmp}
      viewerOwnsMine={viewerOwnsMine}
      sources={sources}
      backHref={backHref}
    />
  );
}

/**
 * The quiet locked panel. A comparison shows two players' cards, so the gate is
 * absolute — the reader is told what unlocks it and how far along they are, and
 * nothing else.
 */
function LockedPanel({
  title,
  done,
  total,
  backHref,
}: Readonly<{ title: string; done: number; total: number; backHref: string }>) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      style={{
        fontFamily: "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        width: "100%",
        maxWidth: 640,
        margin: "0 auto",
        padding: 16,
      }}
    >
      <section
        style={{
          border: "1px solid #e2e7e3",
          borderRadius: 16,
          background: "#fff",
          padding: "18px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span
            aria-hidden
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              flex: "none",
              borderRadius: 11,
              background: "#f1f4f2",
              fontSize: 17,
            }}
          >
            🔒
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#22302a" }}>
              Comparisons are locked
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "#8b9a93" }}>
              {`${title} — comparisons open when you finish all ${total} boards, along with the standings and the board-by-board grid.`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 15 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#e6ebe8", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#0d707c", borderRadius: 3 }} />
          </div>
          <span style={{ flex: "none", fontSize: 12, fontWeight: 800, color: "#5a6a63" }}>
            {`${done}/${total}`}
          </span>
        </div>
        <Link
          href={backHref}
          style={{
            display: "inline-flex",
            marginTop: 16,
            height: 38,
            alignItems: "center",
            padding: "0 15px",
            borderRadius: 10,
            background: "#0d707c",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Keep playing
        </Link>
      </section>
    </div>
  );
}
