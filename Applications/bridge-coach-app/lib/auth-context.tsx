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

import { clearBridgeRoleCache, getRoleContext } from "./bridge-role";
import { clearLaunchCache } from "./launch-cache";
import { clearLearningCache } from "./learning";
import { prewarmAllDone } from "./prewarm";
import { onSessionExpired } from "./session-expiry";
import { clearSummaryCache, refreshSummary } from "./summary-cache";
import { fetchGate, fetchMe, gateSignup, login, NexusUser } from "./nexus";
import { clearToken, getToken, setToken } from "./token-store";

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
function primeSessionCaches(accessToken: string): void {
  getRoleContext(accessToken).catch(() => {});
  refreshSummary(accessToken).catch(() => {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<NexusUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Restore the session on app launch: stored token → verify against /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getToken();
      if (!stored) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      try {
        // Prime alongside the verification round-trip, not after it — on an
        // expired token these are two caught failures, on a live one they're
        // a head start. Same ordering as adoptSession.
        primeSessionCaches(stored);
        const me = await fetchMe(stored);
        if (!cancelled) {
          setTokenState(stored);
          setUser(me);
          setStatus("signedIn");
        }
      } catch {
        // Expired or invalid token — drop it and start signed out.
        await clearToken();
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptSession = useCallback(async (accessToken: string) => {
    // Prime FIRST: the caches' fetches ride alongside our own /auth/me below
    // instead of queueing behind it — the summary (the Coach tab's name and
    // counts) is one round-trip closer by the time the tabs appear.
    primeSessionCaches(accessToken);
    const me = await fetchMe(accessToken);
    await setToken(accessToken);
    setTokenState(accessToken);
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
      await adoptSession(session.access_token);
    },
    [adoptSession],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const gate = await fetchGate();
      const result = await gateSignup(gate.id, input);
      if (result.access_token && !result.pending) {
        setNeedsOnboarding(true);
        await adoptSession(result.access_token);
        return { pending: false };
      }
      // Approval-required gates admit later; there is no session yet.
      return { pending: true };
    },
    [adoptSession],
  );

  const signOut = useCallback(async () => {
    await clearToken();
    clearLearningCache();
    clearLaunchCache();
    clearBridgeRoleCache();
    clearSummaryCache();
    setTokenState(null);
    setUser(null);
    setNeedsOnboarding(false);
    setStatus("signedOut");
  }, []);

  // ── Dead sessions end at the login screen, not in local errors ────────────
  // The session token lives ONE HOUR and there is no refresh flow, so an app
  // left open outlives its own credentials. Two nets catch that:
  //
  //  1. The request layer reports any token-bearing 401 (session-expiry.ts) —
  //     whichever screen trips it first, the whole app signs out at once.
  //  2. Returning to the FOREGROUND revalidates the token immediately, so the
  //     tester's "played, came back 10 hours later" hits the login screen
  //     right away instead of a broken New-board screen (2026-08-08 report;
  //     "works after restarting the app" was this check, done manually).
  useEffect(() => {
    if (status !== "signedIn") {
      onSessionExpired(null);
      return;
    }
    onSessionExpired(() => {
      void signOut();
    });
    return () => onSessionExpired(null);
  }, [status, signOut]);

  const lastRevalidate = useRef(0);
  useEffect(() => {
    if (status !== "signedIn" || !token) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastRevalidate.current < 60_000) return;
      lastRevalidate.current = Date.now();
      // A dead token 401s inside fetchMe, which reports through the wire
      // above and signs out; any other failure (offline, a cold server) is
      // not the token's fault and changes nothing.
      fetchMe(token).catch(() => {});
    });
    return () => sub.remove();
  }, [status, token]);

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
    }),
    [status, user, token, needsOnboarding, completeOnboarding, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
