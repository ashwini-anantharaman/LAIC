"use client";

// Embedded mode: report the embed's location to the HOST app on every
// client-side navigation. The coach app uses this to skip reloading the
// WebView/iframe when the user is already on the tab's start page — the
// difference between an instant tab switch and a full re-render. The
// payload is only the URL (nothing sensitive); the host filters by origin.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function EmbedLocationReporter() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      window.parent?.postMessage(
        { type: "bridge:location", href: window.location.href },
        "*",
      );
    } catch {
      // Not in a frame, or a sandboxed parent — nothing to report.
    }
  }, [pathname]);
  return null;
}
