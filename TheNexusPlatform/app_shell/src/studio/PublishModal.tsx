import { useMemo, useState } from "react";
import type { AppShellConfig } from "../types";
import { copyToClipboard, portableLink, publishToRegistry, shortLink } from "../share";
import { APP_VERSION, bundleIdFor, downloadBuildPackage } from "../packaging";
import type { HandoffScope } from "../nexus/handoff";
import { NexusPublish } from "./NexusPublish";

export function PublishModal({
  config,
  scope,
  onClose,
}: {
  config: AppShellConfig;
  /** Set when this Studio is scoped to one registered app — publish is bound to it. */
  scope?: HandoffScope | null;
  onClose: () => void;
}) {
  // Publishing = save to the registry (for the short link) and derive both links.
  const { short, portable } = useMemo(() => {
    publishToRegistry(config);
    return { short: shortLink(config.id), portable: portableLink(config) };
  }, [config]);

  const [copied, setCopied] = useState<"portable" | "short" | null>(null);
  async function copy(which: "portable" | "short", text: string) {
    if (await copyToClipboard(text)) {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1600);
    }
  }

  const [pkg, setPkg] = useState<"idle" | "working" | "done">("idle");
  async function downloadPackage() {
    setPkg("working");
    try {
      await downloadBuildPackage(config);
      setPkg("done");
      setTimeout(() => setPkg("idle"), 2000);
    } catch {
      setPkg("idle");
    }
  }

  const linkRow = (
    which: "portable" | "short",
    label: string,
    hint: string,
    link: string,
    withOpen?: boolean,
  ) => (
    <div>
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>
        {label}
      </p>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: "#0f0f16", border: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="flex-1 truncate font-mono text-xs" style={{ color: "rgba(255,255,255,0.45)" }} title={link}>
          {link}
        </span>
        {withOpen && (
          <button
            onClick={() => window.open(link, "_blank", "noopener")}
            className="flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            Open
          </button>
        )}
        <button
          onClick={() => copy(which, link)}
          className="flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold"
          style={{ backgroundColor: `${config.accentColor}22`, color: config.accentColor }}
        >
          {copied === which ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-[9px]" style={{ color: "rgba(255,255,255,0.22)" }}>
        {hint}
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl" style={{ backgroundColor: "#16161f", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        <div className="px-5 pb-4 pt-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="mb-1 flex items-center gap-2">
            <div
              className="grid h-5 w-5 place-items-center overflow-hidden rounded text-[8px] font-bold"
              style={{ backgroundColor: config.logoUrl ? "transparent" : config.accentColor, color: config.accentForeground }}
            >
              {config.logoUrl ? <img src={config.logoUrl} alt="" className="h-full w-full object-cover" /> : config.logoInitials}
            </div>
            <h2 className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
              Publish {config.name || "App"}
            </h2>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
            Share a link and testers get the app running full-screen — sign in, onboard, and reach home. No install needed.
          </p>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <NexusPublish config={config} bound={scope ?? undefined} />
          {linkRow(
            "portable",
            "Shareable link — any device",
            "Carries the whole app inside the link. Long, but works anywhere with no setup.",
            portable,
          )}
          {linkRow(
            "short",
            "Short link — this browser",
            "Clean URL, but only resolves in the browser you published from (until a backend stores it).",
            short,
            true,
          )}
          <div className="rounded-xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>Screens</span>
              <span className="text-right text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>Start · Sign In · Onboarding · Home</span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <span className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.25)" }}>Snapshot</span>
              <span className="text-right text-[9px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {config.roles.length} roles · {config.onboardingQuestions.length} questions · {config.homeConfig.tiles.length} tiles
              </span>
            </div>
          </div>

          <div className="rounded-xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>
              Native build package
            </p>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {bundleIdFor(config.name)} · v{APP_VERSION}
              </span>
            </div>
            <button
              onClick={downloadPackage}
              disabled={pkg === "working"}
              className="w-full rounded-lg py-2 text-[11px] font-semibold"
              style={{ backgroundColor: `${config.accentColor}22`, color: config.accentColor }}
            >
              {pkg === "working" ? "Preparing…" : pkg === "done" ? "Downloaded ✓" : "Download build package (.json)"}
            </button>
            <p className="mt-1.5 text-[9px] leading-snug" style={{ color: "rgba(255,255,255,0.22)" }}>
              Frozen manifest + icons + config. Feed it to <code className="font-mono">pnpm package</code> → Capacitor → a
              signed store build (see docs/native-build.md).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <p className="flex-1 text-[9px] leading-snug" style={{ color: "rgba(255,255,255,0.22)" }}>
            Store packaging (PWA install & native builds) comes later — this link is for web testing now.
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold"
            style={{ backgroundColor: config.accentColor, color: config.accentForeground }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
