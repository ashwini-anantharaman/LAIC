import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { clearBridgeRoleCache } from "./bridge-role";
import { clearLaunchCache } from "./launch-cache";
import { clearLearningCache } from "./learning";
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
    const me = await fetchMe(accessToken);
    await setToken(accessToken);
    setTokenState(accessToken);
    setUser(me);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await login({ email, password });
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
