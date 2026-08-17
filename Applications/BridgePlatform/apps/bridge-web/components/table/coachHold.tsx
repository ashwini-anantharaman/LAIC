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
  /**
   * The decision the learner has already answered ("keep my move"), as a
   * decision epoch.
   *
   * SHARED for the same reason the hold is counted: the nudge renders in two
   * screens at once. Kept per-instance, answering the visible one released
   * only its own hold while the hidden one went on holding the table — the
   * board stopped dead and no button on screen could free it (owner report
   * 2026-08-17). Answering is a fact about the DECISION, not about the copy of
   * the bubble that happened to be clicked.
   *
   * Keying by epoch also means it expires by itself: the next decision has a
   * different epoch, so the question is live again with nothing to reset.
   */
  answeredEpoch: string | null;
  /** `null` forgets the answer — epochs repeat across a rewind, so a stale
   *  one would suppress the nudge for an unanswered divergence. */
  answer: (epoch: string | null) => void;
}

const CoachHoldContext = createContext<CoachHold>({
  holding: false,
  push: () => {},
  pop: () => {},
  answeredEpoch: null,
  answer: () => {},
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

/** Has this decision been answered, and the way to answer it. */
export function useCoachQuestion(): Pick<CoachHold, "answeredEpoch" | "answer"> {
  const { answeredEpoch, answer } = useContext(CoachHoldContext);
  return { answeredEpoch, answer };
}

/** The state behind the provider. Returns the value to hand it. */
export function useCoachHoldState(): CoachHold {
  const [holds, setHolds] = useState(0);
  const [answeredEpoch, setAnsweredEpoch] = useState<string | null>(null);
  const push = useCallback(() => setHolds((n) => n + 1), []);
  const pop = useCallback(() => setHolds((n) => Math.max(0, n - 1)), []);
  const answer = useCallback((epoch: string | null) => setAnsweredEpoch(epoch), []);
  return useMemo(
    () => ({ holding: holds > 0, push, pop, answeredEpoch, answer }),
    [holds, push, pop, answeredEpoch, answer],
  );
}
