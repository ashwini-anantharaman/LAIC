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
// VISIBILITY CONTRACT (fourth cut; the first three each failed in the field,
// all verified end-to-end in a browser):
//   · useFocusEffect blur cleanup — silently never fired on exit navigations;
//   · usePathname — sometimes never delivered the route-change render;
//   · useEffect unmount cleanup — never fires on web at all, because
//     react-native-screens keeps blurred screens MOUNTED there.
// The host now listens to the NAVIGATION CONTAINER'S own state events —
// imperative, fired on every navigation commit, independent of any screen's
// lifecycle or any hook's re-render timing — and derives "a board owns the
// screen" from the current route name. The event drives local React state,
// so the re-render is the host's own.
//
// Parked, the host hides and the old page STAYS LOADED with its events
// dropped — navigating a parked WebView to about:blank crashed the app
// natively (2026-08-13), so nothing touches the page until the next board
// replaces it wholesale. The board inside is the platform's table2 exactly
// as before; BridgeEmbed carries all its usual chrome (felt cover, quit
// pull-out, leave dialog, discard flow).

import { useNavigationContainerRef } from "expo-router";
import { useEffect, useReducer, useState } from "react";
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

/** The expo-router route names that mean "a board owns the screen". */
const isTableRoute = (name: string | undefined) => !!name && name.startsWith("table/");

export function TableWebViewHost() {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const { token } = useAuth();
  const navRef = useNavigationContainerRef();
  const [atTableRoute, setAtTableRoute] = useState(false);

  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);

  // The one park/unpark signal: the container's own navigation commits.
  useEffect(() => {
    const read = () => {
      const route = navRef.getCurrentRoute() as { name?: string } | undefined;
      setAtTableRoute(isTableRoute(route?.name));
    };
    read();
    const sub = navRef.addListener("state", read);
    return sub;
  }, [navRef]);

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

  const shown = atTableRoute;

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
