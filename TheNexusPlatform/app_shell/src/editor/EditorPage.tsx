/**
 * Admin app-shell config editor — the Nexus Admin surface from the mockup
 * (spec §6), prototyped here against the same AppShellConfig contract.
 *
 * Left: tab rail (setup / branding / start / login / onboarding / navigation).
 * Middle: form panel editing the real config record.
 * Right: LIVE phone preview — not a drawing: it renders the actual
 * WelcomeScreen from @laic/app-shell, themed via brandingToCssVars on a
 * wrapper (so the editor chrome itself stays neutral).
 *
 * Save draft / Publish version persist locally; the running apps boot from
 * the saved version (configRegistry override) — edit here, relaunch, see it.
 */
import { useMemo, useState } from "react";
import { WelcomeScreen, brandingToCssVars, validateAppShellConfig } from "@laic/app-shell";
import type { AppShellConfig, AppNavItem, OnboardingQuestion, RoleButton } from "@laic/app-shell";
import { KNOWN_SLUGS, discardLocalEdits, hasLocalEdits, loadEditableConfig, saveConfig } from "../configRegistry";
import "./editor.css";

type TabId = "setup" | "brand" | "start" | "login" | "onboard" | "nav";

const TABS: Array<{ id: TabId; glyph: string; label: string }> = [
  { id: "setup", glyph: "⚙", label: "App setup" },
  { id: "brand", glyph: "◐", label: "Branding" },
  { id: "start", glyph: "▤", label: "Start screen" },
  { id: "login", glyph: "⚿", label: "Login / signup" },
  { id: "onboard", glyph: "☰", label: "Onboarding" },
  { id: "nav", glyph: "▦", label: "Navigation" },
];

const PALETTES: Array<{ name: string; b: Partial<AppShellConfig["branding"]> }> = [
  { name: "Paper & violet", b: { primaryColor: "#44318d", secondaryColor: "#2b2452", accentColor: "#e8a33d", backgroundColor: "#f6f1e7", surfaceColor: "#fffdf7", textColor: "#241f33", mutedColor: "#7a7263", scheme: "light" } },
  { name: "Honeycomb", b: { primaryColor: "#d97d06", secondaryColor: "#26221c", accentColor: "#3aa6a0", backgroundColor: "#fdf8ec", surfaceColor: "#ffffff", textColor: "#262019", mutedColor: "#8a8071", scheme: "light" } },
  { name: "Club felt", b: { primaryColor: "#cfa75f", secondaryColor: "#1f4234", accentColor: "#d94f4f", backgroundColor: "#0c1f17", surfaceColor: "#142a1f", textColor: "#f2ead8", mutedColor: "#8fa295", scheme: "dark" } },
  { name: "Harbor", b: { primaryColor: "#2563a8", secondaryColor: "#123a66", accentColor: "#e2725b", backgroundColor: "#eef3f6", surfaceColor: "#ffffff", textColor: "#16222e", mutedColor: "#64748b", scheme: "light" } },
  { name: "Plum dusk", b: { primaryColor: "#c084fc", secondaryColor: "#3b2b52", accentColor: "#f0b429", backgroundColor: "#171221", surfaceColor: "#211a30", textColor: "#efe9f7", mutedColor: "#9d93b0", scheme: "dark" } },
];

const DISPLAY_FONTS = ["'Fraunces', serif", "'Sora', sans-serif", "'Playfair Display', serif", "'Public Sans', sans-serif"];
const BODY_FONTS = ["'Lora', serif", "'Sora', sans-serif", "'Public Sans', sans-serif"];
const ICON_KEYS = ["book", "chart", "bolt", "cards", "target", "whistle"];
const AUTH_METHODS = ["email", "phone", "otp", "google", "apple"] as const;

