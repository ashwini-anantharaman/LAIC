import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { ContentWebView } from "./content-webview";
import { LeaveBoardDialog } from "./leave-board-dialog";
import { leaveWithFade } from "./leave-veil";
import { BoardLoading } from "./table/board-loading";
import { BoardReloading } from "./table/board-reloading";
import { QuitPullout } from "./table/quit-pullout";
import { PrimaryButton, Screen, ScreenHeader } from "./ui";
import { Brand, Colors, Fonts, Spacing } from "../constants/theme";
import { BRIDGE_LAUNCH_URL_OVERRIDE, PROGRAM_ID } from "../lib/config";
import { useAuth } from "../lib/auth-context";
import { useSelectedClubId } from "../lib/club-context";
import {
  forgetBridgeOrigin,
  peekBridgeOrigin,
  rememberBridgeOrigin,
  takeLaunch,
} from "../lib/launch-cache";
import { bridgeRequest } from "../lib/bridge-api";
import { NexusError } from "../lib/nexus";
import { refreshSummary } from "../lib/summary-cache";

/**
 * Opens one bridge-platform page inside the app: mint a single-use launch
 * token; the platform's /nexus/launch exchanges it, signs the user in
 * (cookie session) and deep-links to `next`. embedded=1 hides the platform's
 * own sign-out — the app owns the surrounding navigation.
 */
/**
 * Is this embed URL showing a BOARD? Both platform routes that render one:
 * /bridge/table2/<id> is the table itself, and /m/table/<id> is the mobile entry
 * that redirects onto it (and also serves the finished hand record via
 * ?view=hands, which wants the whole screen just as much).
 *
 * Path-only on purpose — query strings carry ?from=, ?view=, ?discarded= and must
 * not change the answer.
 */
/** How long the app must have been away before a resume forces the clean
 *  rebuild. A quick app-switch keeps the live page; past this, the OS has
 *  usually reclaimed the WebView's renderer anyway, and a board that LOOKS
 *  alive after a long sleep can be quietly dead. */
const RESUME_RELOAD_AFTER_MS = 45_000;

function isTableHref(href: string): boolean {
  const path = href.split("?")[0] ?? "";
  return path.includes("/bridge/table2/") || path.includes("/m/table/");
}

