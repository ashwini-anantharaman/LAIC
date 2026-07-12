import { initialState, reconstruct, scoreBoard, resultLabel } from "@bridge/engine";
import {
  callLabel,
  cardId,
  contractLabel,
  rankLabel,
  type ActionEvent,
  type Card,
  type Seat,
} from "@bridge/events";
import { SessionAccessError } from "@bridge/sessions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

// Replay viewer (§8.3): server-rendered step-through of a session's event
// log. ?step=N folds the first N ACTION events through the same reducer the
// live table uses — the replay IS the event log, not a recording of the UI.

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

function Hand({ cards }: Readonly<{ cards: Card[] }>) {
  const sorted = [...cards].sort(
    (a, b) => "SHDC".indexOf(a.suit) - "SHDC".indexOf(b.suit) || b.rank - a.rank,
  );
  return (
    <span className="flex flex-wrap gap-1">
      {sorted.length === 0 && <span className="text-sm text-neutral-400">—</span>}
      {sorted.map((c) => (
        <span key={cardId(c)} className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-sm">
          <CardFace card={c} />
        </span>
      ))}
    </span>
  );
}

export default async function ReplayPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ step?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { step } = await searchParams;

  let view, events;
  try {
    view = await sessionService().getSession(sessionId, context);
    events = await sessionService().getEvents(sessionId, context);
  } catch (e) {
    if (e instanceof SessionAccessError) notFound();
    throw e;
  }
  const { record } = view;

  const actions = events.filter(
    (e) => e.category === "bid-event" || e.category === "play-event",
  ) as ActionEvent[];
  const total = actions.length;
  const n = Math.max(0, Math.min(Number(step ?? total) || 0, total));

  const state = reconstruct(
    initialState(record.board.name, record.board.dealer, record.board.vul, record.board.hands),
    actions.slice(0, n),
  );
  const lastAction = n > 0 ? actions[n - 1] : null;
  // An AI action's decision trace sits at the preceding (even) seq; honest
  // human/imported actions have none — the gap is the attribution.
  const lastLogic = lastAction
    ? events.find(
        (e) =>
          e.seq === lastAction.seq - 1 &&
          (e.category === "bid-logic-event" || e.category === "play-logic-event"),
      )
    : null;
  const score = scoreBoard(state);

  const stepLink = (to: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300">{label}</span>
    ) : (
      <Link
        href={`/bridge/play/${sessionId}/replay?step=${to}`}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        {label}
      </Link>
    );

  const seatBox = (seat: Seat) => (
    <div className={`rounded-lg border p-3 ${state.turn === seat && state.phase !== "complete" && n < total ? "border-emerald-500" : "border-neutral-200"}`}>
      <p className="mb-1 text-xs font-medium text-neutral-500">
        {seat}
        {record.seats[seat].playerKind === "human" ? " (human)" : " (AI)"}
      </p>
      <Hand cards={state.hands[seat]} />
    </div>
  );

  const currentTrick = state.tricks[state.tricks.length - 1];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Replay — {record.board.name}
        </h1>
        <p className="text-xs text-neutral-500">
          <span className="font-mono">{record.bridgeSessionId}</span> · step {n} of {total} ·{" "}
          {state.contract ? contractLabel(state.contract) : `phase: ${state.phase}`} · tricks NS{" "}
          {state.trickCount.NS} / EW {state.trickCount.EW}
        </p>
      </header>

      <div className="flex gap-2">
        {stepLink(0, "⏮ Start", n === 0)}
        {stepLink(n - 1, "← Back", n === 0)}
        {stepLink(n + 1, "Next →", n >= total)}
        {stepLink(total, "End ⏭", n >= total)}
      </div>

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

      {lastAction && (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4 text-sm">
          <p>
            <span className="font-medium">Step {n}:</span>{" "}
            <span className="font-mono">{lastAction.seat}</span>{" "}
            {lastAction.category === "bid-event" ? (
              <>called {callLabel(lastAction.call)}</>
            ) : (
              <>
                played <CardFace card={lastAction.card} />
              </>
            )}
          </p>
          {lastLogic && "reason" in lastLogic ? (
            <p className="mt-1 text-neutral-600">← {lastLogic.reason}</p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              No decision trace — a human (or an imported record) made this action.
            </p>
          )}
        </section>
      )}

      {state.auction.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Auction so far
          </h2>
          <p className="space-x-2 font-mono text-sm">
            {state.auction.map((c, i) => (
              <span key={i}>
                {c.seat}:{callLabel(c.call)}
              </span>
            ))}
          </p>
        </section>
      )}

      {n >= total && score && (
        <section className="rounded-lg border border-emerald-300 p-4 text-sm">
          <p className="font-medium">{resultLabel(score)}</p>
          <p className="text-neutral-600">
            NS {score.nsScore >= 0 ? "+" : ""}
            {score.nsScore}
          </p>
        </section>
      )}

      <Link href={`/bridge/play/${sessionId}`} className="text-sm text-emerald-700 hover:underline">
        ← Back to the table
      </Link>
    </div>
  );
}
