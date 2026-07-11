/**
 * App Shell editor — Nexus v0.4 §6.
 *
 * v0.4 re-adopts the App Shell as the single configurable app object: identity,
 * theme, navigation, onboarding/signup fields, role labels, auth, the signup-hook
 * credential, and launch context. The backend still stores a RegisteredApp plus
 * the offering's signup fields/labels, so this editor persists across both:
 *  - App record (name, status, allowed identifiers, launch URL) via updateApp,
 *    with the extra shell config (appType, theme, nav, flags) tucked into the
 *    app's launch_context.shell blob.
 *  - Offering (signup fields, approval mode, participant labels, module) via
 *    updateOffering.
 * One "app object" from the admin's point of view.
 */
import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink, Save } from "lucide-react";
import {
  listApps, createApp, updateApp, rotateAppKey, getAppLaunchContext, updateOffering,
} from "../../../services/api";
import { DEFAULT_SIGNUP_FIELDS } from "../../../types/platform";
import type {
  AllowedIdentifiers, AppShellConfig, AppStatus, AppType, ApprovalMode,
  Offering, PlatformModule, RegisteredApp, SignupField,
} from "../../../types/platform";
import { SignupFieldsEditor } from "../offerings/SignupFieldsEditor";
import { ApiKeyRevealDialog } from "../offerings/ApiKeyRevealDialog";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const APP_TYPES: { key: AppType; label: string }[] = [
  { key: "course_app", label: "Course app" },
  { key: "challenge_app", label: "Challenge app" },
  { key: "coaching_app", label: "Coaching app" },
  { key: "bridge_app", label: "Bridge app" },
  { key: "mixed_app", label: "Mixed app" },
];
const IDENTIFIERS: { key: AllowedIdentifiers; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "both", label: "Email + Phone" },
];
const APP_STATUSES: AppStatus[] = ["active", "paused", "revoked"];
const MODULES: PlatformModule[] = ["nexus_only", "learning", "coaching", "bridge", "mixed"];

function readShell(app: RegisteredApp): AppShellConfig {
  const raw = (app.launch_context as Record<string, unknown>)?.shell;
  return (raw && typeof raw === "object" ? raw : {}) as AppShellConfig;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium" style={{ color: MUTED, fontFamily: FONT_BODY }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25";
const inputStyle = { background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY } as const;

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>{title}</p>
      {children}
    </div>
  );
}

