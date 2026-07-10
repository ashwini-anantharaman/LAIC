import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { listApps, createApp, updateApp, rotateAppKey, getAppLaunchContext } from "../../../services/api";
import type { AllowedIdentifiers, AppStatus, RegisteredApp } from "../../../types/platform";
import { ApiKeyRevealDialog } from "./ApiKeyRevealDialog";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const IDENTIFIER_OPTIONS: { key: AllowedIdentifiers; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "both", label: "Email + Phone" },
];

const STATUS_OPTIONS: AppStatus[] = ["active", "paused", "revoked"];

export function RegisteredAppPanel({
  programId,
  offeringId,
  accent,
}: {
  programId: string;
  offeringId: string;
  accent: string;
}) {
  const [app, setApp] = useState<RegisteredApp | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const [appName, setAppName] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");
  const [allowed, setAllowed] = useState<AllowedIdentifiers>("email");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listApps(programId)
      .then((apps) => setApp(apps.find((a) => a.offering_id === offeringId) || null))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load registered app"));
  }, [programId, offeringId]);

  async function register() {
    if (!appName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createApp(programId, {
        app_name: appName.trim(),
        offering_id: offeringId,
        allowed_identifiers: allowed,
        launch_url: launchUrl.trim() || undefined,
      });
      setApp(created);
      setRevealKey(created.api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register app");
    } finally {
      setBusy(false);
    }
  }

  async function saveField(patch: Partial<{ launch_url: string; allowed_identifiers: AllowedIdentifiers; status: AppStatus }>) {
    if (!app) return;
    try {
      const updated = await updateApp(app.id, patch);
      setApp(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update app");
    }
  }

  async function rotate() {
    if (!app) return;
    if (!window.confirm("Rotate this app's API key? The old key will stop working immediately.")) return;
    setBusy(true);
    try {
      const updated = await rotateAppKey(app.id);
      setApp(updated);
      setRevealKey(updated.api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate key");
    } finally {
      setBusy(false);
    }
  }

  async function openApp() {
    if (!app) return;
    setBusy(true);
    setError("");
    try {
      const ctx = await getAppLaunchContext(app.id);
      const base = (ctx.launch_url || app.launch_url || "").replace(/\/$/, "");
      if (!base) {
        setError("Set a launch URL first");
        return;
      }
      window.open(`${base}/?lt=${encodeURIComponent(ctx.launch_token)}`, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open app");
    } finally {
      setBusy(false);
    }
  }

  if (app === undefined) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
      {app === null ? (
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
          <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            No app registered for this offering yet. Register one to get an API key for the signup hook.
          </p>
          <input
            type="text" value={appName} onChange={(e) => setAppName(e.target.value)}
            placeholder="App name (e.g. Brain Bee Course App)"
            className="w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
            style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
          />
          <input
            type="text" value={launchUrl} onChange={(e) => setLaunchUrl(e.target.value)}
            placeholder="Launch URL (optional)"
            className="w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
            style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {IDENTIFIER_OPTIONS.map((o) => (
                <button
                  key={o.key} type="button" onClick={() => setAllowed(o.key)}
                  className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-all focus:outline-none"
                  style={{ background: allowed === o.key ? accent : "transparent", color: allowed === o.key ? "#111" : MUTED, fontFamily: FONT_BODY }}
                >{o.label}</button>
              ))}
            </div>
            <button
              type="button" onClick={register} disabled={busy}
              className="px-4 h-9 rounded-lg text-xs font-semibold transition-all focus:outline-none disabled:opacity-50"
              style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
            >{busy ? "Registering…" : "Register app"}</button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{app.app_name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                slug: {app.app_slug} · key: {app.key_prefix || "hidden"}…
              </p>
            </div>
            <select
              value={app.status}
              onChange={(e) => saveField({ status: e.target.value as AppStatus })}
              className="h-8 rounded-lg px-2 text-xs text-white outline-none"
              style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <input
            type="text" defaultValue={app.launch_url || ""}
            onBlur={(e) => { if (e.target.value !== (app.launch_url || "")) saveField({ launch_url: e.target.value }); }}
            placeholder="Launch URL"
            className="w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
            style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              {IDENTIFIER_OPTIONS.map((o) => {
                const on = app.allowed_identifiers === o.key;
                return (
                  <button
                    key={o.key} type="button" onClick={() => saveField({ allowed_identifiers: o.key })}
                    className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-all focus:outline-none"
                    style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}
                  >{o.label}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={rotate} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}
              >
                <RefreshCw size={13} /> Rotate key
              </button>
              {app.status === "active" && (
                <button
                  type="button" onClick={openApp} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors focus:outline-none disabled:opacity-50"
                  style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
                >
                  <ExternalLink size={13} /> Open app
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <ApiKeyRevealDialog open={!!revealKey} onOpenChange={(o) => !o && setRevealKey(null)} apiKey={revealKey} accent={accent} />
    </div>
  );
}
