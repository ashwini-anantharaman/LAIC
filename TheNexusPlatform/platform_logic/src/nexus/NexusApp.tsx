/**
 * Nexus app root — providers + router. Replaces the Figma screen-state-machine
 * app with the prototype's information architecture:
 *   /login                          gate
 *   /orgs, /audit                   Nexus operator console
 *   /o/:orgId/{dashboard,programs,settings,audit}      org space
 *   /o/:orgId/p/:programId/*        program workspace
 */
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { Toaster } from "@/app/components/ui/sonner";
import { AppShell } from "@/nexus/layout/AppShell";
import { AcceptInvite } from "@/nexus/routes/AcceptInvite";
import { Login } from "@/nexus/routes/Login";
import { OrgPortal } from "@/nexus/routes/OrgPortal";
import { OperatorAudit } from "@/nexus/routes/OperatorAudit";
import { OperatorOrgs } from "@/nexus/routes/OperatorOrgs";
import { OrgAudit } from "@/nexus/routes/OrgAudit";
import { OrgDashboard } from "@/nexus/routes/OrgDashboard";
import { OrgSettings } from "@/nexus/routes/OrgSettings";
import { Programs } from "@/nexus/routes/Programs";
import {
  ProgramCommunity,
  ProgramGroups,
  ProgramOfferings,
  ProgramOverview,
  ProgramPartners,
  ProgramRegistrations,
  ProgramShells,
} from "@/nexus/routes/program";
import { ProgramTeam } from "@/nexus/routes/ProgramTeam";
import { ShellEditor } from "@/nexus/routes/ShellEditor";
import { LearningLaunch } from "@/nexus/routes/LearningLaunch";
import { BridgeLaunch } from "@/nexus/routes/BridgeLaunch";
import { Spinner } from "@/nexus/ui/kit";
import { SessionProvider, useSession } from "@/nexus/session";

/** Send an authenticated user to the surface their mode allows. */
function RootRedirect() {
  const { loading, user, mode, orgMemberships, programMemberships } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (mode === "nexus") return <Navigate to="/orgs" replace />;
  if (mode === "org") {
    const orgId = orgMemberships[0]?.org_id;
    return orgId ? <Navigate to={`/o/${orgId}/dashboard`} replace /> : <Login />;
  }
  const m = programMemberships[0];
  if (m?.program_id) return <Navigate to={`/o/${m.org_id}/p/${m.program_id}`} replace />;
  return <Navigate to="/login" replace />;
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
        {/* Org space */}
        <Route path="/o/:orgId/dashboard" element={<OrgDashboard />} />
        <Route path="/o/:orgId/programs" element={<Programs />} />
        <Route path="/o/:orgId/settings" element={<OrgSettings />} />
        <Route path="/o/:orgId/audit" element={<OrgAudit />} />
        {/* Program workspace */}
        <Route path="/o/:orgId/p/:programId" element={<ProgramOverview />} />
        <Route path="/o/:orgId/p/:programId/offerings" element={<ProgramOfferings />} />
        <Route path="/o/:orgId/p/:programId/shells" element={<ProgramShells />} />
        <Route path="/o/:orgId/p/:programId/shells/:appId" element={<ShellEditor />} />
        <Route path="/o/:orgId/p/:programId/registrations" element={<ProgramRegistrations />} />
        <Route path="/o/:orgId/p/:programId/groups" element={<ProgramGroups />} />
        <Route path="/o/:orgId/p/:programId/community" element={<ProgramCommunity />} />
        <Route path="/o/:orgId/p/:programId/team" element={<ProgramTeam />} />
        <Route path="/o/:orgId/p/:programId/partners" element={<ProgramPartners />} />
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
