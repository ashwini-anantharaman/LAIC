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
import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import { BridgeEmbed } from "./bridge-embed";
import { useAuth } from "../lib/auth-context";

interface BoardParams {
  /** The platform path to show — /bridge/table2/<id>[?view=hands…]. */
  next: string;
  /** Freshly dealt and never played (New Play): if this board's open
   *  bounces (board gone), discard the session on the way out instead of
   *  stranding a ghost board in Resume. */
  discardOnGone?: boolean;
}

// A tiny external store, read through useSyncExternalStore — NOT a bare
// module variable read during render. The distinction is load-bearing: this
// app compiles with the React Compiler, which memoizes render output against
// REACTIVE values only. The first cut mutated `state` and force-rendered the
// host, and the compiler — correctly, by its rules — reused the memoized JSX
// with the PREVIOUS board's URL baked in: every second board opened onto the
// board before it (Quick Play showed the resume board, owner report
// 2026-08-13). useSyncExternalStore is how a module store becomes reactive.
let state: { params: BoardParams | null } = { params: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getParams = () => state.params;

/** A table screen took the stage: give the persistent board its URL. */
export function showBoard(params: BoardParams): void {
  if (
    state.params?.next === params.next &&
    state.params?.discardOnGone === params.discardOnGone
  )
    return;
  state = { params };
  emit();
}

/** The expo-router route names that mean "a board owns the screen". */
const isTableRoute = (name: string | undefined) => !!name && name.startsWith("table/");

export function TableWebViewHost() {
  const params = useSyncExternalStore(subscribe, getParams, getParams);
  const { token } = useAuth();
  const navRef = useNavigationContainerRef();
  const [atTableRoute, setAtTableRoute] = useState(false);
  const [routeSession, setRouteSession] = useState<string | null>(null);

  // The one park/unpark signal: the container's own navigation commits.
  useEffect(() => {
    const read = () => {
      const route = navRef.getCurrentRoute() as
        | { name?: string; params?: Record<string, unknown> }
        | undefined;
      setAtTableRoute(isTableRoute(route?.name));
      const sid = route?.params?.sessionId;
      setRouteSession(typeof sid === "string" && sid ? sid : null);
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
  if (!params || !token) return null;

  // Unpark ONLY once the host holds THIS route's board. The navigation
  // commit can beat the screen's focus effect (showBoard), and unparking on
  // the commit alone loaded the PREVIOUS board's URL into the warm browser —
  // Quick Play opened onto the resume board (owner report 2026-08-13). The
  // focus effect's showBoard emits and re-renders this host, so the unpark
  // simply lands a beat later, with the right URL. Prefix-with-boundary so
  // "bs_1" can never claim "bs_12"'s route.
  const wanted = routeSession ? `/bridge/table2/${encodeURIComponent(routeSession)}` : null;
  const holdsRoutedBoard =
    !wanted || params.next === wanted || params.next.startsWith(`${wanted}?`);
  const shown = atTableRoute && holdsRoutedBoard;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.host, !shown && styles.parked]}
      pointerEvents={shown ? "auto" : "none"}
    >
      <BridgeEmbed
        key="persistent-board"
        title="Board"
        next={params.next}
        // Opened from Play, Resume, Assignments or My Games — back returns to
        // whichever pushed the table screen; /play is the no-history fallback.
        backTo="/play"
        // Leaving mid-board asks: save it for Resume, or discard it.
        confirmUnfinishedExit
        // The board and its coach own the whole screen.
        fullScreen
        parked={!shown}
        discardOnGone={params.discardOnGone}
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
