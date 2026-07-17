/**
 * Session context — the three modes from the prototype (nexus / org / member).
 *
 * The mode is derived from the authenticated user's role + memberships:
 *   - "nexus"  : platform operator (role platform_admin). Sees only Organizations
 *                + platform audit; can NEVER enter an org's interior.
 *   - "org"    : org administrator/owner (an org-scoped membership). Full reach
 *                inside that one org's space.
 *   - "member" : program-scoped membership only. Confined to the areas their
 *                role grants (see §3.5 of the implementation plan).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearToken, getMe, getToken, login as apiLogin } from "@/services/api";
import type { MembershipSummary, MeResponse } from "@/types/platform";

export type SessionMode = "nexus" | "org" | "member";

/** Dev-only "Test as role": preview a program confined to a role's granted areas. */
export interface Impersonation {
  roleName: string;
  perms: Record<string, string>;
  orgId: string;
  programId: string;
}

export interface Session {
  loading: boolean;
  user: MeResponse | null;
  mode: SessionMode | null;
  /** Org-scoped admin memberships (program_id == null). */
  orgMemberships: MembershipSummary[];
  /** Program-scoped memberships. */
  programMemberships: MembershipSummary[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Dev impersonation (null when not testing a role). */
  impersonation: Impersonation | null;
  startImpersonation: (imp: Impersonation) => void;
  stopImpersonation: () => void;
}

function deriveMode(me: MeResponse | null): SessionMode | null {
  if (!me) return null;
  if (me.role === "platform_admin") return "nexus";
  const hasOrgAdmin = me.memberships.some(
    (m) => !m.program_id && (m.role === "owner" || m.role === "administrator"),
  );
  if (hasOrgAdmin) return "org";
  return "member";
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [impersonation, setImpersonation] = useState<Impersonation | null>(null);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    setUser(await getMe());
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setImpersonation(null);
  }, []);

  const startImpersonation = useCallback((imp: Impersonation) => setImpersonation(imp), []);
  const stopImpersonation = useCallback(() => setImpersonation(null), []);

  const value = useMemo<Session>(() => {
    const memberships = user?.memberships ?? [];
    return {
      loading,
      user,
      mode: deriveMode(user),
      orgMemberships: memberships.filter((m) => !m.program_id),
      programMemberships: memberships.filter((m) => m.program_id),
      login,
      logout,
      refresh,
      impersonation,
      startImpersonation,
      stopImpersonation,
    };
  }, [loading, user, login, logout, refresh, impersonation, startImpersonation, stopImpersonation]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used within <SessionProvider>");
  return s;
}