const bumpPatch = (v: string) => {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : v;
};
const csv = (a?: string[]) => (a || []).join(", ");
const uncsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`ed-switch${on ? " on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on}>
      <i />
    </button>
  );
}

export function EditorPage() {
  const initialSlug = new URLSearchParams(window.location.search).get("app") || KNOWN_SLUGS[0];
  const [slug, setSlug] = useState(KNOWN_SLUGS.includes(initialSlug) ? initialSlug : KNOWN_SLUGS[0]);
  const [cfg, setCfg] = useState<AppShellConfig>(() => loadEditableConfig(slug));
  const [tab, setTab] = useState<TabId>("setup");
  const [dirty, setDirty] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const cssVars = useMemo(() => brandingToCssVars(cfg) as React.CSSProperties, [cfg]);

  function switchApp(next: string) {
    setSlug(next);
    setCfg(loadEditableConfig(next));
    setDirty(false);
    setSavedMsg("");
    setErrors([]);
    const url = new URL(window.location.href);
    url.searchParams.set("app", next);
    window.history.replaceState({}, "", url);
  }

  /** All edits funnel through here: patch → mark dirty → live preview updates. */
  function patch(fn: (c: AppShellConfig) => AppShellConfig) {
    setCfg((prev) => fn(structuredClone(prev)));
    setDirty(true);
    setSavedMsg("");
  }
  const set = (fn: (c: AppShellConfig) => void) => patch((c) => { fn(c); return c; });

  function persist(status: AppShellConfig["status"], bump: boolean) {
    const next = structuredClone(cfg);
    next.status = status;
    if (bump) next.version = bumpPatch(next.version);
    const errs = saveConfig(next);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setCfg(next);
    setErrors([]);
    setDirty(false);
    setSavedMsg(status === "published" ? `Published v${next.version}` : "Draft saved");
  }

  function discard() {
    if (!window.confirm("Discard local edits and reload the seed config?")) return;
    discardLocalEdits(slug);
    setCfg(loadEditableConfig(slug));
    setDirty(false);
    setErrors([]);
    setSavedMsg("Local edits discarded");
  }

  // ── Panels ──────────────────────────────────────────────────────────────
  const panels: Record<TabId, React.ReactNode> = {
    setup: (
      <>
        <p className="ed-h">App setup</p>
        <p className="ed-sub">Identity and program binding. The slug is the app's permanent key; Nexus resolves it to the program context at launch.</p>
        <label className="ed-label">App name</label>
        <input className="ed-input narrow" value={cfg.identity.displayName} onChange={(e) => set((c) => { c.identity.displayName = e.target.value; })} />
        <label className="ed-label">Short name</label>
        <input className="ed-input narrow" value={cfg.identity.shortName} onChange={(e) => set((c) => { c.identity.shortName = e.target.value; })} />
        <label className="ed-label">Slug</label>
        <input className="ed-input narrow" value={cfg.slug} disabled />
        <label className="ed-label">Program</label>
        <input className="ed-input narrow" value={cfg.programContext.programId} onChange={(e) => set((c) => { c.programContext.programId = e.target.value; })} />
        <div className="ed-grid2" style={{ width: "62%" }}>
          <div>
            <label className="ed-label">Runtime template</label>
            <select className="ed-select" value={cfg.build.runtimeTemplate} onChange={(e) => set((c) => { c.build.runtimeTemplate = e.target.value as AppShellConfig["build"]["runtimeTemplate"]; })}>
              {["learning-app", "bridge-app", "general-app"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="ed-label">Environment</label>
            <select className="ed-select" value={cfg.build.environment} onChange={(e) => set((c) => { c.build.environment = e.target.value as AppShellConfig["build"]["environment"]; })}>
              {["dev", "staging", "production"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </>
    ),

    brand: (
      <>
        <p className="ed-h">Branding</p>
        <p className="ed-sub">Palette, type, and the app mark. Everything here maps to the shell's CSS tokens — watch the preview take it live.</p>
        <label className="ed-label">Palette presets</label>
        <div className="ed-swatches">
          {PALETTES.map((p) => {
            const on = cfg.branding.primaryColor === p.b.primaryColor && cfg.branding.backgroundColor === p.b.backgroundColor;
            return (
              <button key={p.name} type="button" title={p.name} className={`ed-swatch${on ? " on" : ""}`} style={{ background: p.b.backgroundColor }} onClick={() => set((c) => { Object.assign(c.branding, p.b); })}>
                <i style={{ background: p.b.primaryColor }} />
              </button>
            );
          })}
        </div>
        <div className="ed-colorrow">
          {([
            ["Primary", "primaryColor"], ["Accent", "accentColor"], ["Background", "backgroundColor"],
            ["Surface", "surfaceColor"], ["Text", "textColor"], ["Muted", "mutedColor"],
          ] as Array<[string, keyof AppShellConfig["branding"]]>).map(([label, key]) => (
            <div key={key} className="ed-colorcell">
              <input type="color" value={(cfg.branding[key] as string) || "#888888"} onChange={(e) => set((c) => { (c.branding as Record<string, unknown>)[key] = e.target.value; })} />
              {label}
            </div>
          ))}
        </div>
        <div className="ed-grid2">
          <div>
            <label className="ed-label">Display font</label>
            <select className="ed-select" value={cfg.branding.displayFontFamily || ""} onChange={(e) => set((c) => { c.branding.displayFontFamily = e.target.value; })}>
              {DISPLAY_FONTS.map((f) => <option key={f} value={f}>{f.split(",")[0].replace(/'/g, "")}</option>)}
            </select>
          </div>
          <div>
            <label className="ed-label">Body font</label>
            <select className="ed-select" value={cfg.branding.fontFamily || ""} onChange={(e) => set((c) => { c.branding.fontFamily = e.target.value; })}>
              {BODY_FONTS.map((f) => <option key={f} value={f}>{f.split(",")[0].replace(/'/g, "")}</option>)}
            </select>
          </div>
          <div>
            <label className="ed-label">Scheme</label>
            <select className="ed-select" value={cfg.branding.scheme || "light"} onChange={(e) => set((c) => { c.branding.scheme = e.target.value as "light" | "dark"; })}>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </div>
          <div>
            <label className="ed-label">Mark glyph <span className="ed-mini">(stand-in for the logo asset)</span></label>
            <input className="ed-input" value={cfg.branding.markGlyph || ""} maxLength={2} onChange={(e) => set((c) => { c.branding.markGlyph = e.target.value; })} />
          </div>
        </div>
      </>
    ),

    start: (
      <>
        <p className="ed-h">Start screen</p>
        <p className="ed-sub">The welcome copy and the role buttons — each button carries the requested role, its entry flow, and where that role lands after login.</p>
        <label className="ed-label">Welcome title</label>
        <input className="ed-input" value={cfg.copy.welcomeTitle} onChange={(e) => set((c) => { c.copy.welcomeTitle = e.target.value; })} />
        <label className="ed-label">Welcome subtitle</label>
        <textarea className="ed-textarea" value={cfg.copy.welcomeSubtitle || ""} onChange={(e) => set((c) => { c.copy.welcomeSubtitle = e.target.value; })} />
        <label className="ed-label">Role buttons</label>
        {cfg.roleButtons.map((r, i) => (
          <div key={i} className="ed-row">
            <div className="ed-row-line">
              <input className="ed-input" value={r.label} placeholder="Label" onChange={(e) => set((c) => { c.roleButtons[i].label = e.target.value; })} />
              <input className="ed-input" value={r.roleRequested} placeholder="role_requested" onChange={(e) => set((c) => { c.roleButtons[i].roleRequested = e.target.value; })} />
              <select className="ed-select fix" value={r.entryFlow} onChange={(e) => set((c) => { c.roleButtons[i].entryFlow = e.target.value as RoleButton["entryFlow"]; })}>
                {["signup", "signin", "apply", "invite_only"].map((f) => <option key={f}>{f}</option>)}
              </select>
              <button className="ed-remove" title="Remove" onClick={() => set((c) => { c.roleButtons.splice(i, 1); })}>✕</button>
            </div>
            <div className="ed-row-line">
              <input className="ed-input" value={r.description || ""} placeholder="Description" onChange={(e) => set((c) => { c.roleButtons[i].description = e.target.value; })} />
              <input className="ed-input fix" style={{ width: 150 }} value={r.defaultRouteAfterLogin} placeholder="/route/after/login" onChange={(e) => set((c) => { c.roleButtons[i].defaultRouteAfterLogin = e.target.value; })} />
              <span className="ed-mini">visible</span>
              <Toggle on={r.visible} onChange={(v) => set((c) => { c.roleButtons[i].visible = v; })} />
            </div>
          </div>
        ))}
        <button className="ed-add" onClick={() => set((c) => { c.roleButtons.push({ key: `role_${c.roleButtons.length + 1}`, label: "New role", roleRequested: "learner", entryFlow: "signup", defaultRouteAfterLogin: c.navigation.homeRoute, visible: true, sortOrder: c.roleButtons.length + 1 }); })}>
        + Add role button
        </button>
      </>
    ),

    login: (
      <>
        <p className="ed-h">Login / signup</p>
        <p className="ed-sub">Which auth methods the shell offers. Toggling here adds or removes the buttons on the login screen — no code.</p>
        {AUTH_METHODS.map((m) => (
          <div key={m} className="ed-togglerow">
            <span style={{ textTransform: "capitalize" }}>{m === "otp" ? "OTP code" : m}</span>
            <Toggle
              on={cfg.auth.allowedMethods.includes(m)}
              onChange={(v) => set((c) => {
                c.auth.allowedMethods = v ? [...c.auth.allowedMethods, m] : c.auth.allowedMethods.filter((x) => x !== m);
              })}
            />
          </div>
        ))}
        <div className="ed-togglerow">
          <span>Allow self-signup</span>
          <Toggle on={cfg.auth.allowSelfSignup} onChange={(v) => set((c) => { c.auth.allowSelfSignup = v; })} />
        </div>
        <div className="ed-togglerow">
          <span>Require invite code</span>
          <Toggle on={!!cfg.auth.requireInviteCode} onChange={(v) => set((c) => { c.auth.requireInviteCode = v; })} />
        </div>
      </>
    ),

    onboard: (
      <>
        <p className="ed-h">Onboarding questions</p>
        <p className="ed-sub">Asked after signup, filtered by role. Leave "roles" empty to ask everyone; options apply to select types (comma-separated).</p>
        {cfg.onboarding.questions.map((q, i) => (
          <div key={i} className="ed-row">
            <div className="ed-row-line">
              <input className="ed-input" value={q.label} placeholder="Question" onChange={(e) => set((c) => { c.onboarding.questions[i].label = e.target.value; })} />
              <select className="ed-select fix" value={q.type} onChange={(e) => set((c) => { c.onboarding.questions[i].type = e.target.value as OnboardingQuestion["type"]; })}>
                {["text", "single_select", "multi_select", "boolean", "date", "phone", "email"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="ed-mini">required</span>
              <Toggle on={q.required} onChange={(v) => set((c) => { c.onboarding.questions[i].required = v; })} />
              <button className="ed-remove" title="Remove" onClick={() => set((c) => { c.onboarding.questions.splice(i, 1); })}>✕</button>
            </div>
            <div className="ed-row-line">
              <input className="ed-input" value={csv(q.visibleForRoles)} placeholder="roles (empty = everyone)" onChange={(e) => set((c) => { c.onboarding.questions[i].visibleForRoles = uncsv(e.target.value).length ? uncsv(e.target.value) : undefined; })} />
              {(q.type === "single_select" || q.type === "multi_select") && (
                <input className="ed-input" value={(q.options || []).map((o) => o.label).join(", ")} placeholder="options, comma, separated" onChange={(e) => set((c) => { c.onboarding.questions[i].options = uncsv(e.target.value).map((label) => ({ label, value: label.toLowerCase().replace(/\s+/g, "_") })); })} />
              )}
            </div>
          </div>
        ))}
        <button className="ed-add" onClick={() => set((c) => { c.onboarding.questions.push({ key: `q_${Date.now()}`, label: "New question", type: "text", required: false }); })}>
        + Add question
        </button>
      </>
    ),

    nav: (
      <>
        <p className="ed-h">Navigation &amp; modules</p>
        <p className="ed-sub">Bottom tabs, the home route, and which content modules the app mounts. A tab whose module is disabled fails validation.</p>
        <label className="ed-label">Home route</label>
        <input className="ed-input narrow" value={cfg.navigation.homeRoute} onChange={(e) => set((c) => { c.navigation.homeRoute = e.target.value; })} />
        <label className="ed-label">Bottom tabs</label>
        {cfg.navigation.tabs.map((t, i) => (
          <div key={i} className="ed-row">
            <div className="ed-row-line">
              <input className="ed-input" value={t.label} placeholder="Label" onChange={(e) => set((c) => { c.navigation.tabs[i].label = e.target.value; })} />
              <input className="ed-input" value={t.route} placeholder="/route" onChange={(e) => set((c) => { c.navigation.tabs[i].route = e.target.value; })} />
              <select className="ed-select fix" value={t.icon || ""} onChange={(e) => set((c) => { c.navigation.tabs[i].icon = e.target.value || undefined; })}>
                <option value="">icon…</option>
                {ICON_KEYS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <button className="ed-remove" title="Remove" onClick={() => set((c) => { c.navigation.tabs.splice(i, 1); })}>✕</button>
            </div>
            <div className="ed-row-line">
              <select className="ed-select fix" value={t.requiredModule || ""} onChange={(e) => set((c) => { c.navigation.tabs[i].requiredModule = e.target.value || undefined; })}>
                <option value="">no module gate</option>
                {Object.keys(cfg.enabledModules).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="ed-input" value={t.requiredEntitlement || ""} placeholder="required entitlement (optional)" onChange={(e) => set((c) => { c.navigation.tabs[i].requiredEntitlement = e.target.value || undefined; })} />
              <input className="ed-input" value={csv(t.visibleForRoles)} placeholder="roles (empty = everyone)" onChange={(e) => set((c) => { c.navigation.tabs[i].visibleForRoles = uncsv(e.target.value).length ? uncsv(e.target.value) : undefined; })} />
            </div>
          </div>
        ))}
        <button className="ed-add" onClick={() => set((c) => { c.navigation.tabs.push({ key: `tab_${Date.now()}`, label: "New tab", route: c.navigation.homeRoute } as AppNavItem); })}>
        + Add tab
        </button>
        <p className="ed-label" style={{ marginTop: 18 }}>Enabled modules</p>
        {Object.keys(cfg.enabledModules).map((m) => (
          <div key={m} className="ed-togglerow">
            <span style={{ textTransform: "capitalize" }}>{m}</span>
            <Toggle on={!!cfg.enabledModules[m]} onChange={(v) => set((c) => { c.enabledModules[m] = v; })} />
          </div>
        ))}
      </>
    ),
  };

  const liveErrors = errors.length ? errors : dirty ? (() => { const v = validateAppShellConfig(cfg); return v.ok ? [] : v.errors; })() : [];

  return (
    <div className="ed-page">
      <div className="ed-shell">
        <div className="ed-headline">
          <h1>App shell config</h1>
          <span>internal · platform admins only</span>
          <a href={`/?app=${slug}`}>Open this app →</a>
        </div>

        <div className="ed-frame">
          <div className="ed-crumbbar">
            <span>Nexus Admin</span>
            <span className="sep">›</span>
            <span>Program offerings</span>
            <span className="sep">›</span>
            <span className="current">App shell config</span>
            <select value={slug} onChange={(e) => switchApp(e.target.value)} style={{ marginLeft: 10 }}>
              {KNOWN_SLUGS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasLocalEdits(slug) && <span className="ed-mini" style={{ marginLeft: 8 }} title="This app has locally saved edits overriding the seed file">local override</span>}
            <span className={`ed-chip ${cfg.status}`}>{cfg.status === "published" ? `Published` : cfg.status.charAt(0).toUpperCase() + cfg.status.slice(1)}</span>
            <span className="ed-version">v{cfg.version}</span>
            {dirty && <span className="ed-dirty">● unsaved</span>}
          </div>

          <div className="ed-body">
            <div className="ed-tabs">
              {TABS.map((t) => (
                <button key={t.id} className={`ed-tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
                  <span className="glyph">{t.glyph}</span>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ed-panel">
              {panels[tab]}
              {liveErrors.length > 0 && (
                <ul className="ed-errors">
                  {liveErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              <div className="ed-actions">
                <button className="ed-btn primary" onClick={() => persist("published", true)}>⭱ Publish version</button>
                <button className="ed-btn" onClick={() => persist("draft", false)}>Save draft</button>
                {hasLocalEdits(slug) && <button className="ed-btn quiet" onClick={discard}>Discard local edits</button>}
                {savedMsg && <span className="ed-saved">✓ {savedMsg}</span>}
              </div>
            </div>

            <div className="ed-preview">
              <span className="pv-label">👁 Live preview</span>
              <div className="phone">
                <div className="phone-inner" style={cssVars} data-scheme={cfg.branding.scheme || "light"}>
                  <WelcomeScreen config={cfg} onPickRole={() => {}} />
                </div>
              </div>
              <span className="pv-caption">Start screen · rendered by the real shell</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
