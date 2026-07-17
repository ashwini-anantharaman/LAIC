/**
 * Effective program access for the current viewer — the single source both the
 * confined sidebar nav and the program overview use to decide what a person can
 * see (§3.5). Program administrators/owners get the full workspace; a plain
 * member (or a dev "Test as role" preview) is confined to their role's granted
 * areas.
 */
import { useEffect, useState } from "react";

import { getMyProgramRole } from "@/services/api";
import { useSession } from "@/nexus/session";

export interface ProgramAccess {
  loading: boolean;
  /** Full workspace (program admin/owner, or org/nexus altitude). */
  isAdmin: boolean;
  /** A dev "Test as role" preview (confined, but never auto-redirected). */
  impersonating: boolean;
  /** Effective role perms when confined; empty for admins. */
  perms: Record<string, string>;
}

export function useProgramAccess(programId: string): ProgramAccess {
  const { mode, impersonation, programMemberships } = useSession();
  const impersonating = impersonation && impersonation.programId === programId ? impersonation : null;
  const programMembership = programId ? programMemberships.find((m) => m.program_id === programId) : undefined;
  const isPlainMember =
    mode === "member" && !!programMembership && !["administrator", "owner"].includes(programMembership.role);

  const [fetched, setFetched] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (impersonating || !isPlainMember || !programId) {
      setFetched(null);
      return;
    }
    let live = true;
    getMyProgramRole(programId)
      .then((r) => live && setFetched((r?.perms as Record<string, string>) ?? {}))
      .catch(() => live && setFetched({}));
    return () => {
      live = false;
    };
  }, [isPlainMember, programId, !!impersonating]);

  if (impersonating) return { loading: false, isAdmin: false, impersonating: true, perms: impersonating.perms };
  if (!isPlainMember) return { loading: false, isAdmin: true, impersonating: false, perms: {} };
  if (fetched === null) return { loading: true, isAdmin: false, impersonating: false, perms: {} };
  return { loading: false, isAdmin: false, impersonating: false, perms: fetched };
}
