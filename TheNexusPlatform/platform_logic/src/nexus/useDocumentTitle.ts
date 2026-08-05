import { useEffect } from "react";

/**
 * Set the browser tab title to reflect the current context — "Nexus" in the
 * operator console, the organization's name inside an org's space. Ignores
 * empty/nullish values so a not-yet-loaded name doesn't blank the tab.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title && title.trim()) document.title = title.trim();
  }, [title]);
}
