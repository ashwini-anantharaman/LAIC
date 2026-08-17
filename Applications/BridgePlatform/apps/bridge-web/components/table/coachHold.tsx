"use client";

// The coach's take-back offer holds the table.
//
// Same shape as trickHold next door, and for the same structural reason: two
// components that are siblings in the markup need one piece of state, and
// <AutoAdvance/> renders INSIDE <PlayTable/> (it is handed over as
// `controlsExtra`), so a provider around the table reaches both.
//
// The behaviour it exists for: while a curated deal's nudge is on screen the
// learner is being ASKED something — "that's off the road your coach charted,
// take it back and see why?" — and the robots must not answer the board while
// they think about it. Every reply they make is another card the take-back has
// to unwind, and worse, the board visibly runs away from the question. Owner
// report 2026-08-17: "when the nudge appears the bot should stop with what
// they were doing and wait for the user's input."
//
// COUNTED, not a boolean. The nudge renders in two screens (the Tell voice and
// the State screen's interrupt), either or both of which may be mounted, so a
// single flag would have whichever unmounted last release a hold the other
// still wants.
//
// The default is "not holding", so every table without a provider — the legacy
// page, the demo, the component tester — behaves exactly as it did.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface CoachHold {
  holding: boolean;
  push: () => void;
  pop: () => void;
}

const CoachHoldContext = createContext<CoachHold>({
  holding: false,
  push: () => {},
  pop: () => {},
});

export const CoachHoldProvider = CoachHoldContext.Provider;

/** Is the coach waiting on an answer? Read by the thing that would advance. */
export function useCoachHolding(): boolean {
  return useContext(CoachHoldContext).holding;
}

/**
 * Hold the table for as long as `active`. Releases on unmount, so a panel that
 * disappears — a tab switch, a board that moved on — never strands the robots.
 */
export function useHoldTable(active: boolean): void {
  const { push, pop } = useContext(CoachHoldContext);
  useEffect(() => {
    if (!active) return;
    push();
    return pop;
    // push/pop are stable (useCallback with no deps in the provider), so this
    // re-runs on `active` alone — a value that changed identity every render
    // would pop and push forever.
  }, [active, push, pop]);
}

/** The state behind the provider. Returns the value to hand it. */
export function useCoachHoldState(): CoachHold {
  const [holds, setHolds] = useState(0);
  const push = useCallback(() => setHolds((n) => n + 1), []);
  const pop = useCallback(() => setHolds((n) => Math.max(0, n - 1)), []);
  return useMemo(() => ({ holding: holds > 0, push, pop }), [holds, push, pop]);
}
