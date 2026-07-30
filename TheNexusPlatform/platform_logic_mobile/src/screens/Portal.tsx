import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import {
  devLoginAs, getDevPersonas, getOrgBySlug,
  type DevPersonaEntry, type OrgBranding,
} from "../api";
import { resolveAssetUrl } from "../apiBase";
import { useSession } from "../session";

const DEV_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_LOGINS === "1";

export function PortalScreen() {
  const { slug = "life-in-ai-center" } = useParams();
  const { login, refresh, setActiveOrg, user, loading } = useSession();
  const navigate = useNavigate();

  const [org, setOrg] = useState<OrgBranding | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [personas, setPersonas] = useState<DevPersonaEntry[]>([]);

  useEffect(() => {
    getOrgBySlug(slug)
      .then(setOrg)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!DEV_ENABLED) return;
    getDevPersonas(slug)
      .then((r) => setPersonas(r.personas))
      .catch(() => setPersonas([]));
  }, [slug]);

  // Already signed in → skip portal
  useEffect(() => {
    if (loading || !user || !org) return;
    setActiveOrg(org.id);
    navigate("/home", { replace: true });
  }, [loading, user, org, setActiveOrg, navigate]);

  const grouped = useMemo(() => {
    const map = new Map<string, DevPersonaEntry[]>();
    for (const p of personas) {
      const key = p.role || "member";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [personas]);

  const accent = org?.theme_accent_color || "#2563EB";
  const style = { ["--accent" as string]: accent } as CSSProperties;

  async function land(oid: string) {
    setActiveOrg(oid);
    navigate("/home", { replace: true });
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password, slug);
      const branding = org || await getOrgBySlug(slug);
      await land(branding.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function pickPersona(em: string) {
    setBusy(true);
    setError(null);
    try {
      await devLoginAs(em, slug);
      await refresh();
      const branding = org || await getOrgBySlug(slug);
      await land(branding.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="app-shell" style={style}>
        <div className="phone-frame center">
          <p className="error">No organization at this address.</p>
        </div>
      </div>
    );
  }

  if (!org || loading) {
    return (
      <div className="app-shell" style={style}>
        <div className="phone-frame center"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={style}>
      <div className="phone-frame">
        <div className="content stack" style={{ paddingTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {org.theme_logo_url ? (
              <img
                src={resolveAssetUrl(org.theme_logo_url) || undefined}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }}
              />
            ) : (
              <div className="avatar" style={{ background: accent, width: 44, height: 44, borderRadius: 12 }}>
                {org.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{org.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Mobile · /@/{slug}</div>
            </div>
          </div>

          <div className="card stack">
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sign in</h1>
              <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
                Continue to {org.name} on your phone.
              </p>
            </div>

            <form className="stack" onSubmit={signIn}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={`you@${slug}.org`}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? <p className="error">{error}</p> : null}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          {DEV_ENABLED && grouped.length > 0 ? (
            <div className="stack">
              <p className="section-label">Test as anyone in this org</p>
              {grouped.map(([role, list]) => (
                <div key={role} className="stack">
                  <div style={{ fontSize: 13, fontWeight: 650, textTransform: "capitalize" }}>
                    {role} ({list.length})
                  </div>
                  {list.map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      className="persona"
                      disabled={busy}
                      onClick={() => void pickPersona(p.email)}
                    >
                      <div className="avatar" style={{ background: accent }}>
                        {(p.display_name || p.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="name">{p.display_name || p.email.split("@")[0]}</div>
                        <div className="meta">{p.email}</div>
                      </div>
                      <ChevronRight size={16} style={{ marginLeft: "auto", color: "#C4CBD4" }} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            This is {org.name}'s mobile space.
          </p>
        </div>
      </div>
    </div>
  );
}
