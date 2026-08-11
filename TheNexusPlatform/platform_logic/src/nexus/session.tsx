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
import { portalPath } from "@/nexus/orgResolver";
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
  /**
   * The org this session is operating inside — pinned by the portal (/@/slug)
   * a multi-org account signed in through, so LAIC and SCU stay distinct. Null
   * until resolved; callers fall back to the first membership.
   */
  activeOrgId: string | null;
  setActiveOrg: (orgId: string | null) => void;
  login: (email: string, password: string, orgSlug?: string) => Promise<void>;
  logout: () => void;
  /** Clear the session WITHOUT navigating — for flows that must stay on the
   *  page after signing out, e.g. accepting an invitation as someone else. */
  clearSession: () => void;
  refresh: () => Promise<void>;
  /** Dev impersonation (null when not testing a role). */
  impersonation: Impersonation | null;
  startImpersonation: (imp: Impersonation) => void;
  stopImpersonation: () => void;
}

function deriveMode(me: MeResponse | null): SessionMode | null {
  if (!me) return null;
  // Full operator, or a confined operator carrying a platform-scope role.
  if (me.role === "platform_admin" || me.nexus_role) return "nexus";
  // Any org-LEVEL membership (owner/administrator/member) gets the org space;
  // custom org roles confine the nav inside it.
  const hasOrgLevel = me.memberships.some((m) => !m.program_id);
  if (hasOrgLevel) return "org";
  const hasProgram = me.memberships.some((m) => m.program_id);
  return hasProgram ? "member" : "member";
}

const Ctx = createContext<Session | null>(null);

const ACTIVE_ORG_KEY = "nexus_active_org";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [impersonation, setImpersonation] = useState<Impersonation | null>(null);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null),
  );

  const setActiveOrg = useCallback((orgId: string | null) => {
    setActiveOrgIdState(orgId);
    if (typeof localStorage === "undefined") return;
    if (orgId) localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    else localStorage.removeItem(ACTIVE_ORG_KEY);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, orgSlug?: string) => {
      await apiLogin(email, password, orgSlug);
      const me = await getMe();
      setUser(me);
      // Pin the org whose portal was used, so a multi-org account lands in that
      // org (and not an arbitrary first membership). Prefer an org-level match.
      if (orgSlug) {
        const match =
          me.memberships.find((m) => m.org_slug === orgSlug && !m.program_id) ??
          me.memberships.find((m) => m.org_slug === orgSlug);
        if (match) setActiveOrg(match.org_id);
      }
    },
    [setActiveOrg],
  );

  const logout = useCallback(() => {
    // Send them back to the right door: an org member returns to the portal of
    // the org they were signed into (the active one), a platform operator to the
    // operator gate. Computed before clearing, then a hard redirect so the app
    // re-inits cleanly.
    const isOperator = user?.role === "platform_admin" || Boolean(user?.nexus_role);
    const memberships = user?.memberships ?? [];
    const orgSlug =
      (activeOrgId ? memberships.find((m) => m.org_id === activeOrgId && m.org_slug)?.org_slug : null) ??
      memberships.find((m) => m.org_slug)?.org_slug ??
      null;
    clearToken();
    setActiveOrg(null);
    setUser(null);
    setImpersonation(null);
    window.location.href = !isOperator && orgSlug ? portalPath(orgSlug) : "/login";
  }, [user, activeOrgId, setActiveOrg]);

  /**
   * Sign out in place. `logout` deliberately hard-redirects to the right door,
   * which is wrong when the current page IS the destination — the invite screen
   * needs the session gone and itself still mounted.
   */
  const clearSession = useCallback(() => {
    clearToken();
    setActiveOrg(null);
    setUser(null);
    setImpersonation(null);
  }, [setActiveOrg]);

  const startImpersonation = useCallback((imp: Impersonation) => setImpersonation(imp), []);
  const stopImpersonation = useCallback(() => setImpersonation(null), []);

  const value = useMemo<Session>(() => {
    const memberships = user?.memberships ?? [];
    return {
      loading,
      user,
      clearSession,
      mode: deriveMode(user),
      orgMemberships: memberships.filter((m) => !m.program_id),
      programMemberships: memberships.filter((m) => m.program_id),
      activeOrgId,
      setActiveOrg,
      login,
      logout,
      refresh,
      impersonation,
      startImpersonation,
      stopImpersonation,
    };
  }, [loading, user, activeOrgId, setActiveOrg, login, logout, clearSession, refresh, impersonation, startImpersonation, stopImpersonation]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used within <SessionProvider>");
  return s;
}
