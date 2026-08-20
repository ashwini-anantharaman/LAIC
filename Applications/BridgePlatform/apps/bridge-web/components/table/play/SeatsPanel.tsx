// The rail's seat panel: who sits where, and the swap menu — including the
// double dummy solver and BEN as seatable characters. The solver needs no
// endpoint, so it is always on offer and listed first; BEN only appears when
// the server has one. Server component; each option is a form posting the same
// swapSeatAction the old table used (a swap forks the board, as always).

import type { Seat } from "@bridge/events";
import type { KbPlayer } from "@bridge/kb";
import { swapSeatAction } from "@/app/bridge/table/actions";

const SEATS: Seat[] = ["N", "E", "S", "W"];

export function SeatsPanel({
  sessionId,
  seatLabels,
  roster,
  benOffered,
}: Readonly<{
  sessionId: string;
  seatLabels: Record<Seat, string>;
  roster: Pick<KbPlayer, "playerId" | "name" | "validationStatus">[];
  benOffered: boolean;
}>) {
  const option = (seat: Seat, playerId: string, label: string, current: boolean) => (
    <form key={playerId} action={swapSeatAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="seat" value={seat} />
      <input type="hidden" name="playerId" value={playerId} />
      <button
        type="submit"
        disabled={current}
        className="w-full rounded px-1.5 py-1 text-left text-[12px] enabled:hover:bg-emerald-50 disabled:cursor-default disabled:text-neutral-400"
      >
        {label}
        {current ? " · seated" : ""}
      </button>
    </form>
  );

  return (
    <div className="w-full rounded border border-neutral-600 bg-black/40 p-1.5 text-white">
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-neutral-300">
        Seats
      </p>
      {SEATS.map((seat) => (
        <details key={seat} className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/10">
            <span className="flex h-4 w-4 flex-none items-center justify-center rounded-[2px] bg-[#12525e] text-[10px] font-bold">
              {seat}
            </span>
            <span className="truncate text-[12px]">{seatLabels[seat]}</span>
            <span className="ml-auto text-[9px] text-neutral-400">▾</span>
          </summary>
          {/* On a phone this panel lives inside the ☰ menu, which scrolls: an
              absolute dropdown would be clipped by it, so the options expand
              in flow. From `md` up the panel is in the rail, where it must
              overlay the felt instead of pushing the rail's chips around. */}
          <div className="mt-1 w-full rounded border border-neutral-300 bg-white p-1 text-black shadow-lg md:absolute md:left-0 md:z-30 md:w-52">
            <p className="px-1.5 pb-1 pt-0.5 text-[9px] uppercase tracking-wide text-neutral-400">
              swap (forks this board)
            </p>
            {option(seat, "me", "Sit here yourself", false)}
            {option(seat, "dd", "Solver · double dummy", seatLabels[seat].startsWith("Solver"))}
            {benOffered && option(seat, "ben", "BEN · neural engine", seatLabels[seat].startsWith("BEN"))}
            {roster.map((p) =>
              option(
                seat,
                p.playerId,
                p.validationStatus === "valid" ? p.name : `${p.name} (draft)`,
                seatLabels[seat] === p.name,
              ),
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
