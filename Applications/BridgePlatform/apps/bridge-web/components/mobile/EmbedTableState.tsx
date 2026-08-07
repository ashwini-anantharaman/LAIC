"use client";

// Embedded mode: report the TABLE's state to the HOST app whenever it
// changes. The coach app's back arrow needs one fact this page has and it
// doesn't — is this board finished? — so it can offer "save or discard"
// only when leaving would actually strand an unfinished board.
//
// Two channels, because the app embeds two ways: postMessage to the parent
// frame (the web iframe), and ReactNativeWebView.postMessage (the native
// WebView). Outside any embed both throw or no-op — nothing to report to.

import { useEffect } from "react";

export function EmbedTableState({ sessionId, phase }: { sessionId: string; phase: string }) {
  useEffect(() => {
    const message = { type: "bridge:table", sessionId, phase };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, "*");
      }
    } catch {
      // Sandboxed parent — nothing to report.
    }
    try {
      (
        window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }
      ).ReactNativeWebView?.postMessage(JSON.stringify(message));
    } catch {
      // Not inside a native WebView.
    }
  }, [sessionId, phase]);
  return null;
}
