/**
 * Reflect the current context in the browser tab: document.title and the
 * favicon follow whatever level (Nexus / org / program) the shell is showing,
 * so a tab reads "Life in AI Center" with that org's logo instead of a generic
 * "Nexus Platform". Driven by the same branding the sidebar brand slot uses.
 */
import { useEffect } from "react";

const DEFAULT_TITLE = "Nexus";

export function useDocumentChrome(title: string | null | undefined, faviconUrl: string | null | undefined): void {
  useEffect(() => {
    document.title = title?.trim() || DEFAULT_TITLE;
  }, [title]);

  useEffect(() => {
    // Reuse our managed link so we don't stack duplicate <link rel="icon">.
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-nexus="1"]');
    if (faviconUrl) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.dataset.nexus = "1";
        document.head.appendChild(link);
      }
      if (link.href !== faviconUrl) link.href = faviconUrl;
    } else if (link) {
      // No logo for this level — drop our override so the browser default shows.
      link.remove();
    }
  }, [faviconUrl]);
}
