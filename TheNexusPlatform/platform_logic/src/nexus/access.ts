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
  /**
   * The role's fine-grained capability ids, when it has any.
   *
   * These already ride INSIDE the perms blob — POST /programs/:id/roles stores
   * `{ ...perms, capabilities }` (routes/offerings.ts) — so this is a read of
   * something already on the wire, not a second fetch. Lifted out because
   * `perms` is typed as a string map and the capability list is an array living
   * under one of its keys.
   *
   * Empty for admins, who are not confined by capabilities at all.
   */
  capabilities: string[];
}

/**
 * Does this capability set open the Content Library?
 *
 * `learning.library.console` is the explicit "you may open this screen" grant,
 * but every OTHER library capability implies it. A role whose whole purpose is
 * "share content with clubs and people" and which does not draw the tab is a dead
 * grant: the server accepts the calls and the person has no screen to make them
 * from. That was reachable — the editor listed the capabilities as four
 * independent toggles, and ticking only the useful-sounding one produced a role
 * that did nothing.
 *
 * `console` still means something on its own: browse and nothing else.
 *
 * One list, used by all three gates — the sidebar, the login landing and the
 * overview's destination count. They disagreed once already, and a permission
 * that draws a door in one place and not another is the bug this whole area keeps
 * producing.
 */
export const CONTENT_LIBRARY_CAPABILITIES = [
  "learning.library.console",
  "learning.library.share_view",
  "learning.library.share_club",
  "learning.library.share_member",
  "learning.library.share_app",
  "learning.publish.app_target",
  "learning.app.publish_club",
  "learning.app.administer",
  "learning.library.upload",
  // Both of these NAME the Content Library and are useless without it — a role
  // given only "publish Studio content into a folder" and no way in would be the
  // granted-capability-with-no-screen failure this list exists to prevent.
  "learning.library.folder_manage",
  "learning.library.file_content",
];

export function opensContentLibrary(capabilities: string[]): boolean {
  return capabilities.some((c) => CONTENT_LIBRARY_CAPABILITIES.includes(c));
}

/**
 * OPENING THE CONTENT STUDIO IS ITS OWN PERMISSION.
 *
 * This used to be inferred: holding object.read/edit/create meant the Studio nav
 * appeared. That conflated two different questions, and the difference matters —
 *
 *   "may this person open the Content Studio"      the whole app: its library,
 *                                                  its create flow, every object
 *                                                  in the program
 *   "may this person edit THIS object's pipeline"   one object, reached from the
 *                                                  Content Library, granted per
 *                                                  FOLDER as review or edit
 *
 * A content editor trusted with one folder needs the second and must not get the
 * first. Under the old rule they always got both, because editing anything at all
 * was what opened the door.
 *
 * So the Studio now has one explicit capability and nothing else grants it.
 * Someone with no Studio access can still review or edit a pipeline — that runs
 * inside the Content Library.
 */
export const CONTENT_STUDIO_CAPABILITIES = ["learning.studio.access"];

export function opensContentStudio(capabilities: string[]): boolean {
  return capabilities.some((c) => CONTENT_STUDIO_CAPABILITIES.includes(c));
}

/** Pull the capability array out of a perms blob, tolerating its absence — a
 *  coarse role predates capabilities entirely and simply has none. */
function _capsOf(perms: Record<string, unknown> | null | undefined): string[] {
  const raw = perms?.capabilities;
  return Array.isArray(raw) ? (raw as string[]).filter((c) => typeof c === "string") : [];
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

  if (impersonating) {
    return {
      loading: false, isAdmin: false, impersonating: true,
      perms: impersonating.perms, capabilities: _capsOf(impersonating.perms),
    };
  }
  if (!isPlainMember) return { loading: false, isAdmin: true, impersonating: false, perms: {}, capabilities: [] };
  if (fetched === null) return { loading: true, isAdmin: false, impersonating: false, perms: {}, capabilities: [] };
  return { loading: false, isAdmin: false, impersonating: false, perms: fetched, capabilities: _capsOf(fetched) };
}
