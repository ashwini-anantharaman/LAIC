import { legalCalls, legalPlays } from "@bridge/engine";
import {
  callLabel,
  cardId,
  contractLabel,
  isRedStrain,
  partnerOf,
  rankLabel,
  type Card,
  type Seat,
} from "@bridge/events";
import { resolveRuleProvenance } from "@bridge/knowledge";
import { SessionAccessError } from "@bridge/sessions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  autoplaySession,
  humanBid,
  humanPlay,
  saveBoardToLibraryAction,
  savePositionSnapshot,
  stepSession,
  undoSession,
} from "@/app/bridge/play/actions";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { sessionService } from "@/lib/sessions";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (suit: string) => suit === "H" || suit === "D";

function CardFace({ card }: Readonly<{ card: Card }>) {
  return (
    <span className={red(card.suit) ? "text-red-600" : "text-neutral-900"}>
      {GLYPH[card.suit]}
      {rankLabel(card.rank)}
    </span>
  );
}

function Hand({
  cards,
  hidden,
  playable,
  sessionId,
  actingAs,
}: Readonly<{
  cards: Card[];
  hidden: boolean;
  playable?: Set<string>;
  sessionId?: string;
  actingAs?: Seat;
}>) {
  if (hidden)
    return <span className="text-sm text-neutral-400">{"🂠".repeat(Math.min(cards.length, 13)) || "—"}</span>;
  const sorted = [...cards].sort(
    (a, b) => "SHDC".indexOf(a.suit) - "SHDC".indexOf(b.suit) || b.rank - a.rank,
  );
  return (
    <span className="flex flex-wrap gap-1">
      {sorted.map((c) => {
        const id = cardId(c);
        if (playable && sessionId && actingAs) {
          const legal = playable.has(id);
          return (
            <form key={id} action={humanPlay} className="inline">
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="seat" value={actingAs} />
              <input type="hidden" name="cardId" value={id} />
              <button
                type="submit"
                disabled={!legal}
                className={`rounded border px-1.5 py-0.5 text-sm ${
                  legal
                    ? "border-emerald-400 bg-white hover:bg-emerald-50"
                    : "border-neutral-200 bg-neutral-50 opacity-40"
                }`}
              >
                <CardFace card={c} />
              </button>
            </form>
          );
        }
        return (
          <span key={id} className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-sm">
            <CardFace card={c} />
          </span>
        );
      })}
    </span>
  );
}

