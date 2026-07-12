/**
 * Demo consumer of @laic/app-shell.
 *
 * Everything shell-shaped (splash, welcome, auth, onboarding, frame, gates)
 * comes from the package. This file owns only what a real consuming app
 * would: config loading, a platform client, a router, and the content
 * modules mounted past the door.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell, EntitlementGate } from "@laic/app-shell";
import type { AppShellConfig, LaunchContext } from "@laic/app-shell";
import { getPublicConfig } from "./configRegistry";
import { createMockClient } from "./mockClient";
import { MODULE_REGISTRY } from "./moduleRegistry";
import { VariantPicker } from "./VariantPicker";
import { EditorPage } from "./editor/EditorPage";

const VARIANT_KEY = "laic_shell.variant";

function resolveVariant(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("app");
  if (fromUrl) {
    localStorage.setItem(VARIANT_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(VARIANT_KEY);
}

/** The consumer's content — mounted by the shell once the user is through the door. */
function ModuleRoutes({ ctx, config, onNavigate }: { ctx: LaunchContext; config: AppShellConfig; onNavigate: (to: string) => void }) {
  const enabled = MODULE_REGISTRY.filter((m) => config.enabledModules[m.key]);
  // A module mounts behind a gate when any nav tab into its prefix names a
  // required entitlement (e.g. Coach Studio → coaching_pro).
  const gateFor = (prefix: string) =>
    config.navigation.tabs.find((t) => t.route.startsWith(prefix) && t.requiredEntitlement)?.requiredEntitlement;

  return (
    <Suspense fallback={<div className="loading-page">Loading module…</div>}>
      <Routes>
        {enabled.map((m) => (
          <Route
            key={m.key}
            path={`${m.routePrefix}/*`}
            element={
              <EntitlementGate required={gateFor(m.routePrefix)} config={config} ctx={ctx} onNavigate={onNavigate}>
                <m.Component ctx={ctx} config={config} />
              </EntitlementGate>
            }
          />
        ))}
        <Route path="*" element={<Navigate to={ctx.defaultRoute} replace />} />
      </Routes>
    </Suspense>
  );
}

/** Adapts react-router to the shell's injected ShellNavigation. */
function ShellWithRouter({ config }: { config: AppShellConfig }) {
  const nav = useNavigate();
  const loc = useLocation();
  const client = useMemo(() => createMockClient(config.slug), [config.slug]);
  const navigation = useMemo(() => ({ path: loc.pathname, navigate: nav }), [loc.pathname, nav]);

  return (
    <AppShell config={config} client={client} navigation={navigation}>
      {(ctx) => <ModuleRoutes ctx={ctx} config={config} onNavigate={nav} />}
    </AppShell>
  );
}

export default function App() {
  const [variant, setVariant] = useState<string | null>(resolveVariant);
  const [config, setConfig] = useState<AppShellConfig | null>(null);
  const [bootError, setBootError] = useState("");
  const isEditor = window.location.pathname.startsWith("/editor");

  useEffect(() => {
    if (!variant || isEditor) return;
    setConfig(null);
    getPublicConfig(variant)
      .then(setConfig)
      .catch((e) => {
        localStorage.removeItem(VARIANT_KEY);
        setBootError(e instanceof Error ? e.message : "Failed to load app config");
      });
  }, [variant, isEditor]);

  // Admin surface: /editor — edits the same config records the apps boot from.
  if (isEditor) return <EditorPage />;

  if (!variant || bootError) {
    return (
      <>
        {bootError && <div className="boot-error">{bootError}</div>}
        <VariantPicker
          onPick={(slug) => {
            setBootError("");
            localStorage.setItem(VARIANT_KEY, slug);
            setVariant(slug);
          }}
        />
      </>
    );
  }

  if (!config) return <div className="loading-page">Loading config…</div>;

  return (
    <BrowserRouter>
      <ShellWithRouter key={config.slug} config={config} />
      {/* Dev-only escape hatch back to the launcher. */}
      <button
        className="dev-switch"
        title="Switch app (dev)"
        onClick={() => {
          localStorage.removeItem(VARIANT_KEY);
          window.location.href = window.location.pathname;
        }}
      >
        ⇄
      </button>
    </BrowserRouter>
  );
}
