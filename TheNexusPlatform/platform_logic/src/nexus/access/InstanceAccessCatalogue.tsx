/**
 * Instance-scoped Access Catalogue screens — the same editor as the Nexus
 * operator's, but bound to ONE org's / program's own customization of its
 * console catalogue (falls back to the shipped default until edited). Edit
 * rights follow the level: the org owner (Super Admin) edits the org catalogue;
 * a program admin edits the program catalogue. See ACCESS_CATALOGUE_DESIGN.md.
 */
import { useMemo } from "react";
import { useParams } from "react-router";

import { AccessCatalogue, type CatalogueSource } from "./AccessCatalogue";
import {
  getOrgCatalogue, saveOrgCatalogue, resetOrgCatalogue,
  getProgramCatalogue, saveProgramCatalogue, resetProgramCatalogue,
} from "./catalogue";
import { useSession } from "@/nexus/session";

export function OrgAccessCatalogue({ embedded = false }: { embedded?: boolean } = {}) {
  const { orgId = "" } = useParams();
  const { user } = useSession();
  const isOwner =
    user?.role === "platform_admin" ||
    (user?.memberships ?? []).some((m) => m.org_id === orgId && m.role === "owner" && !m.program_id);
  const source = useMemo<CatalogueSource>(() => ({
    title: "Access Catalog",
    canEdit: isOwner,
    load: () => getOrgCatalogue(orgId),
    save: (doc) => saveOrgCatalogue(orgId, doc),
    reset: () => resetOrgCatalogue(orgId),
  }), [orgId, isOwner]);
  return <AccessCatalogue source={source} embedded={embedded} />;
}

export function ProgramAccessCatalogue({ embedded = false }: { embedded?: boolean } = {}) {
  const { orgId = "", programId = "" } = useParams();
  const { user } = useSession();
  const isAdmin =
    user?.role === "platform_admin" ||
    (user?.memberships ?? []).some(
      (m) => m.org_id === orgId && ["owner", "administrator"].includes(m.role) && (!m.program_id || m.program_id === programId),
    );
  const source = useMemo<CatalogueSource>(() => ({
    title: "Access Catalog",
    canEdit: isAdmin,
    load: () => getProgramCatalogue(programId),
    save: (doc) => saveProgramCatalogue(programId, doc),
    reset: () => resetProgramCatalogue(programId),
  }), [programId, isAdmin]);
  return <AccessCatalogue source={source} embedded={embedded} />;
}
