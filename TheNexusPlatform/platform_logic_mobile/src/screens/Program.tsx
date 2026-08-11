import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronLeft, Rocket } from "lucide-react";
import { launchLearningPlatform, listPrograms, type Program } from "../api";
import { useSession } from "../session";

/** Rewrite localhost URLs to the host the phone is already using (Mac LAN IP). */
function phoneFriendlyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      u.hostname = window.location.hostname;
    }
    return u.toString();
  } catch {
    return url;
  }
}

function contentStudioFallback(): string {
  const fromEnv = (import.meta.env.VITE_LEARNING_PLATFORM_URL as string | undefined)?.replace(/\/$/, "");
  if (fromEnv) return phoneFriendlyUrl(fromEnv);
  const host = window.location.hostname;
  return `http://${host}:5173`;
}

export function ProgramScreen() {
  const { programId = "" } = useParams();
  const { user, loading, activeOrgId, orgMemberships, programMemberships } = useSession();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const orgId =
    activeOrgId ||
    orgMemberships[0]?.org_id ||
    programMemberships[0]?.org_id ||
    null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/@/life-in-ai-center", { replace: true });
      return;
    }
    if (!orgId || !programId) return;
    listPrograms(orgId)
      .then((list) => {
        const found = list.find((p) => p.id === programId) || null;
        setProgram(found);
        if (!found) setError("Program not found.");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load program"));
  }, [loading, user, orgId, programId, navigate]);

  async function openContentStudio() {
    setLaunching(true);
    setError(null);
    try {
      const launch = await launchLearningPlatform(programId);
      const returnUrl = `${window.location.origin}/p/${programId}`;
      const base = launch.launch_url
        ? phoneFriendlyUrl(launch.launch_url)
        : contentStudioFallback();
      const sep = base.includes("?") ? "&" : "?";
      window.location.href =
        `${base}${sep}launch_token=${encodeURIComponent(launch.launch_token)}` +
        `&return_url=${encodeURIComponent(returnUrl)}` +
        `&program_id=${encodeURIComponent(programId)}` +
        `&mobile=1`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
      setLaunching(false);
    }
  }

  if (loading || (!program && !error)) {
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
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: "0 10px" }}
            onClick={() => navigate("/home")}
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{program?.name || "Program"}</h1>
            <p className="sub">Program workspace</p>
          </div>
        </header>

        <div className="content stack">
          {program?.description ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{program.description}</p>
          ) : null}

          {error ? <p className="error">{error}</p> : null}

          <button
            type="button"
            className="list-item"
            disabled={launching}
            onClick={() => void openContentStudio()}
            style={{ alignItems: "flex-start" }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "color-mix(in srgb, var(--accent) 14%, white)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "var(--accent)",
              }}
            >
              <Rocket size={20} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 15 }}>Content Studio</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {launching ? "Launching…" : "Author lessons and courses for this program."}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
