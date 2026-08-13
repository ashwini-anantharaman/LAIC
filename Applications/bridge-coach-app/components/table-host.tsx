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
//   · The table SCREEN calls showBoard() with its board URL on focus.
//   · Visibility is derived from THE ROUTE, not from screen callbacks: the
//     host is shown exactly while the pathname is a /table screen. (The
//     first cut parked on the screen's blur cleanup, which silently never
//     fired on exits — reproduced 2026-08-12: the host stayed painted over
//     Play with the discard spinner forever. The pathname cannot lie.)
//   · Parked, the page is sent to about:blank — the old board's timers die
//     exactly as an unmount killed them — and the browser stays warm.
//
// The board's implementation is untouched — this is hosting chrome only; the
// page inside is the platform's table2 exactly as before, and BridgeEmbed
// carries all its usual behavior (felt cover, quit pull-out, leave dialog,
// discard flow, /welcome watchdog).

import { usePathname } from "expo-router";
import { useEffect, useReducer } from "react";
import { StyleSheet, View } from "react-native";

import { BridgeEmbed } from "./bridge-embed";
import { useAuth } from "../lib/auth-context";

interface BoardParams {
  /** The platform path to show — /bridge/table2/<id>[?view=hands…]. */
  next: string;
}

let state: { params: BoardParams | null } = { params: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** A table screen took the stage: give the persistent board its URL. */
export function showBoard(params: BoardParams): void {
  if (state.params?.next === params.next) return;
  state = { params };
  emit();
}

/** The route prefix that means "a board owns the screen". */
const TABLE_PATH = /^\/table(\/|$)/;

export function TableWebViewHost() {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const { token } = useAuth();
  const pathname = usePathname();
  const shown = !!state.params && !!token && TABLE_PATH.test(pathname ?? "");

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
      state = { params: null };
      emit();
    }
  }, [token]);

  // Never opened a board this session — nothing to keep warm yet.
  if (!state.params || !token) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.host, !shown && styles.parked]}
      pointerEvents={shown ? "auto" : "none"}
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
        parked={!shown}
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