export function AppShellEditor({
  programId, offering, accent, onOfferingUpdated,
}: {
  programId: string;
  offering: Offering;
  accent: string;
  onOfferingUpdated: (o: Offering) => void;
}) {
  const [app, setApp] = useState<RegisteredApp | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Register form
  const [newName, setNewName] = useState(offering.name);
  const [newType, setNewType] = useState<AppType>("course_app");

  // App-side editable state
  const [appName, setAppName] = useState("");
  const [appType, setAppType] = useState<AppType>("course_app");
  const [status, setStatus] = useState<AppStatus>("active");
  const [identifiers, setIdentifiers] = useState<AllowedIdentifiers>("email");
  const [launchUrl, setLaunchUrl] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [navSections, setNavSections] = useState("");
  const [flags, setFlags] = useState("");

  // Offering-side editable state
  const [approval, setApproval] = useState<ApprovalMode>(offering.approval_mode);
  const [module, setModule] = useState<PlatformModule>(offering.platform_module);
  const [singular, setSingular] = useState(offering.participant_label_singular || "");
  const [plural, setPlural] = useState(offering.participant_label_plural || "");
  const [fields, setFields] = useState<SignupField[]>(offering.signup_fields?.length ? offering.signup_fields : DEFAULT_SIGNUP_FIELDS);

  useEffect(() => {
    listApps(programId)
      .then((apps) => {
        const found = apps.find((a) => a.offering_id === offering.id) || null;
        setApp(found);
        if (found) hydrate(found);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load app shell"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, offering.id]);

  function hydrate(a: RegisteredApp) {
    const shell = readShell(a);
    setAppName(a.app_name);
    setAppType(shell.appType || "course_app");
    setStatus(a.status);
    setIdentifiers(a.allowed_identifiers);
    setLaunchUrl(a.launch_url || "");
    setPrimary(shell.theme?.primaryColor || accent);
    setSecondary(shell.theme?.secondaryColor || "");
    setLogoUrl(shell.theme?.logoUrl || "");
    setNavSections((shell.navSections || []).join(", "));
    setFlags((shell.featureFlags || []).join(", "));
  }

  async function register() {
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createApp(programId, {
        app_name: newName.trim(),
        offering_id: offering.id,
        allowed_identifiers: "email",
        launch_context: { shell: { appType: newType, theme: { primaryColor: accent } } },
      });
      setApp(created);
      hydrate(created);
      setRevealKey(created.api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register app shell");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!app) return;
    if (!window.confirm("Rotate this app's API key? The old key stops working immediately.")) return;
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
      if (!base) { setError("Set a launch URL first"); return; }
      window.open(`${base}/?lt=${encodeURIComponent(ctx.launch_token)}`, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open app");
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    if (!app) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const shell: AppShellConfig = {
        appType,
        theme: { primaryColor: primary || undefined, secondaryColor: secondary || undefined, logoUrl: logoUrl || undefined },
        navSections: navSections.split(",").map((s) => s.trim()).filter(Boolean),
        featureFlags: flags.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const updatedApp = await updateApp(app.id, {
        app_name: appName.trim() || app.app_name,
        allowed_identifiers: identifiers,
        status,
        launch_url: launchUrl.trim() || undefined,
        launch_context: { ...(app.launch_context || {}), shell },
      });
      setApp(updatedApp);

      const updatedOffering = await updateOffering(offering.id, {
        approval_mode: approval,
        platform_module: module,
        participant_label_singular: singular.trim() || undefined,
        participant_label_plural: plural.trim() || undefined,
        signup_fields: fields,
      });
      onOfferingUpdated(updatedOffering);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save app shell");
    } finally {
      setBusy(false);
    }
  }

  if (app === undefined) return <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Loading app shell…</p>;

  // No app shell yet → register form.
  if (app === null) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
        <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>Create the app shell</p>
        <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          The App Shell is this offering's configurable container — branding, onboarding, role labels, auth, and the signup-hook credential. One runtime renders many shells.
        </p>
        {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="App name" className={inputCls} style={inputStyle} />
        <div className="flex items-center gap-2 flex-wrap">
          <select value={newType} onChange={(e) => setNewType(e.target.value as AppType)} className="h-9 rounded-lg px-2 text-xs text-white outline-none" style={inputStyle}>
            {APP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button type="button" onClick={register} disabled={busy} className="px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
            {busy ? "Creating…" : "Create app shell & issue key"}
          </button>
        </div>
        <ApiKeyRevealDialog open={!!revealKey} onOpenChange={(o) => !o && setRevealKey(null)} apiKey={revealKey} accent={accent} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {/* Identity + status */}
      <SectionCard title="Identity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="App name"><input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <Field label="App type">
            <select value={appType} onChange={(e) => setAppType(e.target.value as AppType)} className={inputCls} style={inputStyle}>
              {APP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Slug"><input type="text" value={app.app_slug} readOnly className={inputCls} style={{ ...inputStyle, opacity: 0.6 }} /></Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as AppStatus)} className={inputCls} style={inputStyle}>
              {APP_STATUSES.map((s) => <option key={s} value={s}>{String(s).replace("_", " ")}</option>)}
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* Branding / theme */}
      <SectionCard title="Branding & theme">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Primary color">
            <div className="flex items-center gap-2">
              <input type="color" value={primary || "#ffffff"} onChange={(e) => setPrimary(e.target.value)} className="w-9 h-9 rounded-lg bg-transparent cursor-pointer" />
              <input type="text" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#7C3AED" className={inputCls} style={inputStyle} />
            </div>
          </Field>
          <Field label="Secondary color">
            <div className="flex items-center gap-2">
              <input type="color" value={secondary || "#ffffff"} onChange={(e) => setSecondary(e.target.value)} className="w-9 h-9 rounded-lg bg-transparent cursor-pointer" />
              <input type="text" value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="optional" className={inputCls} style={inputStyle} />
            </div>
          </Field>
          <Field label="Logo URL"><input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className={inputCls} style={inputStyle} /></Field>
        </div>
        <Field label="Navigation sections (comma-separated)">
          <input type="text" value={navSections} onChange={(e) => setNavSections(e.target.value)} placeholder="Home, Lessons, Practice, Progress" className={inputCls} style={inputStyle} />
        </Field>
      </SectionCard>

      {/* Role labels */}
      <SectionCard title="Role labels">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Learner — singular"><input type="text" value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="student / player" className={inputCls} style={inputStyle} /></Field>
          <Field label="Learner — plural"><input type="text" value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="students / players" className={inputCls} style={inputStyle} /></Field>
        </div>
      </SectionCard>

      {/* Auth & registration */}
      <SectionCard title="Auth & registration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Allowed identifiers">
            <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: `1px solid ${BORDER}` }}>
              {IDENTIFIERS.map((o) => {
                const on = identifiers === o.key;
                return <button key={o.key} type="button" onClick={() => setIdentifiers(o.key)} className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase focus:outline-none" style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{o.label}</button>;
              })}
            </div>
          </Field>
          <Field label="Approval mode">
            <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: `1px solid ${BORDER}` }}>
              {([{ key: "manual_approve", label: "Manual" }, { key: "auto_approve", label: "Auto" }] as { key: ApprovalMode; label: string }[]).map((o) => {
                const on = approval === o.key;
                return <button key={o.key} type="button" onClick={() => setApproval(o.key)} className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase focus:outline-none" style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{o.label}</button>;
              })}
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* Onboarding / signup fields */}
      <SectionCard title="Onboarding — signup fields">
        <p className="text-[11px] -mt-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Nexus-defined fields the app collects on signup and pushes through the hook.
        </p>
        <SignupFieldsEditor fields={fields} onChange={setFields} accent={accent} />
      </SectionCard>

      {/* Launch */}
      <SectionCard title="Launch context">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Downstream module">
            <select value={module} onChange={(e) => setModule(e.target.value as PlatformModule)} className={inputCls} style={inputStyle}>
              {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Launch URL"><input type="text" value={launchUrl} onChange={(e) => setLaunchUrl(e.target.value)} placeholder="https://app.example.com" className={inputCls} style={inputStyle} /></Field>
        </div>
        <Field label="Feature flags (comma-separated)">
          <input type="text" value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="beta_ui, offline_mode" className={inputCls} style={inputStyle} />
        </Field>
      </SectionCard>

      {/* Credential + actions */}
      <SectionCard title="Signup-hook credential">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Key: <span className="text-white/80" style={{ fontFamily: "monospace" }}>{app.key_prefix || "hidden"}…</span>
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={rotate} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] focus:outline-none disabled:opacity-50" style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}>
              <RefreshCw size={13} /> Rotate key
            </button>
            {status === "active" && (
              <button type="button" onClick={openApp} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold focus:outline-none disabled:opacity-50" style={{ background: "rgba(255,255,255,0.08)", color: "white", fontFamily: FONT_BODY }}>
                <ExternalLink size={13} /> Open app
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-[11px]" style={{ color: "#4ade80", fontFamily: FONT_BODY }}>Saved</span>}
        <button type="button" onClick={saveAll} disabled={busy} className="flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
          <Save size={15} /> {busy ? "Saving…" : "Save app shell"}
        </button>
      </div>

      <ApiKeyRevealDialog open={!!revealKey} onOpenChange={(o) => !o && setRevealKey(null)} apiKey={revealKey} accent={accent} />
    </div>
  );
}
