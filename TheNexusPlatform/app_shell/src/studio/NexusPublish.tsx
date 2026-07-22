/**
 * Publish to Nexus — the real publish path inside the Publish modal.
 *
 * Sign in as an org admin, pick (or create) the registered app this config
 * belongs to, and publish: the config is saved as the app's working draft and
 * snapshotted as an immutable version in the org's space. The public
 * boot-config URL it prints is what the Player runtime boots from.
 */
import { useEffect, useState } from "react";
import type { AppShellConfig } from "../types";
import {
  DEFAULT_BASE_URL,
  bootConfigUrl,
  clearSession,
  createApp,
  devLoginAs,
  getAppConfig,
  listApps,
  listMyOrgs,
  listPrograms,
  loadLinks,
  loadSession,
  login,
  publishVersion,
  saveAppConfig,
  saveLink,
  saveSession,
  slugify,
  type NexusApp,
  type NexusOrg,
  type NexusProgram,
  type NexusSession,
} from "../nexus/client";
import { toServerRecord } from "../nexus/dialect";
import type { HandoffScope } from "../nexus/handoff";
import { copyToClipboard } from "../share";

const CREATE = "__create__";

const inputCls = "w-full rounded-lg px-2.5 py-2 text-xs outline-none";
const inputStyle = {
  backgroundColor: "#0f0f16",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(224,224,240,0.85)",
} as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>
      {children}
    </p>
  );
}

