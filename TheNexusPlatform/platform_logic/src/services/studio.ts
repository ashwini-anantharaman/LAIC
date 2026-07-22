/**
 * Console → App Shell Studio handoff.
 *
 * Opens the Studio (TheNexusPlatform/app_shell) for a registered app with the
 * admin's CURRENT session — no second sign-in. The session token travels in
 * the URL hash fragment (never sent to a server); the Studio validates it
 * against /auth/me, adopts it, loads the app's stored config, and scrubs the
 * URL. Set VITE_SHELL_STUDIO_URL when the Studio isn't on its dev default.
 */
import { getToken } from "./api";
import { getApiBaseUrl } from "./apiBase";

export function studioBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SHELL_STUDIO_URL as string | undefined;
  return (fromEnv && fromEnv !== "" ? fromEnv : "http://localhost:5175").replace(/\/+$/, "");
}

/** The minimum the Studio needs to identify the app (slug/name are cosmetic). */
export interface StudioApp {
  id: string;
  app_slug?: string;
  app_name?: string;
}

export function openInStudio(app: StudioApp, orgId: string, programId: string): void {
  const q = new URLSearchParams({
    nexus: getApiBaseUrl(),
    nxapp: app.id,
    program: programId,
    org: orgId,
    slug: app.app_slug ?? "",
    name: app.app_name ?? "App",
  });
  const token = getToken() ?? "";
  window.open(`${studioBaseUrl()}/?${q.toString()}#nxtoken=${encodeURIComponent(token)}`, "_blank");
}
