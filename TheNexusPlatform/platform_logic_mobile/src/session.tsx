import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clearToken, getActiveOrgId, getMe, getToken, login as apiLogin, setActiveOrgId,
  type MeResponse, type MembershipSummary,
} from "./api";

export type SessionMode = "org" | "member" | null;

interface Session {
  loading: boolean;
  user: MeResponse | null;
  mode: SessionMode;
  activeOrgId: string | null;
  orgMemberships: MembershipSummary[];
  programMemberships: MembershipSummary[];
  setActiveOrg: (id: string | null) => void;
  login: (email: string, password: string, orgSlug?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

function deriveMode(me: MeResponse | null): SessionMode {
  if (!me) return null;
  if (me.role === "platform_admin" || me.nexus_role) return "org";
  if (me.memberships.some((m) => !m.program_id)) return "org";
  return "member";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => getActiveOrgId());

  const setActiveOrg = useCallback((id: string | null) => {
    setActiveOrgIdState(id);
    setActiveOrgId(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await getMe());
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string, orgSlug?: string) => {
    await apiLogin(email, password, orgSlug);
    await refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearToken();
    setActiveOrg(null);
    setUser(null);
  }, [setActiveOrg]);

  const value = useMemo<Session>(() => {
    const memberships = user?.memberships ?? [];
    return {
      loading,
      user,
      mode: deriveMode(user),
      activeOrgId,
      orgMemberships: memberships.filter((m) => !m.program_id),
      programMemberships: memberships.filter((m) => !!m.program_id),
      setActiveOrg,
      login,
      logout,
      refresh,
    };
  }, [loading, user, activeOrgId, setActiveOrg, login, logout, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
