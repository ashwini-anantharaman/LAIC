import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { listPrograms, type Program } from "../api";
import { useSession } from "../session";

export function HomeScreen() {
  const { user, loading, activeOrgId, logout, orgMemberships, programMemberships } = useSession();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const orgId =
    activeOrgId ||
    orgMemberships[0]?.org_id ||
    programMemberships[0]?.org_id ||
    null;

  const orgName =
    orgMemberships.find((m) => m.org_id === orgId)?.org_name ||
    programMemberships.find((m) => m.org_id === orgId)?.org_name ||
    "Organization";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/@/life-in-ai-center", { replace: true });
      return;
    }
    if (!orgId) {
      setBusy(false);
      setError("No organization on this account.");
      return;
    }
    setBusy(true);
    listPrograms(orgId)
      .then(setPrograms)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load programs"))
      .finally(() => setBusy(false));
  }, [loading, user, orgId, navigate]);

  if (loading || busy) {
    return (
      <div className="app-shell">
        <div className="phone-frame center"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <header className="topbar">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{orgName}</h1>
            <p className="sub">{user?.email}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "0 10px" }}
            onClick={() => {
              logout();
              navigate("/@/life-in-ai-center", { replace: true });
            }}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </header>

        <div className="content stack">
          <div>
            <p className="section-label">Programs</p>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--muted)" }}>
              Pick a program to open its mobile workspace.
            </p>
          </div>

          {error ? <p className="error">{error}</p> : null}

          {programs.length === 0 && !error ? (
            <div className="card">
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>No programs yet.</p>
            </div>
          ) : (
            programs.map((p) => (
              <button
                key={p.id}
                type="button"
                className="list-item"
                onClick={() => navigate(`/p/${p.id}`)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 15 }}>{p.name}</div>
                  {p.description ? (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }} className="meta">
                      {p.description}
                    </div>
                  ) : null}
                  {p.category ? (
                    <span className="badge" style={{ marginTop: 8 }}>{p.category}</span>
                  ) : null}
                </div>
                <ChevronRight size={18} className="chev" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
