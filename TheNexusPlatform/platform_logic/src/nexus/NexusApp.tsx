/**
 * Nexus app root — providers + router. Replaces the Figma screen-state-machine
 * app with the prototype's information architecture:
 *   /login                          gate
 *   /orgs, /audit                   Nexus operator console
 *   /o/:orgId/{dashboard,programs,settings,audit}      org space
 *   /o/:orgId/p/:programId/*        program workspace
 */
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { Toaster } from "@/app/components/ui/sonner";
import { AppShell } from "@/nexus/layout/AppShell";
import { AcceptInvite } from "@/nexus/routes/AcceptInvite";
import { Login } from "@/nexus/routes/Login";
import { OrgPortal } from "@/nexus/routes/OrgPortal";
import { OperatorAudit } from "@/nexus/routes/OperatorAudit";
import { OperatorOrgs } from "@/nexus/routes/OperatorOrgs";
import { OperatorSettings } from "@/nexus/routes/OperatorSettings";
import { NexusTeam } from "@/nexus/routes/NexusTeam";
import { OrgTeam } from "@/nexus/routes/OrgTeam";
import { ProgramSettings } from "@/nexus/routes/ProgramSettings";
import { OrgAudit } from "@/nexus/routes/OrgAudit";
import { OrgDashboard } from "@/nexus/routes/OrgDashboard";
import { OrgSettings } from "@/nexus/routes/OrgSettings";
import { Programs } from "@/nexus/routes/Programs";
import {
  ProgramCommunity,
  ProgramGates,
  ProgramGroups,
  ProgramOfferings,
  ProgramOverview,
  ProgramPartners,
  ProgramRegistrations,
  ProgramShells,
} from "@/nexus/routes/program";
import { ProgramTeam } from "@/nexus/routes/ProgramTeam";
import { GatePage } from "@/nexus/routes/GatePage";
import { LearningLaunch } from "@/nexus/routes/LearningLaunch";
import { BridgeLaunch } from "@/nexus/routes/BridgeLaunch";
import { Spinner } from "@/nexus/ui/kit";
import { getMyProgramRole } from "@/services/api";
import { SessionProvider, useSession } from "@/nexus/session";

/** Send an authenticated user to the surface their mode allows. */
function RootRedirect() {
  const { loading, user, mode, orgMemberships, programMemberships, activeOrgId } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (mode === "nexus") return <Navigate to="/orgs" replace />;
  if (mode === "org") {
    // Prefer the org this session was pinned to (the portal signed in through),
    // so a multi-org account isn't dropped into an arbitrary first membership.
    const pinned = activeOrgId && orgMemberships.some((m) => m.org_id === activeOrgId) ? activeOrgId : null;
    const orgId = pinned ?? orgMemberships[0]?.org_id;
    return orgId ? <Navigate to={`/o/${orgId}/dashboard`} replace /> : <Login />;
  }
  // Confined member: prefer a program in the pinned org (the portal signed in
  // through) when this account belongs to programs across more than one org.
  const m =
    (activeOrgId && programMemberships.find((pm) => pm.org_id === activeOrgId)) || programMemberships[0];
  if (m?.program_id) return <MemberLanding orgId={m.org_id} programId={m.program_id} role={m.role} />;
  return <Navigate to="/login" replace />;
}

// Areas that are full platforms (own surface) vs. in-shell pages. Mirrors the
// overview's card model.
const PLATFORM_PATHS: Record<string, string> = { learning: "learning", bridge: "bridge", appbuilder: "shells" };
const NON_PLATFORM_AREAS = ["community", "teams", "partners"];

/**
 * One routing decision at login, no intermediate screens: a member whose whole
 * access is a single platform goes STRAIGHT to that platform's launch route;
 * everyone else gets the program overview. One spinner until we know.
 */
function MemberLanding({ orgId, programId, role }: { orgId: string; programId: string; role: string }) {
  const [dest, setDest] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // Program admins keep the full workspace — no lookup needed.
    if (["administrator", "owner"].includes(role)) {
      setDest(`/o/${orgId}/p/${programId}`);
      return;
    }
    getMyProgramRole(programId)
      .then((r) => {
        if (!live) return;
        const perms = (r?.perms as Record<string, string>) ?? {};
        const platforms = Object.keys(perms).filter((k) => PLATFORM_PATHS[k]);
        const others = Object.keys(perms).filter((k) => NON_PLATFORM_AREAS.includes(k));
        if (platforms.length === 1 && others.length === 0) {
          setDest(`/o/${orgId}/p/${programId}/${PLATFORM_PATHS[platforms[0]]}`);
        } else {
          setDest(`/o/${orgId}/p/${programId}`);
        }
      })
      .catch(() => live && setDest(`/o/${orgId}/p/${programId}`));
    return () => {
      live = false;
    };
  }, [orgId, programId, role]);
  if (!dest) return <Spinner />;
  return <Navigate to={dest} replace />;
}

/** Gate: redirect to root (which routes by mode) if already signed in. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Routed() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/@/:slug" element={<OrgPortal />} />
      <Route path="/@/:slug/:gateSlug" element={<GatePage />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      {/* Full-screen launch surface — deliberately outside the AppShell chrome. */}
      <Route
        path="/o/:orgId/p/:programId/learning"
        element={
          <RequireAuth>
            <LearningLaunch />
          </RequireAuth>
        }
      />
      <Route
        path="/o/:orgId/p/:programId/bridge"
        element={
          <RequireAuth>
            <BridgeLaunch />
          </RequireAuth>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Nexus operator */}
        <Route path="/orgs" element={<OperatorOrgs />} />
        <Route path="/audit" element={<OperatorAudit />} />
        <Route path="/settings" element={<OperatorSettings />} />
        <Route path="/team" element={<NexusTeam />} />
        {/* Org space */}
        <Route path="/o/:orgId/dashboard" element={<OrgDashboard />} />
        <Route path="/o/:orgId/programs" element={<Programs />} />
        <Route path="/o/:orgId/settings" element={<OrgSettings />} />
        <Route path="/o/:orgId/audit" element={<OrgAudit />} />
        <Route path="/o/:orgId/team" element={<OrgTeam />} />
        {/* Program workspace */}
        <Route path="/o/:orgId/p/:programId" element={<ProgramOverview />} />
        <Route path="/o/:orgId/p/:programId/offerings" element={<ProgramOfferings />} />
        <Route path="/o/:orgId/p/:programId/shells" element={<ProgramShells />} />
        <Route path="/o/:orgId/p/:programId/registrations" element={<ProgramRegistrations />} />
        <Route path="/o/:orgId/p/:programId/gates" element={<ProgramGates />} />
        <Route path="/o/:orgId/p/:programId/groups" element={<ProgramGroups />} />
        <Route path="/o/:orgId/p/:programId/community" element={<ProgramCommunity />} />
        <Route path="/o/:orgId/p/:programId/team" element={<ProgramTeam />} />
        <Route path="/o/:orgId/p/:programId/partners" element={<ProgramPartners />} />
        <Route path="/o/:orgId/p/:programId/settings" element={<ProgramSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function NexusApp() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <SessionProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
        <Toaster />
      </SessionProvider>
    </ThemeProvider>
  );
}
