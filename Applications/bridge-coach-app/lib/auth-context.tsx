import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { clearAvatarCache } from "./avatar-store";
import { clearAllBridgeCaches } from "./bridge-cache";
import { clearBridgeMeCache } from "./bridge-features";
import { clearBridgeRoleCache, clubDefaultProgramId, getRoleContext } from "./bridge-role";
import { clearDealChats } from "./deal-chat";
import { clearLaunchCache } from "./launch-cache";
import { clearLearningCache } from "./learning";
import { prewarmAllDone } from "./prewarm";
import { onSessionExpired, onSessionRefresh } from "./session-expiry";
import { clearSummaryCache, refreshSummary } from "./summary-cache";
import { fetchGate, fetchMe, gateSignup, login, NexusUser, refreshSession, Session } from "./nexus";
import { clearToken, getSession, setSession, StoredSession } from "./token-store";

type AuthStatus = "loading" | "signedOut" | "signedIn";

type SignUpResult = { pending: boolean };

type AuthContextValue = {
  status: AuthStatus;
  user: NexusUser | null;
  token: string | null;
  /** True right after registration until onboarding completes. */
  needsOnboarding: boolean;
  completeOnboarding: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    name?: string;
  }) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** Re-read /auth/me — used after setting a password, so must_set_password clears. */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Fill the session caches the moment a session exists, instead of letting the
 * first screen that needs them pay the round-trip in front of the user. This
 * is what kept the menu's Library row and the Coach tab's name arriving late:
 * the role context and the bridge summary each waited for their first caller.
 * Both fetches are fire-and-forget — failures just mean the screens fall back
 * to fetching on demand, exactly as before.
 */
/**
 * Single-flight refresh of the STORED session. All callers of a concurrent
 * refresh share one network round trip — mandatory, not an optimization:
 * Supabase rotates refresh tokens, and two parallel refreshes spending the
 * same token trip reuse detection and revoke the whole session family.
 * Returns the new stored session, or null when there is no refresh flow or
 * the refresh failed (callers treat null as "session is really dead").
 */
