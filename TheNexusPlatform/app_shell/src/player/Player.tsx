/**
 * The published app, standalone. This is what a shared link opens: the app
 * running full-screen with NO studio chrome — a real thing to hand to a tester.
 * On a phone it fills the screen; on desktop it centers in a mobile-width
 * column. The same AppPreview runtime powers it.
 */
import { useEffect, useState } from "react";
import type { AppShellConfig, PreviewScreen } from "../types";
import { AppPreview } from "../preview/AppPreview";
import { applyPlayerManifest } from "../pwa";

function useAppChrome(config: AppShellConfig) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = config.name || "App";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const prevColor = meta.content;
    meta.content = config.accentColor;
    return () => {
      document.title = prevTitle;
      if (meta) meta.content = prevColor;
    };
  }, [config]);

  // Make the page installable AS this app (per-app manifest + icon).
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let stale = false;
    void applyPlayerManifest(config).then((fn) => (stale ? fn() : (cleanup = fn)));
    return () => {
      stale = true;
      cleanup?.();
    };
  }, [config]);
}

export function Player({ config }: { config: AppShellConfig }) {
  const [screen, setScreen] = useState<PreviewScreen>("start");
  const [role, setRole] = useState("");
  useAppChrome(config);

  function onScreen(s: PreviewScreen) {
    if (s !== "start" && !role) setRole(config.roles[0]?.label ?? "");
    setScreen(s);
  }

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#0b0f1a]">
      <div className="relative flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-[#f8f8fb] shadow-2xl">
        <AppPreview config={config} screen={screen} role={role} onScreen={onScreen} onRole={setRole} />
        <a
          href={location.origin + location.pathname}
          className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-medium text-gray-400/70 hover:text-gray-600"
          title="Open the App Shell Studio"
        >
          Studio ›
        </a>
      </div>
    </div>
  );
}

export function MissingLinkScreen({ id }: { id: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center" style={{ backgroundColor: "#0c0c10" }}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl text-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
        ?
      </div>
      <div>
        <h1 className="text-lg font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
          Preview not found here
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
          The short link <code className="font-mono">?app={id}</code> only opens in the browser it was published from. Ask
          for the <b>"any device"</b> link (it carries the app inside the URL), or open the Studio.
        </p>
      </div>
      <a
        href={location.origin + location.pathname}
        className="rounded-lg px-4 py-2 text-xs font-semibold"
        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        Open the Studio
      </a>
    </div>
  );
}
