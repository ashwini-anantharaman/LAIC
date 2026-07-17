import {
  callLabel,
  isLogicEvent,
  type Card,
  type Seat,
  type Suit,
} from "@bridge/events";
import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { BiddingBox } from "@/components/table/BiddingBox";
import { DecisionEntry } from "@/components/table/DecisionEntry";
import { HandRow } from "@/components/table/HandRow";
import { PlayingCard } from "@/components/table/PlayingCard";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import {
  playToEndAction,
  quickPlayAction,
  saveToLibraryAction,
  swapSeatAction,
  undoAction,
} from "../actions";

/** Table v3 (2026-07-16 rework): the board looks like a card table — hands
 *  as cards, trick in the middle, AI turns advance themselves. Verification
 *  stays one tap away, never in the way. */
export default async function SessionPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string; hands?: string; saved?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { mode, hands: handsParam, saved, error } = await searchParams;

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

  const dummy =
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;
  // Watching four AIs defaults to open cards; sitting in defaults to table
  // realism. The toggle overrides either way.
  const showAll = handsParam === "all" || (handsParam !== "mine" && !mySeat && !learnerMode);
  const canSee = (seat: Seat) =>
    showAll || seat === mySeat || seat === dummy || state.phase === "complete";

  const myTurn =
    actingIsHuman &&
    record.seats[actingSeat].kind === "human" &&
    (record.seats[actingSeat] as { nexusUserId: string }).nexusUserId === context.nexusUserId;
  const legalNow = state.phase === "play" && myTurn ? legalPlays(state, state.turn) : null;
  const callsNow = state.phase === "auction" && myTurn ? legalCalls(state.auction, state.turn) : null;

  const score = scoreBoard(state);
  const logicEvents = record.events.filter(isLogicEvent);
  const aiToAct = !actingIsHuman && state.phase !== "complete";

  // The seat menus' swap roster (valid players first, then drafts).
  const roster = learnerMode
    ? []
    : (await kbStore().listPlayersForKb(record.kbId)).sort((a, b) =>
        a.validationStatus === b.validationStatus
          ? a.name.localeCompare(b.name)
          : a.validationStatus === "valid"
            ? -1
            : 1,
      );

  const seatLabel = (seat: Seat) => {
    const config = record.seats[seat];
    return config.kind === "human"
      ? config.nexusUserId === context.nexusUserId
        ? "you"
        : "human"
      : config.label;
  };
  const seatTag = (seat: Seat, align: "center" | "left" | "right" = "center") => {
    const acting = seat === actingSeat && state.phase !== "complete";
    const config = record.seats[seat];
    const tag = (
      <>
        {acting && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
        )}
        <span className="font-semibold text-neutral-800">{seat}</span>
        <span className="truncate">{seatLabel(seat)}</span>
      </>
    );
    const justify =
      align === "center" ? "justify-center" : align === "right" ? "justify-end" : "";
    if (learnerMode) {
      return (
        <p className={`flex max-w-40 items-center gap-1.5 text-xs text-neutral-500 ${justify}`}>
          {tag}
        </p>
      );
    }
    const iAmHere = config.kind === "human" && config.nexusUserId === context.nexusUserId;
    const panelAlign =
      align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-0" : "left-0";
    return (
      <details className={`relative flex ${justify}`}>
        <summary
          className={`flex max-w-40 cursor-pointer list-none items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 ${justify}`}
          title="Seat options — swap or edit this player"
        >
          {tag}
          <span aria-hidden className="text-[9px] text-neutral-400">
            ▾
          </span>
        </summary>
        <div
          className={`absolute top-full z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-left shadow-md ${panelAlign}`}
        >
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-neutral-400">
            {state.phase === "complete"
              ? "swap & replay this board"
              : "swap (forks this board)"}
          </p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {roster.map((p) => {
              const current = config.kind === "kb_player" && config.playerId === p.playerId;
              return (
                <form key={p.playerId} action={swapSeatAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="seat" value={seat} />
                  <input type="hidden" name="playerId" value={p.playerId} />
                  <button
                    type="submit"
                    disabled={current}
                    className="w-full rounded px-1.5 py-1 text-left text-xs enabled:hover:bg-emerald-50 disabled:cursor-default"
                  >
                    <span className={current ? "font-semibold" : ""}>{p.name}</span>
                    {current && <span className="ml-1 text-[9px] uppercase text-neutral-400">seated</span>}
                    {p.validationStatus === "invalid" && (
                      <span className="ml-1 text-[9px] uppercase text-[color:var(--color-invalid)]">
                        incomplete
                      </span>
                    )}
                  </button>
                </form>
              );
            })}
            {roster.length === 0 && (
              <p className="px-1.5 py-1 text-xs text-neutral-400">No players in this KB yet.</p>
            )}
          </div>
          <div className="mt-1 space-y-0.5 border-t border-[var(--line)] pt-1">
            {!iAmHere && (
              <form action={swapSeatAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="seat" value={seat} />
                <input type="hidden" name="playerId" value="me" />
                <button
                  type="submit"
                  className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-50"
                >
                  Sit here yourself
                </button>
              </form>
            )}
            {config.kind === "kb_player" && (
              <Link
                href={`/bridge/kb/${record.kbId}/players/${config.playerId}`}
                className="block rounded px-1.5 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
              >
                Edit {config.label} →
              </Link>
            )}
          </div>
        </div>
      </details>
    );
  };

  // Current (unfinished) trick, by seat.
  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase !== "auction" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }

  const auctionRows: (typeof state.auction | null[])[] = [];
  {
    const order: Seat[] = ["W", "N", "E", "S"];
    const offset = order.indexOf(record.board.dealer);
    const padded = [...Array.from({ length: offset }, () => null), ...state.auction];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4) as never);
  }

  const toggleHref = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (learnerMode && isFellow) q.set("mode", "learner");
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/bridge/table/${sessionId}?${s}` : `/bridge/table/${sessionId}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Status bar */}
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/bridge/table"
          className="text-xs uppercase tracking-[0.3em] text-neutral-400 hover:text-neutral-700"
        >
          ← Play
        </Link>
        <h1 className="text-lg font-medium sm:text-xl">{record.board.name}</h1>
        <span className="text-xs text-neutral-400">
          dealer {record.board.dealer} · vul {record.board.vul}
          {record.forkedFromSessionId && " · fork"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {state.contract && (
            <span className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-sm font-semibold">
              {callLabel(`${state.contract.level}${state.contract.strain}`)}
              <span className="ml-1 font-normal text-neutral-500">by {state.contract.declarer}</span>
            </span>
          )}
          {state.phase !== "auction" && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm tabular-nums">
              NS {state.trickCount.NS} · EW {state.trickCount.EW}
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
        </span>
      </header>

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved to the library.{" "}
          <Link
            href={`/bridge/library?kind=${saved}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            Open the {saved} shelf →
          </Link>
        </p>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <AutoAdvance sessionId={sessionId} active={aiToAct} seq={record.events.length} />
        {!learnerMode && (
          <Link
            href={toggleHref({ hands: showAll ? "mine" : "all" })}
            className={
              showAll
                ? "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-800"
                : "rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400"
            }
          >
            {showAll ? "all hands shown" : "show all hands"}
          </Link>
        )}
        {!learnerMode && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400">
              save to library ▾
            </summary>
            <div className="absolute z-10 mt-1 flex w-44 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-md">
              {(
                [
                  ["deal", "Deal (cards only)"],
                  ["board", "Board (+dealer/vul)"],
                  ["play", "Play (calls + cards)"],
                  ["table", "Table lineup"],
                ] as const
              ).map(([kind, label]) => (
                <form key={kind} action={saveToLibraryAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="kind" value={kind} />
                  <button
                    type="submit"
                    className="w-full rounded px-2 py-1 text-left hover:bg-emerald-50"
                  >
                    {label}
                  </button>
                </form>
              ))}
            </div>
          </details>
        )}
        {!learnerMode && aiToAct && (
          <form action={playToEndAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button
              type="submit"
              className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400"
            >
              play to end
            </button>
          </form>
        )}
        <form action={undoAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400"
          >
            undo
          </button>
        </form>
        {!learnerMode && (
          <form action={quickPlayAction}>
            <input type="hidden" name="kbId" value={record.kbId} />
            <button
              type="submit"
              className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400"
            >
              new board
            </button>
          </form>
        )}
        {!learnerMode && (
          <Link
            href="/bridge/table/choose"
            className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:border-emerald-400"
          >
            choose a table
          </Link>
        )}
        {isFellow && (
          <Link
            href={learnerMode ? `/bridge/table/${sessionId}` : `/bridge/table/${sessionId}?mode=learner`}
            className="ml-auto text-neutral-400 underline-offset-2 hover:underline"
          >
            {learnerMode ? "verification view" : "learner view"}
          </Link>
        )}
      </div>

      <div className={`grid gap-6 ${learnerMode ? "" : "xl:grid-cols-[minmax(0,1fr)_360px]"}`}>
        <div>
          {/* The table */}
          <div className="rounded-2xl border border-neutral-200 bg-[var(--card)] p-3 shadow-sm sm:p-6">
            {/* North */}
            <div className="flex flex-col items-center gap-1.5">
              {seatTag("N")}
              <HandRow
                hand={state.hands.N}
                hidden={!canSee("N")}
                playable={legalNow && state.turn === "N" ? legalNow : null}
                sessionId={sessionId}
              />
            </div>

            {/* West · center · East */}
            <div className="my-3 grid grid-cols-[minmax(2.5rem,auto)_1fr_minmax(2.5rem,auto)] items-center gap-2 sm:my-4 sm:gap-4">
              <div className="flex flex-col items-center gap-1.5 justify-self-start">
                {seatTag("W", "left")}
                <HandRow
                  hand={state.hands.W}
                  hidden={!canSee("W")}
                  playable={legalNow && state.turn === "W" ? legalNow : null}
                  sessionId={sessionId}
                  vertical
                  size="sm"
                />
              </div>

              {/* Center: auction, live trick, or the result */}
              <div className="flex min-h-44 items-center justify-center self-stretch rounded-xl border border-dashed border-neutral-300/80 px-2 py-3">
                {state.phase === "auction" ? (
                  <table className="w-full max-w-60 text-center text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-neutral-400">
                        {["W", "N", "E", "S"].map((s) => (
                          <th key={s} className="pb-1 font-normal">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auctionRows.map((row, i) => (
                        <tr key={i}>
                          {[0, 1, 2, 3].map((j) => {
                            const entry = row[j];
                            return (
                              <td key={j} className="py-0.5 tabular-nums">
                                {entry ? callLabel(entry.call) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {state.auction.length === 0 && (
                        <tr>
                          <td colSpan={4} className="pt-2 text-xs text-neutral-400">
                            {seatLabel(record.board.dealer) === "you"
                              ? "you deal"
                              : `${seatLabel(record.board.dealer)} deals`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : state.phase === "complete" && score ? (
                  <div className="text-center">
                    <p className="font-serif text-xl">{resultLabel(score)}</p>
                    {score.contract && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {score.declarerScore >= 0 ? "+" : ""}
                        {score.declarerScore} for{" "}
                        {["N", "S"].includes(score.contract.declarer) ? "NS" : "EW"}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-neutral-400">
                      NS {state.trickCount.NS} · EW {state.trickCount.EW}
                    </p>
                  </div>
                ) : (
                  <div className="relative h-40 w-full max-w-56 sm:h-44">
                    {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
                      const pos =
                        seat === "N"
                          ? "left-1/2 top-0 -translate-x-1/2"
                          : seat === "S"
                            ? "bottom-0 left-1/2 -translate-x-1/2"
                            : seat === "W"
                              ? "left-0 top-1/2 -translate-y-1/2"
                              : "right-0 top-1/2 -translate-y-1/2";
                      const card = trickCards[seat];
                      return (
                        <div key={seat} className={`absolute ${pos}`}>
                          {card ? (
                            <PlayingCard card={card} size="sm" />
                          ) : (
                            <span
                              className={`block aspect-[5/7] w-8 rounded-md border border-dashed border-neutral-300 ${
                                seat === state.turn ? "border-emerald-400" : ""
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wide text-neutral-300">
                      trick {state.tricks.length}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-1.5 justify-self-end">
                {seatTag("E", "right")}
                <HandRow
                  hand={state.hands.E}
                  hidden={!canSee("E")}
                  playable={legalNow && state.turn === "E" ? legalNow : null}
                  sessionId={sessionId}
                  vertical
                  size="sm"
                />
              </div>
            </div>

            {/* South */}
            <div className="flex flex-col items-center gap-1.5">
              <HandRow
                hand={state.hands.S}
                hidden={!canSee("S")}
                playable={legalNow && state.turn === "S" ? legalNow : null}
                sessionId={sessionId}
                size="lg"
              />
              {seatTag("S")}
            </div>
          </div>

          {/* Action strip below the table */}
          <div className="mt-4 flex flex-col items-center gap-2">
            {myTurn && callsNow && (
              <>
                <p className="text-sm font-medium">Your call</p>
                <BiddingBox sessionId={sessionId} legal={callsNow} />
              </>
            )}
            {myTurn && legalNow && (
              <p className="text-sm text-neutral-600">
                Your play — tap a raised card{state.turn !== mySeat ? ` (dummy, seat ${state.turn})` : ""}.
              </p>
            )}
            {actingIsHuman && !myTurn && state.phase !== "complete" && (
              <p className="text-sm text-neutral-500">
                Waiting for the human in seat {actingSeat}.
              </p>
            )}
            {state.phase === "complete" && (
              <p className="text-sm text-neutral-500">
                Board complete.{" "}
                <Link
                  href="/bridge/table"
                  className="text-emerald-700 underline-offset-4 hover:underline"
                >
                  Play another →
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* The verification rail */}
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
                  No decisions yet — the first trace appears as soon as an AI acts.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