export default async function SessionPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ why?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { why } = await searchParams;

  let view, events;
  try {
    view = await sessionService().getSession(sessionId, context);
    events = await sessionService().getEvents(sessionId, context);
  } catch (e) {
    if (e instanceof SessionAccessError) notFound();
    throw e;
  }
  const { record, state } = view;

  const me = await (await profileService()).getUserProfile(context);
  const feedbackMode = me?.preferredFeedbackMode ?? "full_trace";

  const mySeats = (Object.values(record.seats) as { seat: Seat; playerKind: string; occupantId?: string }[])
    .filter((s) => s.playerKind === "human" && s.occupantId === context.nexusUserId)
    .map((s) => s.seat);
  const isParticipant = mySeats.length > 0;
  const declarer = state.contract?.declarer;
  const dummy = declarer ? partnerOf(declarer) : null;
  const playStarted = events.some((e) => e.category === "play-event");
  const showHand = (seat: Seat) =>
    !isParticipant ||
    state.phase === "complete" ||
    mySeats.includes(seat) ||
    (dummy === seat && playStarted);
  const controllerOf = (seat: Seat): Seat =>
    state.phase === "play" && dummy === seat && declarer ? declarer : seat;
  const humansTurn =
    state.phase !== "complete" && mySeats.includes(controllerOf(state.turn));
  const legalPlaySet = humansTurn && state.phase === "play"
    ? new Set(legalPlays(state, state.turn).map(cardId))
    : undefined;
  const legalCallSet =
    humansTurn && state.phase === "auction" ? legalCalls(state.auction, state.turn) : null;

  const logicEvents = events.filter(
    (e) => e.category === "bid-logic-event" || e.category === "play-logic-event",
  ) as Extract<(typeof events)[number], { category: "bid-logic-event" | "play-logic-event" }>[];

  // "Why?" panel: resolve the selected decision's rule to items + sources.
  const whyEvent = why ? logicEvents.find((e) => e.seq === Number(why)) : undefined;
  const whyProvenance =
    whyEvent?.matchedRuleId != null
      ? await resolveRuleProvenance(
          knowledgeStore(),
          record.packageRef.packageId,
          record.packageRef.version,
          whyEvent.matchedRuleId,
        )
      : null;

  const seatBox = (seat: Seat) => (
    <div className={`rounded-lg border p-3 ${state.turn === seat && state.phase !== "complete" ? "border-emerald-500" : "border-neutral-200"}`}>
      <p className="mb-1 text-xs font-medium text-neutral-500">
        {seat}
        {mySeats.includes(seat)
          ? ` (${me?.displayNameAtTable || "you"})`
          : record.seats[seat].playerKind === "human"
            ? " (human)"
            : " (AI)"}
        {dummy === seat && playStarted ? " — dummy" : ""}
      </p>
      <Hand
        cards={state.hands[seat]}
        hidden={!showHand(seat)}
        playable={humansTurn && state.turn === seat ? legalPlaySet : undefined}
        sessionId={record.bridgeSessionId}
        actingAs={controllerOf(seat)}
      />
    </div>
  );

  const currentTrick = state.tricks[state.tricks.length - 1];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.board.name}</h1>
        <p className="text-xs text-neutral-500">
          <span className="font-mono">{record.bridgeSessionId}</span> · {record.status} ·{" "}
          {record.packageRef.packageId}@{record.packageRef.version} ·{" "}
          {state.contract ? contractLabel(state.contract) : `phase: ${state.phase}`} · tricks NS{" "}
          {state.trickCount.NS} / EW {state.trickCount.EW}
        </p>
      </header>

      {/* Table */}
      <div className="grid grid-cols-3 items-center gap-3">
        <div />
        {seatBox("N")}
        <div />
        {seatBox("W")}
        <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-center">
          <p className="mb-1 text-xs text-neutral-400">current trick</p>
          {currentTrick?.plays.length ? (
            <p className="space-x-2 text-sm">
              {currentTrick.plays.map((p) => (
                <span key={p.seat}>
                  {p.seat}:<CardFace card={p.card} />
                </span>
              ))}
              {currentTrick.winner && <span className="text-neutral-400">→ {currentTrick.winner}</span>}
            </p>
          ) : (
            <p className="text-sm text-neutral-400">—</p>
          )}
        </div>
        {seatBox("E")}
        <div />
        {seatBox("S")}
        <div />
      </div>

      {/* Bidding box */}
      {legalCallSet && (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4">
          <h2 className="mb-2 text-sm font-medium text-emerald-900">
            Your call ({state.turn})
          </h2>
          <div className="flex flex-wrap gap-1">
            {[...legalCallSet]
              .sort((a, b) => {
                const order = (c: string) =>
                  c === "P" ? 100 : c === "X" ? 101 : c === "XX" ? 102 : Number(c[0]) * 5 + "CDHSN".indexOf(c[1]!);
                return order(a) - order(b);
              })
              .map((call) => (
                <form key={call} action={humanBid} className="inline">
                  <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
                  <input type="hidden" name="seat" value={state.turn} />
                  <input type="hidden" name="call" value={call} />
                  <button
                    type="submit"
                    className={`rounded border border-neutral-300 bg-white px-2 py-1 text-sm hover:bg-emerald-100 ${isRedStrain(call) ? "text-red-600" : ""}`}
                  >
                    {callLabel(call)}
                  </button>
                </form>
              ))}
          </div>
        </section>
      )}
      {humansTurn && state.phase === "play" && (
        <p className="text-sm text-emerald-800">
          Your play — click a highlighted card{state.turn !== controllerOf(state.turn) ? "" : ""}
          {dummy === state.turn ? " (you control dummy)" : ""}.
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {!isParticipant && (
          <>
            <form action={stepSession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900">
                Step AI
              </button>
            </form>
            <form action={autoplaySession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                Play to end
              </button>
            </form>
          </>
        )}
        {isParticipant && !humansTurn && state.phase !== "complete" && (
          <form action={autoplaySession}>
            <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
            <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Advance AI
            </button>
          </form>
        )}
        <form action={undoSession}>
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Undo
          </button>
        </form>
        {state.phase !== "complete" && (
          <form action={savePositionSnapshot} className="flex items-center gap-1">
            <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
            <input
              name="name"
              placeholder="snapshot name"
              className="w-36 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Save position
            </button>
          </form>
        )}
        <form action={saveBoardToLibraryAction} className="flex items-center gap-1">
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <input
            name="name"
            placeholder={record.board.name}
            className="w-36 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Save board
          </button>
        </form>
        <a
          href={`/api/bridge/export?sessionId=${record.bridgeSessionId}&format=pbn`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Export PBN
        </a>
        <a
          href={`/api/bridge/export?sessionId=${record.bridgeSessionId}&format=lin`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Export LIN
        </a>
      </div>

      {/* Score (§8.2) */}
      {view.score && (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4">
          <h2 className="mb-1 text-sm font-medium text-emerald-900">{view.resultLabel}</h2>
          <p className="text-sm text-neutral-700">
            Score: <span className="font-medium">NS {view.score.nsScore >= 0 ? "+" : ""}{view.score.nsScore}</span>
            {view.score.contract && (
              <span className="text-neutral-500">
                {" "}
                — trick points {view.score.trickScore}
                {view.score.overtrickScore ? ` · overtricks ${view.score.overtrickScore}` : ""}
                {view.score.gameBonus ? ` · game bonus ${view.score.gameBonus}` : ""}
                {view.score.partscoreBonus ? ` · partscore ${view.score.partscoreBonus}` : ""}
                {view.score.slamBonus ? ` · slam ${view.score.slamBonus}` : ""}
                {view.score.insultBonus ? ` · insult ${view.score.insultBonus}` : ""}
                {view.score.penalty ? ` · penalty ${view.score.penalty}` : ""}
                {view.score.vulnerable ? " · vulnerable" : " · not vulnerable"}
              </span>
            )}
          </p>
        </section>
      )}

      {/* Auction + decisions with Why links. "minimal" feedback defers this
          panel until the board is over; the events still exist regardless. */}
      {(feedbackMode !== "minimal" || !isParticipant || state.phase === "complete") && (
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Decisions — click “why?” to resolve any AI action to its cited source
        </h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {logicEvents.map((e) => (
            <li key={e.seq} className={why === String(e.seq) ? "rounded bg-emerald-50 px-1" : "px-1"}>
              <span className="font-mono">
                {e.seat}:{" "}
                {e.category === "bid-logic-event" ? callLabel(e.chosen) : <CardFace card={e.chosen} />}
              </span>{" "}
              <span className="text-neutral-500">← {e.reason}</span>
              {e.fallback && (
                <span className="ml-1 rounded bg-red-50 px-1 text-xs text-red-700">fallback</span>
              )}
              {e.matchedRuleId && (
                <Link
                  href={`/bridge/play/${record.bridgeSessionId}?why=${e.seq}`}
                  className="ml-2 text-xs text-emerald-700 hover:underline"
                >
                  why?
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {/* Why panel */}
      {whyEvent && (
        <section className="rounded-lg border border-emerald-300 p-4">
          <h2 className="mb-2 text-sm font-medium text-emerald-900">
            Why {whyEvent.seat} chose{" "}
            {whyEvent.category === "bid-logic-event" ? callLabel(whyEvent.chosen) : cardId(whyEvent.chosen)}{" "}
            (event #{whyEvent.seq})
          </h2>
          <p className="text-sm text-neutral-700">{whyEvent.reason}</p>
          {whyEvent.facts.hcp !== undefined && (
            <p className="mt-1 text-xs text-neutral-500">
              Facts: {whyEvent.facts.hcp} HCP, shape {String(whyEvent.facts.shape)}
            </p>
          )}
          {whyProvenance && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-sm">
              {whyProvenance.items.map((item) => (
                <div key={item.itemId}>
                  <p className="font-medium">
                    {item.title}{" "}
                    <span className="text-xs font-normal text-neutral-500">
                      ({item.itemId}, {item.itemType}, v{item.version}, {item.status})
                    </span>
                  </p>
                  <p className="text-neutral-600">{item.humanReadableRule}</p>
                </div>
              ))}
              <ul className="text-xs text-neutral-500">
                {whyProvenance.citations.map((c, i) => (
                  <li key={i}>
                    ↳ {c.sourceId}: {c.passage}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feedbackMode === "full_trace" && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-neutral-500">
              Full rule trace ({whyEvent.trace.length} rules considered)
            </summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {whyEvent.trace.map((r, i) => (
                <li key={i} className={r.matched ? "text-emerald-700" : "text-neutral-400"}>
                  {r.matched ? "✓" : "·"} {r.ruleId} — {r.reason}
                </li>
              ))}
            </ul>
          </details>
          )}
        </section>
      )}

      <div className="flex gap-4">
        <Link href="/bridge/play" className="text-sm text-emerald-700 hover:underline">
          ← All sessions
        </Link>
        <Link
          href={`/bridge/play/${record.bridgeSessionId}/replay`}
          className="text-sm text-emerald-700 hover:underline"
        >
          Replay step-by-step →
        </Link>
      </div>
    </div>
  );
}