export function BridgeEmbed({
  /** Launch as this program instead of the app-wide one — a club's own id. */
  programId: programIdProp,
  title,
  next,
  resetOnFocus = false,
  backTo,
  confirmUnfinishedExit = false,
  fullScreen = false,
  escapeTo,
  leaveOnResults,
  parked,
  discardOnGone = false,
}: {
  title: string;
  next: string;
  programId?: string;
  /** Tab screens: every return to the tab restarts at `next`, so wandering
   *  into a sub-page (board editor, a table) never becomes the tab's state. */
  resetOnFocus?: boolean;
  /** Fallback for the header arrow when this screen opened with no history. */
  backTo?: Href;
  /**
   * Table screens: leaving an UNFINISHED board asks first — save it for
   * Resume, or discard it (the platform deletes the session). The table page
   * reports its phase over the message channel (EmbedTableState), so the
   * prompt only appears when there is genuinely something to lose; finished
   * boards, and pages that never reported, leave without ceremony.
   */
  confirmUnfinishedExit?: boolean;
  /**
   * The whole screen is the embed (owner direction 2026-08-08): no header
   * row, no title — the board and its coach run edge to edge, and the only
   * chrome is a small back chip floating over the table's top-left corner.
   * The chip runs the same guarded back as the header arrow did.
   */
  fullScreen?: boolean;
  /**
   * A platform page the learner must NEVER see inside the app (owner
   * direction 2026-08-11: the challenges list the entry route bounces an
   * unaccepted invite to). When the embed lands on exactly this PATH, the
   * screen replaces itself with the app's own `href` instead of showing it.
   * Path-only, exact — "/bridge/challenges" must not catch
   * "/bridge/challenges/<id>/play".
   */
  escapeTo?: { path: string; href: Href };
  /**
   * Leave when the embed reaches a challenge's RESULTS page.
   *
   * Finishing the last board redirects there, and that page draws the platform's own
   * leaderboard — a second, differently-styled copy of the one the app's Challenges
   * screen already shows. So the app takes the exit and shows its own.
   *
   * A pattern rather than an exact path, unlike escapeTo: the results URL carries the
   * challenge id, and for a "latest challenge" launch the app never learns which id
   * the platform resolved to.
   */
  leaveOnResults?: Href;
  /**
   * PERSISTENT MODE (the table host). Defined at all — true or false — means
   * this embed outlives its screens: the WebView element is never unmounted,
   * so opening the next board is an in-place navigation of an already-booted
   * browser (warm process, cookies, HTTP + bytecode caches) instead of a
   * fresh WebView paying the whole boot again. `true` = no table screen is
   * focused right now: the host hides and the old page stays in place with
   * its events dropped (blanking a parked WebView crashes natively — see
   * the park effect); every unpark replaces it with a real navigation.
   */
  parked?: boolean;
  /**
   * This board was dealt THIS moment and nobody has played it (New Play).
   * quick-play creates the session BEFORE the table opens, so an open that
   * bounces (board gone) would otherwise strand a ghost board in Resume —
   * with this set, giving up on the bounce discards the session on the way
   * out. Guarded by "the table never reported in": a board that was actually
   * seen is never discarded by this path.
   */
  discardOnGone?: boolean;
}) {
  const persistent = parked !== undefined;
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where the user actually is inside the embed (native only) + the bridge
  // origin once a launch succeeded — both power cheap tab-switch resets.
  const currentUrl = useRef<string | null>(null);
  const originRef = useRef<string | null>(null);
  const lastRelaunch = useRef(0);
  // One boardGone retry per board open — reset when a board opens (unpark)
  // and when a table actually reports in.
  const boardGoneRetried = useRef(false);
  // Whether THIS board's table ever reported in (bridge:table) — the guard
  // that keeps discardOnGone from ever deleting a board someone has seen.
  const tableReported = useRef(false);

  // The app-wide program unless a caller names its own — OR a club is selected
  // (owner direction 2026-08-10: club members hold the member surface, scoped
  // to their club). An explicit prop still wins; with no club in play this is
  // the app-wide program, exactly as before.
  const selectedClubId = useSelectedClubId();
  const programId = programIdProp ?? selectedClubId ?? PROGRAM_ID;

  // ── The board's loading cover (full-screen boards only) ───────────────────
  // The webview boots blank while the platform handshakes and renders — a
  // white beat between the tap and the felt. A felt-green cover with the
  // dealing animation rides over it and cross-fades away when the table
  // reports in (its first bridge:table state message — posted on native AND
  // the web iframe). Purely app-side chrome: the embedded page is untouched.
  const [boardCover, setBoardCover] = useState(fullScreen);
  const [boardReady, setBoardReady] = useState(false);

  // ── Coming back to the SAME board (boss direction 2026-08-14) ─────────────
  // A phone asleep for a while costs the board: the OS reclaims the WebView's
  // renderer (or the whole app), and the resume is a full rebuild. The boss's
  // rule: that rebuild must NOT wear the green dealing screen — the board
  // stays on screen (its last captured frame) with a reloading pill over it.
  // So: capture the felt as the app leaves the foreground; on return after a
  // real absence (or on a renderer-death report), force a clean reload with
  // the snapshot as the cover. The felt cover remains for fresh opens/parks.
  const shotRef = useRef<View>(null);
  const snapFile = useRef<string | null>(null);
  const [reloadSnap, setReloadSnap] = useState<string | null>(null);
  const rendererDead = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  // Mirrors for the AppState listener, which outlives any single render.
  const boardReadyRef = useRef(false);
  boardReadyRef.current = boardReady;
  const parkedRef = useRef(parked);
  parkedRef.current = parked;

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    // Persistent embeds keep the WebView mounted between boards — nulling the
    // url would unmount it and throw the booted browser away, which is the
    // entire cost this mode exists to avoid. The url flips straight from
    // about:blank (parked) to the next destination instead.
    if (!persistent) setUrl(null);
    if (fullScreen) {
      setBoardCover(true);
      setBoardReady(false);
    }
    // A signed-in origin from an earlier screen: the cookie session is
    // already there, so load the destination DIRECTLY — no launch mint, no
    // token exchange, no redirect. This is what makes switching screens
    // fast; the /welcome watchdog below handshakes again if the session
    // ever dies.
    const known = peekBridgeOrigin(token, programId);
    if (known) {
      originRef.current = known;
      // Persistent embeds park with the old page LEFT IN PLACE (blanking a
      // parked WebView crashed the app natively — see the park effect). The
      // buster makes every unpark a real navigation, even when the next
      // board's URL matches the page still sitting in the parked WebView.
      const sep = next.includes("?") ? "&" : "?";
      setUrl(persistent ? `${known}${next}${sep}_r=${Date.now()}` : `${known}${next}`);
      return;
    }
    try {
      const launch = await takeLaunch(token, "bridge", programId);
      const base = BRIDGE_LAUNCH_URL_OVERRIDE ?? launch.launch_url;
      if (!base) throw new Error("bridge platform URL not configured");
      const origin = new URL(base).origin;
      originRef.current = origin;
      rememberBridgeOrigin(token, origin, programId);
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        // The platform scopes /bridge/context by this, so it must be the SAME
        // program the launch was minted for — a club, when opened from a club.
        program_id: programId,
        next,
        embedded: "1",
      });
      setUrl(`${base}?${params.toString()}`);
    } catch (e) {
      // A dead session (401) is already being handled globally — the app is
      // signing out to the login screen; this screen's own error would only
      // flash something misleading on the way out.
      if (e instanceof NexusError && e.status === 401) return;
      setError("Couldn't open the bridge platform. Check that it is running.");
    }
  }, [token, next, programId, fullScreen, persistent]);

  useEffect(() => {
    // Persistent embeds load through the park/unpark effect below instead —
    // loading here would boot the destination while the host is parked.
    if (!persistent) load();
  }, [load, persistent]);

  /** The clean rebuild, wearing the snapshot: cover up (still image when we
   *  have one, felt otherwise), then the normal load path — direct on the
   *  known origin, and the /welcome watchdog re-handshakes if the session
   *  died while the phone slept. */
  const resumeReload = useCallback(() => {
    if (!fullScreen) return;
    rendererDead.current = false;
    setReloadSnap(snapFile.current);
    setBoardCover(true);
    setBoardReady(false);
    tableReported.current = false;
    load();
  }, [fullScreen, load]);

  // Capture on the way OUT, decide on the way back IN. `inactive` (iOS) is
  // the last moment the renderer is reliably alive to be photographed.
  useEffect(() => {
    if (!persistent || Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        // First transition away only — iOS fires inactive THEN background.
        if (backgroundedAt.current != null) return;
        backgroundedAt.current = Date.now();
        if (!parkedRef.current && boardReadyRef.current && tableReported.current) {
          captureRef(shotRef, { format: "jpg", quality: 0.6, result: "tmpfile" })
            .then((uri) => {
              snapFile.current = uri;
            })
            .catch(() => {
              // No capture, no snapshot cover — the felt handles that resume.
            });
        }
        return;
      }
      const away = backgroundedAt.current != null ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;
      if (parkedRef.current) return;
      // A quick app-switch keeps the live page. A real absence (or a dead
      // renderer) gets the boss's treatment: the board's image stays up and
      // the page underneath reloads entirely.
      if (rendererDead.current || away > RESUME_RELOAD_AFTER_MS) resumeReload();
    });
    return () => sub.remove();
  }, [persistent, resumeReload]);

  /** The WebView's renderer died. In the foreground, rebuild right now; in
   *  the background, the resume handler above does it on the way back. */
  const onWebDied = useCallback(() => {
    rendererDead.current = true;
    if (AppState.currentState === "active" && !parkedRef.current) resumeReload();
  }, [resumeReload]);

  // ── Leaving an unfinished board (confirmUnfinishedExit) ───────────────────
  // The table page reports { sessionId, phase } as they change (its
  // EmbedTableState component); the back arrow consults the LAST report.
  // Discarding fires the platform's JSON discard (one bearer call) and
  // leaves immediately — the deletion lands behind the exit.
  const tableState = useRef<{ sessionId: string; phase: string } | null>(null);

  /**
   * A BOARD IS ALWAYS THE WHOLE SCREEN, whichever screen it opened from.
   *
   * Most tables have their own Expo screen and ask for fullScreen. But a board
   * can also open INSIDE another screen's embed — Start on an assignment, Replay
   * in My Games — and those kept the host screen's header, so the table was
   * squeezed into what was left (owner report 2026-08-09). The table page tells
   * us where we are (EmbedTableState, on both the native WebView and the web
   * iframe), so the chrome follows the content rather than the route.
   */
  const [atTable, setAtTable] = useState(false);

  /** The exits: `escapeTo`'s exact path, and any challenge results page.
   *  Guarded so one landing replaces once — a replace mid-transition must not
   *  fire again off the next location report. */
  const escaped = useRef(false);
  const maybeEscape = useCallback(
    (href: string) => {
      if (escaped.current) return false;
      if (!escapeTo && !leaveOnResults) return false;
      let path: string;
      try {
        path = new URL(href, "http://x").pathname.replace(/\/+$/, "");
      } catch {
        return false;
      }
      // /bridge/challenges/<id>/results — the id is anything without a slash, so this
      // cannot also match /results under some deeper route.
      const target =
        escapeTo && path === escapeTo.path
          ? escapeTo.href
          : leaveOnResults && /^\/bridge\/challenges\/[^/]+\/results$/.test(path)
            ? leaveOnResults
            : null;
      if (!target) return false;
      escaped.current = true;
      leaveWithFade(() => router.replace(target));
      return true;
    },
    [escapeTo, leaveOnResults],
  );

  const goBackNow = useCallback(() => {
    // Leaving a table means the board lists just changed (finished, saved,
    // discarded…) — start the summary refresh NOW so Resume and Play greet
    // the return with fresh lists instead of a stale-while-revalidate beat.
    if (token) refreshSummary(token, programId).catch(() => {});
    // Leave under the veil: the felt fades to cream, and home fades in under
    // it — never a one-frame cut off a WebView.
    leaveWithFade(() => {
      if (router.canGoBack()) router.back();
      else router.replace(backTo ?? "/home");
    });
  }, [backTo, token, programId]);

  // "This board doesn't exist", from either channel (native url change, web
  // location report). ONE quiet retry first — a cold platform read has
  // answered "gone" about live boards (first-tap bounce, 2026-08-13) — and
  // the retry WAITS a beat so it lands on a warmed function instead of
  // re-hitting the same cold window. A board that is truly gone answers the
  // same twice, and then we leave.
  const boardGoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (boardGoneTimer.current) clearTimeout(boardGoneTimer.current);
    },
    [],
  );
  const boardGoneLeaving = useRef(false);
  const handleBoardGone = useCallback(() => {
    // One verdict per delivery, not per channel: the landing page reports
    // over BOTH the url change and the location message on native — the
    // duplicate must not burn the retry AND the give-up in one breath.
    if (boardGoneTimer.current || boardGoneLeaving.current) return;
    if (!boardGoneRetried.current) {
      boardGoneRetried.current = true;
      boardGoneTimer.current = setTimeout(() => {
        boardGoneTimer.current = null;
        // The retry is a FULL RE-HANDSHAKE, not a reload: "board gone" can
        // also mean the platform cookie no longer matches this app session
        // (another tab signed into the platform directly, 2026-08-13) — a
        // direct reload would keep answering with the wrong account forever,
        // while a fresh launch signs the right user back in and the board is
        // simply there again.
        forgetBridgeOrigin();
        load();
      }, 800);
      return;
    }
    boardGoneLeaving.current = true;
    // A FRESHLY DEALT board that bounced was created seconds ago and never
    // seen — leaving it behind is what filled Resume with ghost boards
    // (owner report 2026-08-13). Discard it on the way out, best-effort: if
    // the board truly doesn't exist the discard is a no-op 404, and a board
    // whose table ever reported in is never touched by this path.
    if (discardOnGone && !tableReported.current && token) {
      const id = /\/bridge\/table2\/([^/?]+)/.exec(next)?.[1];
      if (id) {
        bridgeRequest(`/api/bridge/sessions/${encodeURIComponent(decodeURIComponent(id))}/discard`, {
          token,
          programId,
          method: "POST",
        })
          .then(() => refreshSummary(token, programId).catch(() => {}))
          .catch(() => {});
      }
    }
    goBackNow();
  }, [load, goBackNow, discardOnGone, token, programId, next]);

  const handleHostMessage = useCallback((data: unknown) => {
    // Parked, the old page's trailing messages are noise — the same door
    // handleUrlChange already closes. Without this, a parked page bouncing
    // itself to /m/home?boardGone=1 (a discarded board's page refreshing
    // under it) could run the retry-and-leave dance while the user is on a
    // completely different screen.
    if (persistent && parked) return;
    const m = data as {
      type?: unknown;
      sessionId?: unknown;
      phase?: unknown;
      href?: unknown;
    } | null;
    if (m?.type === "bridge:table" && typeof m.sessionId === "string" && typeof m.phase === "string") {
      tableState.current = { sessionId: m.sessionId, phase: m.phase };
      setAtTable(true);
      boardGoneRetried.current = false;
      tableReported.current = true;
      // The table reported in — the felt is drawn; the loading cover fades.
      setBoardReady(true);
    }
    // Any other page inside /m reports its location; that is how the web iframe
    // learns the board has been left (a native WebView uses the url change).
    if (m?.type === "bridge:location" && typeof m.href === "string" && !isTableHref(m.href)) {
      if (maybeEscape(m.href)) return;
      tableState.current = null;
      setAtTable(false);
      // "Board gone" over the web channel — the native WebView learns it
      // from its url change; the iframe ONLY reports it here. Without this
      // the web build stranded the learner staring at the platform's home
      // page inside the frame.
      if (m.href.includes("boardGone=1")) handleBoardGone();
    }
  }, [maybeEscape, handleBoardGone, persistent, parked]);


  const discardAndLeave = useCallback(() => {
    const t = tableState.current;
    // Nothing to discard that we know of — just leave.
    if (!t || !token) return goBackNow();
    // One tiny JSON call (the platform's own "twin" of the page discard),
    // not a WebView navigation through two server-rendered pages — cold
    // serverless made that take up to ten seconds, all of it spent staring
    // at a spinner. Leave NOW; the deletion lands behind the exit, and the
    // summary refreshes AGAIN when it does, so Resume never keeps the ghost.
    bridgeRequest(`/api/bridge/sessions/${encodeURIComponent(t.sessionId)}/discard`, {
      token,
      programId,
      method: "POST",
    })
      .then(() => refreshSummary(token, programId).catch(() => {}))
      .catch(() => {});
    goBackNow();
  }, [goBackNow, token, programId]);

  // The question itself is the app's own dialog (LeaveBoardDialog) — one
  // themed component on every platform, never window.confirm or Alert.
  const [leaveAsk, setLeaveAsk] = useState(false);

  const handleBack = useCallback((goBack: () => void) => {
    const t = tableState.current;
    // No table reported, or the board is done — nothing to lose, leave.
    if (!t || t.phase === "complete") return goBack();
    setLeaveAsk(true);
  }, []);

  // ── Persistent mode's lifecycle (the table host) ───────────────────────────
  // Parking LEAVES THE PAGE IN PLACE — hidden, untouchable, its events
  // dropped (handleUrlChange) — while the WebView, the booted browser, its
  // cookies and caches all stay alive. Unparking loads the next destination
  // (cache-busted, so it is always a real navigation) into that warm
  // browser: an in-place navigation instead of a WebView boot, which is
  // this mode's whole point.
  //
  // The park does NOT blank the page (2026-08-13). It used to navigate to
  // about:blank so the old board's timers died as an unmount would — and
  // the phone's crash post-mortem pinned the app's death EXACTLY on that
  // navigation ("park: about:blank applied" was the last breath, after the
  // exit transition had already settled; real-URL navigations like the
  // discard route sailed through the same WebView). Navigating a parked
  // WebView to about:blank kills the app natively on the new architecture,
  // so the old page simply stays — its one background actor (AutoAdvance)
  // ships paused by default, and every unpark replaces it wholesale.
  useEffect(() => {
    if (!persistent) return;
    if (parked) {
      tableState.current = null;
      // A pending boardGone retry must die with the sitting: left armed, it
      // fired AFTER the user had already left — navigating the parked
      // webview and, worse, leaving boardGoneRetried spent so the next
      // board's first hiccup skipped straight to the give-up.
      if (boardGoneTimer.current) {
        clearTimeout(boardGoneTimer.current);
        boardGoneTimer.current = null;
      }
      setAtTable(false);
      // The cover goes UP at park, not down. Unparking flips the host visible
      // on the render commit, but load() — which used to raise the cover —
      // runs in an effect AFTER that frame paints, so the old parked page
      // (which can be the platform's home: a discarded board's page bounces
      // itself to /m/home when its session dies under it) flashed for the
      // gap. A fresh cover mounted now is already painted when the host
      // reappears, so the first visible frame is always felt. `held` (below)
      // suspends the cover's failsafe while parked — parks outlast 12s.
      setBoardCover(fullScreen);
      setBoardReady(false);
      // The park curtain is FELT, never a stale screenshot of the old board.
      setReloadSnap(null);
      setLeaveAsk(false);
      setError(null);
      escaped.current = false;
    } else {
      escaped.current = false;
      boardGoneRetried.current = false;
      boardGoneLeaving.current = false;
      tableReported.current = false;
      // A fresh sitting — last board's snapshot must never cover this one.
      snapFile.current = null;
      setReloadSnap(null);
      load();
    }
  }, [persistent, parked, load]);

  // The embed session died (bounced to /welcome): re-launch once, guarded
  // against loops. Only observable on native.
  const handleUrlChange = useCallback(
    (u: string) => {
      // A parked board's trailing events (the old page winding down) must
      // not re-mark the table or trigger relaunches while the exit
      // transition runs — drop them at the door.
      if (persistent && parked) {
        currentUrl.current = u;
        return;
      }
      currentUrl.current = u;
      // A page the app refuses to show — leave for the native screen instead.
      if (maybeEscape(u)) return;
      // Native's own read of "am I at a board", so the chrome is right even
      // before the page's first state report — and is dropped again the moment
      // the embed navigates back to a list.
      if (isTableHref(u)) setAtTable(true);
      else {
        tableState.current = null;
        setAtTable(false);
      }
      // The platform says this board no longer exists (opened from a list
      // that hadn't refreshed after a discard) — nothing to show; leave.
      if (u.includes("boardGone=1")) {
        handleBoardGone();
        return;
      }
      // A PLATFORM HOME under the board frame is the same stranding as
      // /welcome, one hop later: a session that exists but doesn't match
      // (another tab signed into the platform directly) sails through
      // /welcome's redirect and parks the learner on the platform's home
      // page inside the table (2026-08-13). Persistent host only — the tab
      // embeds show /m/home legitimately. boardGone=1 returned above.
      const strandedHome = (() => {
        if (!persistent) return false;
        try {
          const path = new URL(u, "http://x").pathname.replace(/\/+$/, "");
          return path === "/bridge/home" || path === "/m/home";
        } catch {
          return false;
        }
      })();
      if (u.includes("/welcome") || strandedHome) {
        if (Date.now() - lastRelaunch.current > 5000) {
          lastRelaunch.current = Date.now();
          // The session on the remembered origin is dead or mismatched — a
          // direct load would just bounce here again, so force the full
          // handshake.
          forgetBridgeOrigin();
          load();
        } else {
          // The re-handshake ITSELF bounced back here. Whatever went wrong,
          // a foreign page must never be what the learner is left staring
          // at — show the app's own error, whose "Try again" runs the
          // handshake once more.
          setUrl(null);
          setError("The table lost its connection. Try again.");
        }
      }
    },
    [load, goBackNow, maybeEscape, persistent, parked],
  );

  // Re-entering the tab resets the embed to its start page — CHEAPLY: the
  // cookie session from the first launch is reused (no token mint, no
  // handshake), and if the embed is already sitting on the start page
  // (knowable on native), nothing reloads at all. The hook itself lives in a
  // child rendered only when asked for (FocusReset): a persistent embed
  // mounts OUTSIDE any navigator screen, where useFocusEffect would throw.
  const focusedOnce = useRef(false);
  const onFocusReset = useCallback(() => {
    if (!focusedOnce.current) {
      focusedOnce.current = true; // mount already loaded
      return;
    }
    const origin = originRef.current;
    const cur = currentUrl.current;
    if (cur && origin) {
      try {
        const parsed = new URL(cur);
        const target = next.split("?")[0] ?? next;
        if (parsed.origin === origin && parsed.pathname === target) return;
      } catch {
        // Unparseable URL — fall through to a reset.
      }
    }
    if (origin) {
      const sep = next.includes("?") ? "&" : "?";
      setUrl(`${origin}${next}${sep}_r=${Date.now()}`);
    } else {
      load();
    }
  }, [next, load]);

  // The board owns the screen whether the host screen asked for it (a table
  // route) or the embed simply navigated onto one (an assignment's Start, a
  // Replay). Note the save-or-discard question stays tied to confirmUnfinishedExit
  // and is NOT inferred: discarding deletes the session, and an assignment's row
  // points at that session — offering it here would strand the assignment.
  const immersive = fullScreen || atTable;


  return (
    // While the loading cover is up, the safe areas wear the felt too.
    <Screen style={fullScreen && boardCover ? styles.feltScreen : undefined}>
      {resetOnFocus ? <FocusReset onFocus={onFocusReset} /> : null}
      {!immersive && (
        <ScreenHeader
          title={title}
          backTo={backTo}
          {...(confirmUnfinishedExit ? { onBack: handleBack } : {})}
        />
      )}

      {!url && !error && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.stateText}>{error}</Text>
          <PrimaryButton label="Try again" onPress={load} />
        </View>
      )}

      {url && (
        // collapsable={false}: the capture target must be a real native view,
        // or Android flattens it away and captureRef has nothing to shoot.
        <View ref={shotRef} collapsable={false} style={styles.embed}>
          <ContentWebView
            url={url}
            onUrlChange={handleUrlChange}
            onHostMessage={handleHostMessage}
            onDied={onWebDied}
          />
        </View>
      )}

      {/* The loading cover, over the whole screen until the table reports in
          (or an error takes the stage). Two faces: resuming the SAME board
          wears its own last frame with a reloading pill (boss direction
          2026-08-14 — never the dealing screen for a board you were already
          at); everything else keeps the felt. The back chip below rides
          ABOVE either (zIndex 20 vs 10) — the exit is never covered. */}
      {fullScreen && boardCover && (
        reloadSnap && !(persistent && parked) ? (
          <BoardReloading
            uri={reloadSnap}
            ready={boardReady || !!error}
            onGone={() => {
              setBoardCover(false);
              setReloadSnap(null);
            }}
          />
        ) : (
          <BoardLoading
            ready={boardReady || !!error}
            // Parked, the cover is a curtain over the old page, not a loading
            // screen: hold the failsafe (and the deal animation) until a real
            // board load is underway, or a long park would fade it out and
            // reopen the gap it exists to cover.
            held={persistent && parked}
            onGone={() => setBoardCover(false)}
          />
        )
      )}

      {/* Full-screen chrome: the FunBridge-style pull-out on the right edge
          (owner request 2026-08-12) — a tab that slides out a Quit panel,
          replacing the old floating back arrow. Hidden while the loading
          cover is up; it appears with the board. Quit runs the same guarded
          back the arrow did: only a screen that OPTED IN gets the
          save-or-discard question — on an inferred full-screen board (an
          assignment's Continue, a Replay) leaving simply leaves, because
          discarding would delete the session an assignment row points at. */}
      {immersive && !boardCover && (
        <QuitPullout
          onQuit={() => (confirmUnfinishedExit ? handleBack(goBackNow) : goBackNow())}
        />
      )}

      <LeaveBoardDialog
        visible={leaveAsk}
        onSave={() => {
          setLeaveAsk(false);
          goBackNow();
        }}
        onDiscard={() => {
          setLeaveAsk(false);
          discardAndLeave();
        }}
        onStay={() => setLeaveAsk(false)}
      />
    </Screen>
  );
}

/** The one caller of useFocusEffect, mounted only inside real screens — see
 *  onFocusReset above. */
function FocusReset({ onFocus }: { onFocus: () => void }) {
  useFocusEffect(
    useCallback(() => {
      onFocus();
    }, [onFocus]),
  );
  return null;
}

const styles = StyleSheet.create({
  /** While the board-loading cover is up, safe areas wear the felt too. */
  feltScreen: { backgroundColor: "#1d5c46" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: Spacing.screen,
  },
  embed: { flex: 1 },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: Fonts.body,
  },
});
