import {
  callLabel,
  isLogicEvent,
  rankLabel,
  SUIT_RANK,
  type Card,
  type Hand,
  type LogicEvent,
  type Seat,
  type Suit,
} from "@bridge/events";
import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import {
  bidAction,
  flagDecisionAction,
  playCardAction,
  playToEndAction,
  stepAction,
  undoAction,
} from "../actions";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (suit: Suit) => suit === "H" || suit === "D";

function HandView({
  hand,
  hidden,
  playable,
  sessionId,
}: Readonly<{
  hand: Hand;
  hidden: boolean;
  playable: Card[] | null;
  sessionId: string;
}>) {
  if (hidden)
    return (
      <p className="text-xs text-neutral-400">
        {hand.length} card{hand.length === 1 ? "" : "s"} (hidden)
      </p>
    );
  const legal = new Set((playable ?? []).map((c) => `${c.suit}${c.rank}`));
  return (
    <div className="space-y-0.5">
      {SUITS.map((suit) => {
        const cards = hand
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank);
        return (
          <p key={suit} className="flex flex-wrap items-center gap-1 text-sm leading-tight">
            <span className={red(suit) ? "w-4 text-[var(--madder)]" : "w-4"}>{GLYPH[suit]}</span>
            {cards.map((card) =>
              playable ? (
                <form key={card.rank} action={playCardAction} className="inline">
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="suit" value={card.suit} />
                  <input type="hidden" name="rank" value={card.rank} />
                  <button
                    type="submit"
                    disabled={!legal.has(`${card.suit}${card.rank}`)}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 font-medium enabled:border-emerald-400 enabled:hover:bg-emerald-50 disabled:opacity-35"
                  >
                    {rankLabel(card.rank)}
                  </button>
                </form>
              ) : (
                <span key={card.rank} className="px-0.5 font-medium">
                  {rankLabel(card.rank)}
                </span>
              ),
            )}
            {cards.length === 0 && <span className="text-neutral-300">—</span>}
          </p>
        );
      })}
    </div>
  );
}

