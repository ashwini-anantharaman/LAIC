import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ContentWebView } from "./content-webview";
import { LeaveBoardDialog } from "./leave-board-dialog";
import { PrimaryButton, Screen, ScreenHeader } from "./ui";
import { Brand, Colors, Fonts, Spacing } from "../constants/theme";
import { BRIDGE_LAUNCH_URL_OVERRIDE, PROGRAM_ID } from "../lib/config";
import { useAuth } from "../lib/auth-context";
import {
  forgetBridgeOrigin,
  peekBridgeOrigin,
  rememberBridgeOrigin,
  takeLaunch,
} from "../lib/launch-cache";
import { NexusError } from "../lib/nexus";
import { refreshSummary } from "../lib/summary-cache";

/**
 * Opens one bridge-platform page inside the app: mint a single-use launch
 * token; the platform's /nexus/launch exchanges it, signs the user in
 * (cookie session) and deep-links to `next`. embedded=1 hides the platform's
 * own sign-out — the app owns the surrounding navigation.
 */
export function BridgeEmbed({
  title,
  next,
  resetOnFocus = false,
  backTo,
  confirmUnfinishedExit = false,
  fullScreen = false,
}: {
  title: string;
  next: string;
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
}) {
  const { token } = useAuth();
  // The floating back arrow sits in the LEFT GUTTER, below the table's top
  // band. The top corner is not safe: a declarer playing from dummy has
  // dummy's cards along the very top edge, and a cream arrow on a white card
  // vanishes (tester report 2026-08-08). Below that band the gutter is felt
  // in every phase — the auction sheet is inset, the trick cross and hands
  // are centred. The band's height scales with the table's width (720-wide
  // stage → bands ≈ width × 172/720), so the offset does too.
  const { width: winW } = useWindowDimensions();
  const floatBackTop = Math.min(150, Math.round(winW * 0.27));
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where the user actually is inside the embed (native only) + the bridge
  // origin once a launch succeeded — both power cheap tab-switch resets.
  const currentUrl = useRef<string | null>(null);
  const originRef = useRef<string | null>(null);
  const lastRelaunch = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setUrl(null);
    // A signed-in origin from an earlier screen: the cookie session is
    // already there, so load the destination DIRECTLY — no launch mint, no
    // token exchange, no redirect. This is what makes switching screens
    // fast; the /welcome watchdog below handshakes again if the session
    // ever dies.
    const known = peekBridgeOrigin(token);
    if (known) {
      originRef.current = known;
      setUrl(`${known}${next}`);
      return;
    }
    try {
      const launch = await takeLaunch(token, "bridge");
      const base = BRIDGE_LAUNCH_URL_OVERRIDE ?? launch.launch_url;
      if (!base) throw new Error("bridge platform URL not configured");
      const origin = new URL(base).origin;
      originRef.current = origin;
      rememberBridgeOrigin(token, origin);
      const params = new URLSearchParams({
        launch_token: launch.launch_token,
        program_id: PROGRAM_ID,
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
  }, [token, next]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Leaving an unfinished board (confirmUnfinishedExit) ───────────────────
  // The table page reports { sessionId, phase } as they change (its
  // EmbedTableState component); the back arrow consults the LAST report.
  // Discarding navigates the embed to the platform's discard route — the
  // WebView's own cookies authenticate it — and leaves when the ?discarded=1
  // landing reports in, or after a grace period so a slow network can't
  // strand anyone at a dead table.
  const tableState = useRef<{ sessionId: string; phase: string } | null>(null);
  const discardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (discardTimer.current) clearTimeout(discardTimer.current);
    },
    [],
  );

  const handleHostMessage = useCallback((data: unknown) => {
    const m = data as { type?: unknown; sessionId?: unknown; phase?: unknown } | null;
    if (m?.type === "bridge:table" && typeof m.sessionId === "string" && typeof m.phase === "string") {
      tableState.current = { sessionId: m.sessionId, phase: m.phase };
    }
  }, []);

  const goBackNow = useCallback(() => {
    if (discardTimer.current) {
      clearTimeout(discardTimer.current);
      discardTimer.current = null;
    }
    // Leaving a table means the board lists just changed (finished, saved,
    // discarded…) — start the summary refresh NOW so Resume and Play greet
    // the return with fresh lists instead of a stale-while-revalidate beat.
    if (token) refreshSummary(token).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace(backTo ?? "/home");
  }, [backTo, token]);

  // While the discard runs, the WebView must stay MOUNTED (unmounting aborts
  // the deletion request) but must show NOTHING: its navigation passes
  // through the platform's landing page, and that flash of a foreign home
  // screen is not part of leaving a board. A cream cover hides the whole
  // beat; the screen unmounts before it would ever need lifting.
  const [discarding, setDiscarding] = useState(false);

  const discardAndLeave = useCallback(() => {
    const t = tableState.current;
    const origin = originRef.current;
    // Nothing to discard that we know of — just leave.
    if (!t || !origin) return goBackNow();
    setDiscarding(true);
    discardTimer.current = setTimeout(goBackNow, 6000);
    setUrl(`${origin}/m/table/${encodeURIComponent(t.sessionId)}/discard?_r=${Date.now()}`);
  }, [goBackNow]);

  // The question itself is the app's own dialog (LeaveBoardDialog) — one
  // themed component on every platform, never window.confirm or Alert.
  const [leaveAsk, setLeaveAsk] = useState(false);

  const handleBack = useCallback((goBack: () => void) => {
    const t = tableState.current;
    // No table reported, or the board is done — nothing to lose, leave.
    if (!t || t.phase === "complete") return goBack();
    setLeaveAsk(true);
  }, []);

  // The embed session died (bounced to /welcome): re-launch once, guarded
  // against loops. Only observable on native.
  const handleUrlChange = useCallback(
    (u: string) => {
      currentUrl.current = u;
      // The discard's landing page — the deletion went through; leave now.
      if (u.includes("discarded=1") && discardTimer.current) {
        goBackNow();
        return;
      }
      // The platform says this board no longer exists (opened from a list
      // that hadn't refreshed after a discard) — nothing to show; leave.
      if (u.includes("boardGone=1")) {
        goBackNow();
        return;
      }
      if (u.includes("/welcome")) {
        if (Date.now() - lastRelaunch.current > 5000) {
          lastRelaunch.current = Date.now();
          // The session on the remembered origin is dead — a direct load
          // would just bounce here again, so force the full handshake.
          forgetBridgeOrigin();
          load();
        } else {
          // The re-handshake ITSELF bounced back to the platform's sign-in.
          // Whatever went wrong, a foreign welcome page must never be what
          // the learner is left staring at — show the app's own error, whose
          // "Try again" runs the handshake once more.
          setUrl(null);
          setError("The table lost its connection. Try again.");
        }
      }
    },
    [load, goBackNow],
  );

  // Re-entering the tab resets the embed to its start page — CHEAPLY: the
  // cookie session from the first launch is reused (no token mint, no
  // handshake), and if the embed is already sitting on the start page
  // (knowable on native), nothing reloads at all.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!resetOnFocus) return;
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
    }, [resetOnFocus, next, load]),
  );

  return (
    <Screen>
      {!fullScreen && (
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
        <View style={styles.embed}>
          <ContentWebView
            url={url}
            onUrlChange={handleUrlChange}
            onHostMessage={handleHostMessage}
          />
          {discarding && (
            <View style={styles.discardCover}>
              <ActivityIndicator color={Colors.text} />
            </View>
          )}
        </View>
      )}

      {/* Full-screen chrome: one back chip riding the board's top-left
          corner, running the same guarded back as the header arrow. It stays
          up during loading and errors too — it is the screen's only exit. */}
      {fullScreen && !discarding && (
        <Pressable
          onPress={() => handleBack(goBackNow)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={({ pressed }) => [
            styles.floatBack,
            { top: floatBackTop },
            pressed && styles.floatBackPressed,
          ]}
        >
          <Text style={styles.floatBackGlyph}>‹</Text>
        </Pressable>
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

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: Spacing.screen,
  },
  embed: { flex: 1 },
  discardCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  // The full-screen mode's back control: just the arrow, no chip (owner
  // direction 2026-08-08). The box stays 38px for the finger; only the glyph
  // paints. Cream with a whisper of ink shadow, so it reads on the felt AND
  // on the white auction sheet it can end up over.
  floatBack: {
    position: "absolute",
    left: 4,
    zIndex: 20,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  floatBackPressed: { opacity: 0.6 },
  floatBackGlyph: {
    fontSize: 34,
    lineHeight: 38,
    color: Brand.cream,
    marginTop: -3,
    textShadowColor: "rgba(31,31,31,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  stateText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: Fonts.body,
  },
});
