// The PERSISTENT TABLE WEBVIEW (owner request 2026-08-12): one board WebView
// for the whole app's lifetime, mounted at the root, instead of a fresh one
// per board.
//
// Every board open used to boot a whole embedded browser — WebView creation,
// page load, JS download, hydration — and leaving threw it away. Now the
// FIRST board pays that bill once; every later board is an in-place
// navigation of the already-booted browser (warm process, cookies, HTTP and
// bytecode caches), which is most of what made opening a table slow.
//
// How it works:
//   · TableWebViewHost mounts once in the root layout, above the navigator,
//     holding ONE BridgeEmbed with a stable key — its WebView never unmounts.
//   · The table SCREEN is now a thin claim: on focus it shows the host with
//     its board URL; on blur it parks it. Parking sends the page to
//     about:blank (the old board's timers die exactly as an unmount killed
//     them) and hides the host; the browser stays warm underneath.
//   · Claims are ordered: pushing a second table screen (the Hands record
//     over a board) claims the host before the first screen's blur lands, so
//     a stale park can never hide the board the newer screen just showed.
//
// The board's implementation is untouched — this is hosting chrome only; the
// page inside is the platform's table2 exactly as before, and BridgeEmbed
// carries all its usual behavior (felt cover, quit pull-out, leave dialog,
// discard flow, /welcome watchdog).

import { useEffect, useReducer } from "react";
import { StyleSheet, View } from "react-native";

import { BridgeEmbed } from "./bridge-embed";
import { useAuth } from "../lib/auth-context";

interface BoardParams {
  /** The platform path to show — /bridge/table2/<id>[?view=hands…]. */
  next: string;
}

let claimSeq = 0;
let state: { params: BoardParams | null; shown: boolean; claim: number } = {
  params: null,
  shown: false,
  claim: 0,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** A table screen took the stage: show (and navigate) the persistent board.
 *  Returns the claim the caller must hand back to parkBoard on blur. */
export function showBoard(params: BoardParams): number {
  state = { params, shown: true, claim: ++claimSeq };
  emit();
  return state.claim;
}

/** The claiming screen left. Ignored if a newer screen claimed since —
 *  screen focus/blur ordering must never park the board mid-handover. */
export function parkBoard(claim: number): void {
  if (state.claim !== claim || !state.shown) return;
  state = { ...state, shown: false };
  emit();
}

export function TableWebViewHost() {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const { token } = useAuth();

  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);

  // Sign-out drops the browser entirely: the next account must never inherit
  // this one's booted page or its cookie-adjacent state.
  useEffect(() => {
    if (!token && state.params) {
      state = { params: null, shown: false, claim: state.claim };
      emit();
    }
  }, [token]);

  // Never opened a board this session — nothing to keep warm yet.
  if (!state.params || !token) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.host, !state.shown && styles.parked]}
      pointerEvents={state.shown ? "auto" : "none"}
    >
      <BridgeEmbed
        key="persistent-board"
        title="Board"
        next={state.params.next}
        // Opened from Play, Resume, Assignments or My Games — back returns to
        // whichever pushed the table screen; /play is the no-history fallback.
        backTo="/play"
        // Leaving mid-board asks: save it for Resume, or discard it.
        confirmUnfinishedExit
        // The board and its coach own the whole screen.
        fullScreen
        parked={!state.shown}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { zIndex: 10 },
  /** Parked: invisible and untouchable, but MOUNTED — the warm browser is
   *  the entire point. The page inside is about:blank while parked. */
  parked: { opacity: 0 },
});