let refreshInFlight: Promise<StoredSession | null> | null = null;
function refreshStoredSession(): Promise<StoredSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const stored = await getSession();
        if (!stored?.refresh_token) return null;
        const next = await refreshSession(stored.refresh_token);
        const session: StoredSession = {
          access_token: next.access_token,
          // Rotation: the response's token replaces the spent one. Keep the
          // old one only if the backend answered without a new one.
          refresh_token: next.refresh_token ?? stored.refresh_token,
          ...(next.expires_at != null ? { expires_at: next.expires_at } : {}),
        };
        await setSession(session);
        return session;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function primeSessionCaches(accessToken: string): void {
  // The summary prime waits for the role context so it can ask about the
  // RIGHT program. Firing immediately looked faster but wasn't: a club-only
  // account's app-wide summary is a guaranteed 403, so their prime burned a
  // full round-trip and the first screen still paid the real fetch cold.
  getRoleContext(accessToken)
    .then((ctx) =>
      refreshSummary(accessToken, clubDefaultProgramId(ctx.memberships) ?? undefined),
    )
    .catch(() => {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<NexusUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  /** Refresh the stored session and adopt the new token into React state.
   *  Null = no refresh flow or it failed; the caller decides what that means. */
  const attemptRefresh = useCallback(async (): Promise<string | null> => {
    const session = await refreshStoredSession();
    if (!session) return null;
    setTokenState(session.access_token);
    setExpiresAt(session.expires_at ?? null);
    return session.access_token;
  }, []);

  // Restore the session on app launch: stored session → verify against
  // /auth/me. A token already past (or within a minute of) its expiry is
  // refreshed FIRST when we hold a refresh token — the old behavior of
  // "verify, fail, sign out" only remains for sessions with no refresh flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored = await getSession();
      if (!stored) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      if (
        stored.refresh_token &&
        stored.expires_at &&
        stored.expires_at * 1000 < Date.now() + 60_000
      ) {
        stored = (await refreshStoredSession()) ?? stored;
      }
      try {
        // Prime alongside the verification round-trip, not after it — on an
        // expired token these are two caught failures, on a live one they're
        // a head start. Same ordering as adoptSession.
        primeSessionCaches(stored.access_token);
        const me = await fetchMe(stored.access_token);
        if (!cancelled) {
          setTokenState(stored.access_token);
          setExpiresAt(stored.expires_at ?? null);
          setUser(me);
          setStatus("signedIn");
        }
      } catch {
        // Expired or invalid session — drop it and start signed out.
        await clearToken();
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptSession = useCallback(async (session: Session) => {
    // Prime FIRST: the caches' fetches ride alongside our own /auth/me below
    // instead of queueing behind it — the summary (the Coach tab's name and
    // counts) is one round-trip closer by the time the tabs appear.
    primeSessionCaches(session.access_token);
    const me = await fetchMe(session.access_token);
    await setSession({
      access_token: session.access_token,
      ...(session.refresh_token ? { refresh_token: session.refresh_token } : {}),
      ...(session.expires_at != null ? { expires_at: session.expires_at } : {}),
    });
    setTokenState(session.access_token);
    setExpiresAt(session.expires_at ?? null);
    setUser(me);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Sign-in lands only after the warm-up sweep the login screen started
      // has settled (owner request 2026-08-06): the app is entered with every
      // backend already touched once, instead of paying cold starts screen by
      // screen. The sweep is time-capped, so this can never hang the door.
      const [session] = await Promise.all([
        login({ email, password }),
        prewarmAllDone(),
      ]);
      await adoptSession(session);
    },
    [adoptSession],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const gate = await fetchGate();
      const result = await gateSignup(gate.id, input);
      if (result.access_token && !result.pending) {
        setNeedsOnboarding(true);
        await adoptSession({
          access_token: result.access_token,
          ...(result.refresh_token ? { refresh_token: result.refresh_token } : {}),
          ...(result.expires_at != null ? { expires_at: result.expires_at } : {}),
        });
        return { pending: false };
      }
      // Approval-required gates admit later; there is no session yet.
      return { pending: true };
    },
    [adoptSession],
  );

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const me = await fetchMe(token);
    setUser(me);
  }, [token]);

  const signOut = useCallback(async () => {
    await clearToken();
    clearLearningCache();
    clearLaunchCache();
    clearBridgeRoleCache();
    clearBridgeMeCache();
    clearAllBridgeCaches();
    clearSummaryCache();
    clearAvatarCache();
    clearDealChats();
    setTokenState(null);
    setExpiresAt(null);
    setUser(null);
    setNeedsOnboarding(false);
    setStatus("signedOut");
  }, []);

  // ── Sessions stay alive; dead ones end at the login screen ────────────────
  // The access token lives ONE HOUR; the refresh token (when the backend
  // mints one) is what carries a session past it. Three nets, in order:
  //
  //  1. A timer refreshes proactively ~5 minutes before expiry, so in normal
  //     use nobody ever holds a dead token.
  //  2. Returning to the FOREGROUND refreshes when expiry is near, else
  //     revalidates the token, so the tester's "played, came back 10 hours
  //     later" resumes silently instead of at a broken screen.
  //  3. The request layer retries a token-bearing 401 once after a refresh
  //     (session-expiry.ts); only when the refresh can't happen does the
  //     whole app sign out at once — the pre-refresh behavior, kept for
  //     sessions with no refresh flow (demo mode / older backend).
  useEffect(() => {
    if (status !== "signedIn") {
      onSessionExpired(null);
      onSessionRefresh(null);
      return;
    }
    onSessionExpired(() => {
      void signOut();
    });
    onSessionRefresh(attemptRefresh);
    return () => {
      onSessionExpired(null);
      onSessionRefresh(null);
    };
  }, [status, signOut, attemptRefresh]);

  // Net 1: the proactive timer. Re-arms itself through setExpiresAt — a
  // successful refresh lands a new expiry, which schedules the next one.
  useEffect(() => {
    if (status !== "signedIn" || !expiresAt) return;
    const fireIn = Math.max(expiresAt * 1000 - Date.now() - 5 * 60_000, 15_000);
    const timer = setTimeout(() => {
      // Failure changes nothing here — nets 2 and 3 still stand behind it.
      void attemptRefresh();
    }, fireIn);
    return () => clearTimeout(timer);
  }, [status, expiresAt, attemptRefresh]);

  const lastRevalidate = useRef(0);
  useEffect(() => {
    if (status !== "signedIn" || !token) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastRevalidate.current < 60_000) return;
      lastRevalidate.current = Date.now();
      // Near (or past) expiry with a refresh token in hand: refresh instead
      // of poking /auth/me with a token we already suspect. Otherwise a dead
      // token 401s inside fetchMe, which reports through the wire above and
      // signs out; any other failure (offline, a cold server) is not the
      // token's fault and changes nothing.
      if (expiresAt && expiresAt * 1000 - Date.now() < 10 * 60_000) {
        void attemptRefresh();
        return;
      }
      fetchMe(token).catch(() => {});
    });
    return () => sub.remove();
  }, [status, token, expiresAt, attemptRefresh]);

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      token,
      needsOnboarding,
      completeOnboarding,
      signIn,
      signUp,
      signOut,
      refreshUser,
    }),
    [status, user, token, needsOnboarding, completeOnboarding, signIn, signUp, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
