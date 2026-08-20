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
import { Test1 } from "@/nexus/routes/Test1";
import { Test2 } from "@/nexus/routes/Test2";
import { PartnerLogin } from "@/nexus/routes/PartnerLogin";
import { AccessCatalogue } from "@/nexus/access/AccessCatalogue";
import { OrgAccessCatalogue, ProgramAccessCatalogue } from "@/nexus/access/InstanceAccessCatalogue";
import { OperatorGates } from "@/nexus/routes/OperatorGates";
import { OrgTeam } from "@/nexus/routes/OrgTeam";
import { OrgGates } from "@/nexus/routes/OrgGates";
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
import { ContentLibraryTab } from "@/nexus/routes/ContentLibraryTab";
import { BridgeLaunch } from "@/nexus/routes/BridgeLaunch";
import { Spinner } from "@/nexus/ui/kit";
import { opensContentLibrary } from "@/nexus/access";
import { getMyProgramRole } from "@/services/api";
import { SessionProvider, useSession } from "@/nexus/session";
import { apiConfigError } from "@/services/apiBase";
import { BootBoundary, BootFailure } from "@/nexus/BootFailure";

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
        const perms = (r?.perms as Record<string, unknown>) ?? {};
        const platforms = Object.keys(perms).filter((k) => PLATFORM_PATHS[k]);
        const others = Object.keys(perms).filter((k) => NON_PLATFORM_AREAS.includes(k));
        // THE CONTENT LIBRARY IS A DESTINATION. It is keyed on a capability
        // rather than an area — that is what lets it be narrower than the whole
        // Content Studio — so counting the perms keys alone cannot see it, and a
        // Content Manager (one area: Content Studio) looked like someone with
        // exactly one place to go. They were sent full-screen into the Studio,
        // past the tab built for them.
        //
        // Capabilities live INSIDE the perms blob (routes/offerings.ts writes
        // `{ ...perms, capabilities }`), which is why this reads a key rather
        // than a second request.
        const caps = Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
        const hasLibrary = opensContentLibrary(caps);
        if (platforms.length === 1 && others.length === 0 && !hasLibrary) {
          setDest(`/o/${orgId}/p/${programId}/${PLATFORM_PATHS[platforms[0]]}`);
        } else if (platforms.length === 0 && others.length === 0 && hasLibrary) {
          // The library as someone's whole remit: the overview would be an empty
          // page, so give them the same straight-in courtesy.
          setDest(`/o/${orgId}/p/${programId}/learning/library`);
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
      {/* Nexus (operator) gate — no org slug; GatePage resolves it as nexus. */}
      <Route path="/op/:gateSlug" element={<GatePage />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      {/* Partner ("sister program") login portal — its members sign in here. */}
      <Route path="/partner/:slug" element={<PartnerLogin />} />
      {/* A partner's own sign-up gate, under the partner's slug. */}
      <Route path="/partner/:slug/:gateSlug" element={<GatePage partner />} />
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
        <Route path="/access-catalogue" element={<AccessCatalogue />} />
        <Route path="/nexus-gates" element={<OperatorGates />} />
        <Route path="/test1" element={<Test1 />} />
        <Route path="/test2" element={<Test2 />} />
        {/* Org space */}
        <Route path="/o/:orgId/dashboard" element={<OrgDashboard />} />
        <Route path="/o/:orgId/programs" element={<Programs />} />
        <Route path="/o/:orgId/settings" element={<OrgSettings />} />
        <Route path="/o/:orgId/audit" element={<OrgAudit />} />
        <Route path="/o/:orgId/team" element={<OrgTeam />} />
        <Route path="/o/:orgId/access-catalogue" element={<OrgAccessCatalogue />} />
        <Route path="/o/:orgId/gates" element={<OrgGates />} />
        {/* Program workspace */}
        <Route path="/o/:orgId/p/:programId" element={<ProgramOverview />} />
        <Route path="/o/:orgId/p/:programId/offerings" element={<ProgramOfferings />} />
        <Route path="/o/:orgId/p/:programId/shells" element={<ProgramShells />} />
        <Route path="/o/:orgId/p/:programId/registrations" element={<ProgramRegistrations />} />
        <Route path="/o/:orgId/p/:programId/gates" element={<ProgramGates />} />
        <Route path="/o/:orgId/p/:programId/groups" element={<ProgramGroups />} />
        <Route path="/o/:orgId/p/:programId/community" element={<ProgramCommunity />} />
        {/* INSIDE the shell, unlike /learning — a tab keeps the program's own
            navigation, and only its panel changes. The Studio is framed there and
            asked for the library alone. */}
        <Route path="/o/:orgId/p/:programId/learning/library" element={<ContentLibraryTab />} />
        <Route path="/o/:orgId/p/:programId/team" element={<ProgramTeam />} />
        <Route path="/o/:orgId/p/:programId/access-catalogue" element={<ProgramAccessCatalogue />} />
        <Route path="/o/:orgId/p/:programId/partners" element={<ProgramPartners />} />
        <Route path="/o/:orgId/p/:programId/settings" element={<ProgramSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function NexusApp() {
  // Checked BEFORE anything else renders. A build with no API URL cannot do a
  // single useful thing, and the honest answer is a sentence saying so — the
  // alternative is every screen failing separately, or (when this used to throw
  // at import) no screen at all. See services/apiBase.ts for why it goes missing.
  const configError = apiConfigError();
  if (configError) {
    return <BootFailure title="The console is not configured" detail={configError} />;
  }

  return (
    <BootBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <SessionProvider>
          <BrowserRouter>
            <Routed />
          </BrowserRouter>
          <Toaster />
        </SessionProvider>
      </ThemeProvider>
    </BootBoundary>
  );
}
