import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { clearBridgeRoleCache, getRoleContext } from "./bridge-role";
import { clearLaunchCache } from "./launch-cache";
import { clearLearningCache } from "./learning";
import { prewarmAllDone } from "./prewarm";
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
