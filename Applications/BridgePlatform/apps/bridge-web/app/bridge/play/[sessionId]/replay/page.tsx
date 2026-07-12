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
      {sorted.length === 0 && <span className="text-sm text-neutral-400">all played</span>}
      {sorted.map((c) => (
        <span
          key={cardId(c)}
          className={`flex h-10 w-7 flex-col items-center justify-center rounded-[5px] border border-neutral-200 bg-white leading-none shadow-sm ${
            red(c.suit) ? "text-red-600" : "text-neutral-900"
          }`}
        >
          <span className="text-[13px] font-semibold">{rankLabel(c.rank)}</span>
          <span className="text-[11px]">{GLYPH[c.suit]}</span>
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

  const seatBox = (seat: Seat) => {
    const onTurn = state.turn === seat && state.phase !== "complete" && n < total;
    return (
      <div
        className={`rounded-xl bg-[#fffdf6]/95 p-3 shadow-md ${
          onTurn ? "ring-2 ring-[var(--gold)] shadow-[0_0_0_5px_rgba(200,165,88,0.25)]" : ""
        }`}
      >
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
              onTurn ? "bg-[var(--gold)] text-emerald-950" : "bg-emerald-800 text-emerald-50"
            }`}
          >
            {seat}
          </span>
          {record.seats[seat].playerKind === "human" ? "human" : "AI"}
        </p>
        <Hand cards={state.hands[seat]} />
      </div>
    );
  };

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

      <div className="flex flex-wrap gap-2">
        {stepLink(0, "⏮ Start", n === 0)}
        {stepLink(n - 1, "← Back", n === 0)}
        {stepLink(n + 1, "Next →", n >= total)}
        {stepLink(total, "End ⏭", n >= total)}
      </div>

      <div
        className="rounded-[1.75rem] border-8 border-[#463323] p-4 shadow-xl sm:p-6"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, #386850 0%, #2a523c 55%, #1f4231 100%)",
        }}
      >
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
          <div className="hidden sm:block" />
          {seatBox("N")}
          <div className="hidden sm:block" />
          {seatBox("W")}
          <div className="self-stretch p-2 text-center">
            <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-emerald-100/60">
              current trick
            </p>
            {currentTrick?.plays.length ? (
              <div className="flex flex-wrap items-end justify-center gap-2">
                {currentTrick.plays.map((p) => (
                  <span key={p.seat} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-emerald-100/70">{p.seat}</span>
                    <span
                      className={`flex h-10 w-7 flex-col items-center justify-center rounded-[5px] border border-neutral-200 bg-white leading-none shadow-sm ${
                        red(p.card.suit) ? "text-red-600" : "text-neutral-900"
                      }`}
                    >
                      <span className="text-[13px] font-semibold">{rankLabel(p.card.rank)}</span>
                      <span className="text-[11px]">{GLYPH[p.card.suit]}</span>
                    </span>
                  </span>
                ))}
                {currentTrick.winner && (
                  <span className="pb-3 text-sm text-[var(--gold)]">→ {currentTrick.winner}</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-emerald-100/40">—</p>
            )}
          </div>
          {seatBox("E")}
          <div className="hidden sm:block" />
          {seatBox("S")}
          <div className="hidden sm:block" />
        </div>
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