function DecisionEntry({
  event,
  sessionId,
  kbId,
}: Readonly<{ event: LogicEvent; sessionId: string; kbId: string }>) {
  const chosen =
    event.category === "bid-logic-event"
      ? callLabel(event.chosen)
      : `${rankLabel(event.chosen.rank)}${GLYPH[event.chosen.suit]}`;
  const floor = event.reason.startsWith("ENGINE FLOOR");
  const itemId = event.matchedRuleId?.split(".")[0];
  const human = event.reason === "human action";
  return (
    <details className="rounded border border-neutral-200 bg-[var(--card)] px-3 py-2">
      <summary className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-mono text-xs text-neutral-400">#{event.seq}</span>
        <span className="font-medium">{event.seat}</span>
        <span>{chosen}</span>
        <span className="truncate text-xs text-neutral-500">{event.reason}</span>
        {floor ? (
          <span className="rounded bg-red-50 px-1.5 text-[10px] uppercase tracking-wide text-[color:var(--color-invalid)]">
            engine floor
          </span>
        ) : event.fallback ? (
          <span className="rounded bg-amber-50 px-1.5 text-[10px] uppercase tracking-wide text-[color:var(--color-draft)]">
            fallback item
          </span>
        ) : human ? (
          <span className="rounded bg-neutral-100 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
            human
          </span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2 text-xs">
        {event.matchedRuleId && (
          <p>
            Rule <span className="font-mono">{event.matchedRuleId}</span>
            {itemId && (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/bridge/kb/${kbId}/items/${itemId}`}
                  className="text-emerald-800 underline-offset-2 hover:underline"
                >
                  open the knowledge item →
                </Link>
              </>
            )}
          </p>
        )}
        {event.candidates.length > 1 && (
          <p className="text-neutral-500">
            Pool:{" "}
            {event.candidates
              .map((c) =>
                typeof c === "string" ? callLabel(c) : `${rankLabel(c.rank)}${GLYPH[c.suit]}`,
              )
              .join(", ")}
          </p>
        )}
        {event.citedSettings.length > 0 && (
          <p className="text-neutral-500">
            Settings consulted:{" "}
            {event.citedSettings.map((s) => `${s.label} = ${JSON.stringify(s.value)}`).join("; ")}
          </p>
        )}
        {event.trace.length > 0 && (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-neutral-500">
            {event.trace.map((t, i) => (
              <li key={i}>
                {t.matched ? "✓" : "·"} <span className="font-mono">{t.ruleId}</span> — {t.reason}
              </li>
            ))}
          </ul>
        )}
        <form action={flagDecisionAction} className="flex items-end gap-2 border-t border-[var(--line)] pt-2">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="seq" value={event.seq} />
          {itemId && <input type="hidden" name="itemId" value={itemId} />}
          <label className="flex-1">
            <span className="mb-0.5 block text-neutral-400">Flag this decision</span>
            <input
              name="text"
              placeholder="What looks wrong?"
              className="w-full rounded border border-neutral-300 px-1.5 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-1 hover:border-emerald-400"
          >
            Flag
          </button>
        </form>
      </div>
    </details>
  );
}

export default async function SessionPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { mode } = await searchParams;

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    notFound();
  }
  const { record, state, actingSeat, actingIsHuman } = view;

  const isFellow = canAccessAdminArea(context);
  const learnerMode = mode === "learner" || !isFellow;
  const mySeat = (Object.entries(record.seats) as [Seat, (typeof record.seats)[Seat]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0];

  // Visibility: fellows (verification) see everything; learners see their
  // hand + dummy once play starts.
  const dummy =
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;
  const canSee = (seat: Seat) =>
    !learnerMode || seat === mySeat || seat === dummy || state.phase === "complete";

  const humanTurn = actingIsHuman && (!learnerMode || record.seats[actingSeat].kind === "human");
  const myTurn =
    actingIsHuman &&
    record.seats[actingSeat].kind === "human" &&
    (record.seats[actingSeat] as { nexusUserId: string }).nexusUserId === context.nexusUserId;
  const legalNow = state.phase === "play" && myTurn ? legalPlays(state, state.turn) : null;
  const callsNow = state.phase === "auction" && myTurn ? legalCalls(state.auction, state.turn) : null;

  const score = scoreBoard(state);
  const logicEvents = record.events.filter(isLogicEvent);

  const seatPanel = (seat: Seat) => {
    const config = record.seats[seat];
    const acting = seat === actingSeat && state.phase !== "complete";
    const playableHere = legalNow && seat === state.turn ? legalNow : null;
    return (
      <section
        className={`rounded-lg border p-3 ${acting ? "border-emerald-500" : "border-neutral-200"}`}
      >
        <p className="mb-1.5 flex items-baseline gap-2 text-xs">
          <span className="font-medium">{seat}</span>
          <span className="truncate text-neutral-500">
            {config.kind === "human"
              ? config.nexusUserId === context.nexusUserId
                ? "you"
                : "human"
              : config.label}
          </span>
          {acting && <span className="ml-auto text-[10px] uppercase tracking-wide text-emerald-700">to act</span>}
        </p>
        <HandView
          hand={state.hands[seat]}
          hidden={!canSee(seat)}
          playable={playableHere}
          sessionId={sessionId}
        />
      </section>
    );
  };

  const auctionRows: (typeof state.auction)[] = [];
  {
    const order: Seat[] = ["W", "N", "E", "S"];
    const offset = order.indexOf(record.board.dealer);
    const padded = [
      ...Array.from({ length: offset }, () => null),
      ...state.auction,
    ];
    for (let i = 0; i < padded.length; i += 4)
      auctionRows.push(padded.slice(i, i + 4) as never);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">
          <Link href="/bridge/table" className="hover:underline">
            Table
          </Link>
        </p>
        <h1 className="text-2xl font-medium">{record.board.name}</h1>
        <span className="text-xs text-neutral-500">
          compile v{record.compileRef.version} · dealer {record.board.dealer}
          {record.forkedFromSessionId && " · fork"}
        </span>
        {state.contract && (
          <span className="text-sm">
            Contract: <strong>{callLabel(`${state.contract.level}${state.contract.strain}`)}</strong> by{" "}
            {state.contract.declarer}
          </span>
        )}
        {score && (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-900">
            {resultLabel(score)}
            {score.contract
              ? ` · ${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}`
              : ""}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs">
          {isFellow && (
            <Link
              href={learnerMode ? `/bridge/table/${sessionId}` : `/bridge/table/${sessionId}?mode=learner`}
              className="text-neutral-500 underline-offset-2 hover:underline"
            >
              {learnerMode ? "verification view" : "learner view"}
            </Link>
          )}
          <form action={undoAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button type="submit" className="rounded border border-neutral-300 px-2 py-1 hover:border-emerald-400">
              Undo
            </button>
          </form>
        </span>
      </header>

      <div className={`grid gap-6 ${learnerMode ? "" : "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"}`}>
        <div className="space-y-4">
          {/* Quadrants: flat, spatial */}
          <div className="grid grid-cols-3 gap-3">
            <div />
            {seatPanel("N")}
            <div />
            {seatPanel("W")}
            <section className="rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400">
                {state.phase === "auction" ? "Auction" : "Current trick"}
              </p>
              {state.phase !== "auction" &&
                (() => {
                  const trick = state.tricks[state.tricks.length - 1];
                  const plays = trick && trick.plays.length < 5 ? trick.plays : [];
                  return plays.length ? (
                    <ul className="space-y-0.5 text-sm">
                      {plays.map((p) => (
                        <li key={p.seat}>
                          <span className="font-medium">{p.seat}</span>{" "}
                          <span className={red(p.card.suit) ? "text-[var(--madder)]" : ""}>
                            {rankLabel(p.card.rank)}
                            {GLYPH[p.card.suit]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-400">—</p>
                  );
                })()}
              {state.phase !== "auction" && (
                <p className="mt-2 text-xs text-neutral-500">
                  Tricks: NS {state.trickCount.NS} · EW {state.trickCount.EW}
                </p>
              )}
              {state.phase === "auction" && (
                <table className="w-full text-center text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-neutral-400">
                      {["W", "N", "E", "S"].map((s) => (
                        <th key={s} className="font-normal">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auctionRows.map((row, i) => (
                      <tr key={i}>
                        {[0, 1, 2, 3].map((j) => (
                          <td key={j} className="py-0.5">
                            {row[j] ? callLabel(row[j]!.call) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            {seatPanel("E")}
            <div />
            {seatPanel("S")}
            <div />
          </div>

          {/* Controls */}
          {state.phase !== "complete" && (
            <section className="rounded-lg border border-neutral-200 p-4">
              {myTurn && callsNow ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Your call</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["P", "X", "XX"]
                      .filter((c) => callsNow.has(c))
                      .map((c) => (
                        <form key={c} action={bidAction}>
                          <input type="hidden" name="sessionId" value={sessionId} />
                          <input type="hidden" name="call" value={c} />
                          <button
                            type="submit"
                            className="rounded border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:border-emerald-400"
                          >
                            {c === "P" ? "Pass" : callLabel(c)}
                          </button>
                        </form>
                      ))}
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                    {[1, 2, 3, 4, 5, 6, 7].flatMap((level) =>
                      (["C", "D", "H", "S", "N"] as const)
                        .map((strain) => `${level}${strain}`)
                        .filter((call) => callsNow.has(call))
                        .map((call) => (
                          <form key={call} action={bidAction}>
                            <input type="hidden" name="sessionId" value={sessionId} />
                            <input type="hidden" name="call" value={call} />
                            <button
                              type="submit"
                              className="w-full rounded border border-neutral-300 px-1 py-1 text-sm hover:border-emerald-400"
                            >
                              {callLabel(call)}
                            </button>
                          </form>
                        )),
                    )}
                  </div>
                </div>
              ) : myTurn && legalNow ? (
                <p className="text-sm text-neutral-600">
                  Your play — choose a highlighted card{state.turn !== actingSeat ? "" : ""} in
                  seat {state.turn}&apos;s hand.
                </p>
              ) : humanTurn ? (
                <p className="text-sm text-neutral-600">
                  Waiting for the human in seat {actingSeat}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <form action={stepAction}>
                    <input type="hidden" name="sessionId" value={sessionId} />
                    <button
                      type="submit"
                      className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Advance AI
                    </button>
                  </form>
                  <form action={playToEndAction}>
                    <input type="hidden" name="sessionId" value={sessionId} />
                    <button
                      type="submit"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400"
                    >
                      Play to end
                    </button>
                  </form>
                  <span className="text-xs text-neutral-400">
                    {record.seats[actingSeat].kind === "kb_player" &&
                      `${(record.seats[actingSeat] as { label: string }).label} to act`}
                  </span>
                </div>
              )}
            </section>
          )}
        </div>

        {/* The verification instrument: every decision, traceable + flaggable */}
        {!learnerMode && (
          <aside>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
              Decisions ({logicEvents.length})
            </h2>
            <div className="max-h-[75vh] space-y-1.5 overflow-y-auto pr-1">
              {[...logicEvents].reverse().map((event) => (
                <DecisionEntry
                  key={event.seq}
                  event={event}
                  sessionId={sessionId}
                  kbId={record.kbId}
                />
              ))}
              {logicEvents.length === 0 && (
                <p className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  No decisions yet — advance the AI to see the first trace.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
