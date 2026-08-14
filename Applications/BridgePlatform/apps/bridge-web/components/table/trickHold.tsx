"use client";

// The finished trick's hold — one piece of state, two components apart.
//
// When the fourth card lands, BBO leaves the trick on the felt until you say
// go, and the owner asked for the same (2026-08-12). That single behaviour has
// two halves living in different components:
//
//   · <AutoAdvance/> must not step the robots on, or the trick is swept away
//     a beat later by the very thing that was told to wait;
//   · the HAND must go inert, or the winner — who may be you — can lead to the
//     next trick before ever seeing who took this one.
//
// They are siblings in the page's markup, so neither can own the state for the
// other. But <AutoAdvance/> is handed to <PlayTable/> as `controlsExtra` and
// RENDERS inside it, and context is resolved by where a component renders, not
// where its element was created — so a provider around <PlayTable/> reaches it.
// That is the whole reason this file is a context rather than a prop.
//
// The default is "not holding", so every other caller — the legacy table, the
// demo, the component tester — behaves exactly as it did without knowing this
// exists.

import { createContext, useContext } from "react";

export interface TrickHold {
  /** A completed trick is on the felt, waiting. Nothing should advance. */
  holding: boolean;
  /** Let it go — the tap, or the timer. */
  release: () => void;
}

const TrickHoldContext = createContext<TrickHold>({ holding: false, release: () => {} });

export const TrickHoldProvider = TrickHoldContext.Provider;

/** Read the hold. Components outside a provider always see "not holding". */
export function useTrickHold(): TrickHold {
  return useContext(TrickHoldContext);
}
