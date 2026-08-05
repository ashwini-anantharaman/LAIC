import { createElement, useEffect } from "react";

/**
 * Web fallback for the native WebView: react-native-webview does not run in
 * the browser, so render a plain iframe when previewing with `expo start` + w.
 *
 * The iframe is cross-origin, so its location can't be read directly — the
 * embedded bridge pages post it instead (EmbedLocationReporter), which lets
 * the host skip needless reloads on tab switches.
 */
export function ContentWebView({
  url,
  onUrlChange,
  onHostMessage,
}: {
  url: string;
  onUrlChange?: (url: string) => void;
  /** Structured messages posted BY the embedded page (postMessage). */
  onHostMessage?: (data: unknown) => void;
}) {
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      const data = e.data as { type?: string; href?: string } | null;
      if (data?.type === "bridge:location" && typeof data.href === "string") {
        onUrlChange?.(data.href);
      } else if (data?.type) {
        onHostMessage?.(data);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onUrlChange, onHostMessage]);

  return createElement("iframe", {
    src: url,
    style: { flex: 1, width: "100%", height: "100%", border: 0 },
  });
}