export function NexusPublish({
  config,
  bound,
}: {
  config: AppShellConfig;
  /** Scoped Studio: publish goes to THIS app — no org/program/app picking. */
  bound?: HandoffScope;
}) {
  const [session, setSession] = useState<NexusSession | null>(() => loadSession());
  const [baseUrl, setBaseUrl] = useState(() => loadSession()?.baseUrl ?? DEFAULT_BASE_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<NexusOrg[]>([]);
  const [orgId, setOrgId] = useState("");
  const [programs, setPrograms] = useState<NexusProgram[]>([]);
  const [programId, setProgramId] = useState("");
  const [apps, setApps] = useState<NexusApp[]>([]);
  const [appId, setAppId] = useState("");
  const [newSlug, setNewSlug] = useState(() => slugify(config.name));

  const [published, setPublished] = useState<{ version: number; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function connect(kind: "password" | "dev") {
    setBusy(true);
    setError(null);
    try {
      const s = kind === "password" ? await login(baseUrl, email, password) : await devLoginAs(baseUrl, email);
      saveSession(s);
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearSession();
    setSession(null);
    setOrgs([]);
    setPrograms([]);
    setApps([]);
    setPublished(null);
  }

  // Connected → load the org space, remembering where this config last published.
  // Bound mode skips all of it: the target app is fixed by the Studio's scope.
  useEffect(() => {
    if (!session || bound) return;
    let stale = false;
    (async () => {
      setError(null);
      try {
        const link = loadLinks()[config.id];
        const os = await listMyOrgs(session);
        if (stale) return;
        setOrgs(os);
        const oid = link?.orgId && os.some((o) => o.id === link.orgId) ? link.orgId : (os[0]?.id ?? "");
        setOrgId(oid);
        if (!oid) return;
        const ps = await listPrograms(session, oid);
        if (stale) return;
        setPrograms(ps);
        const pid = link?.programId && ps.some((p) => p.id === link.programId) ? link.programId : (ps[0]?.id ?? "");
        setProgramId(pid);
        if (!pid) return;
        const as = await listApps(session, pid);
        if (stale) return;
        setApps(as);
        setAppId(link?.appId && as.some((a) => a.id === link.appId) ? link.appId : as[0]?.id ?? CREATE);
      } catch (e) {
        if (!stale) {
          setError(e instanceof Error ? e.message : String(e));
          // A dead token should not wedge the panel in a broken connected state.
          if (String(e).includes("401")) signOut();
        }
      }
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, config.id]);

  async function pickProgram(pid: string) {
    if (!session) return;
    setProgramId(pid);
    setApps([]);
    setAppId(CREATE);
    try {
      const as = await listApps(session, pid);
      setApps(as);
      setAppId(as[0]?.id ?? CREATE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function publish() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setPublished(null);
    try {
      if (bound) {
        // Scoped Studio: the target is fixed — save + publish, nothing to pick.
        const existing = (await getAppConfig(session, bound.appId)).config ?? {};
        await saveAppConfig(session, bound.appId, toServerRecord(config, existing));
        const v = await publishVersion(session, bound.appId);
        setPublished({ version: v.version, url: bootConfigUrl(session.baseUrl, bound.appSlug) });
        return;
      }
      if (!programId) return;
      let app = apps.find((a) => a.id === appId) ?? null;
      if (!app || appId === CREATE) {
        app = await createApp(session, programId, config.name || "Untitled app", newSlug || slugify(config.name));
        setApps((as) => [...as, app!]);
        setAppId(app.id);
      }
      const existing = (await getAppConfig(session, app.id)).config ?? {};
      await saveAppConfig(session, app.id, toServerRecord(config, existing));
      const v = await publishVersion(session, app.id);
      saveLink(config.id, { appId: app.id, appSlug: app.app_slug, programId, orgId });
      setPublished({ version: v.version, url: bootConfigUrl(session.baseUrl, app.app_slug) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const select = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} appearance-none`}
      style={{ ...inputStyle, color: "rgba(224,224,240,0.7)" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ backgroundColor: "#0f0f16" }}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rounded-xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${config.accentColor}30` }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: config.accentColor }}>
          Publish to Nexus — the org's space
        </p>
        {session && (
          <button onClick={signOut} className="text-[9px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
            {session.email} · sign out
          </button>
        )}
      </div>

      {!session ? (
        <div className="space-y-2">
          <div>
            <Label>Nexus backend</Label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={`${inputCls} font-mono`} style={inputStyle} placeholder={DEFAULT_BASE_URL} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Org admin email</Label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={inputStyle} placeholder="admin@your-org.org" />
            </div>
            <div className="flex-1">
              <Label>Password</Label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} style={inputStyle} placeholder="••••••••" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => connect("password")}
              disabled={busy || !email || !password}
              className="flex-1 rounded-lg py-2 text-[11px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: `${config.accentColor}22`, color: config.accentColor }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              onClick={() => connect("dev")}
              disabled={busy || !email}
              title="Local development only — signs in without a password when the backend runs in demo-auth mode"
              className="flex-1 rounded-lg py-2 text-[11px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
            >
              Dev sign-in
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {bound ? (
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: "#0f0f16", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>
                Publishing to
              </span>
              <span className="truncate font-mono text-[11px]" style={{ color: "rgba(224,224,240,0.75)" }}>
                {bound.appName} · {bound.appSlug || bound.appId}
              </span>
            </div>
          ) : (
            <>
              {orgs.length > 1 && (
                <div>
                  <Label>Organization</Label>
                  {select(orgId, setOrgId, orgs.map((o) => ({ value: o.id, label: o.name ?? o.slug ?? o.id })))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Program</Label>
                  {select(programId, pickProgram, programs.map((p) => ({ value: p.id, label: p.name })))}
                </div>
                <div className="flex-1">
                  <Label>Registered app</Label>
                  {select(appId, setAppId, [
                    ...apps.map((a) => ({ value: a.id, label: `${a.app_name} (${a.app_slug})` })),
                    { value: CREATE, label: "+ Create new app…" },
                  ])}
                </div>
              </div>
              {appId === CREATE && (
                <div>
                  <Label>New app slug</Label>
                  <input value={newSlug} onChange={(e) => setNewSlug(slugify(e.target.value))} className={`${inputCls} font-mono`} style={inputStyle} />
                </div>
              )}
            </>
          )}
          <button
            onClick={publish}
            disabled={busy || (!bound && !programId)}
            className="w-full rounded-lg py-2 text-[11px] font-semibold disabled:opacity-40"
            style={{ backgroundColor: config.accentColor, color: config.accentForeground }}
          >
            {busy ? "Publishing…" : "Save & publish version"}
          </button>
          {published && (
            <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: "#0f0f16", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="mb-1 text-[10px] font-semibold" style={{ color: config.accentColor }}>
                Published v{published.version} ✓ — boot config:
              </p>
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }} title={published.url}>
                  {published.url}
                </span>
                <button
                  onClick={async () => {
                    if (await copyToClipboard(published.url)) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }
                  }}
                  className="flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: `${config.accentColor}22`, color: config.accentColor }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[10px] leading-snug" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <p className="mt-2 text-[9px] leading-snug" style={{ color: "rgba(255,255,255,0.22)" }}>
        Saves this design as the app's working config and publishes an immutable version in the organization's
        space. The Player runtime boots from the URL above; the links section below stays available for
        offline design sharing.
      </p>
    </div>
  );
}
