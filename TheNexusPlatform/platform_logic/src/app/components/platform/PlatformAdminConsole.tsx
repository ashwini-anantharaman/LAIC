/**
 * Platform Admin console — a person with role `platform_admin` who manages every
 * organization on the platform (not scoped to one org). Lists all orgs and opens
 * any org's full workspace (reusing PlatformWorkspace).
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Building2, ChevronRight, ArrowLeft } from "lucide-react";
import { listAllOrganizations, getMe, type OrgSummary } from "../../../services/api";
import { BASE, BORDER, MUTED, FONT_HEAD, FONT_BODY, slide } from "../../theme";
import { PlatformWorkspace } from "./PlatformWorkspace";

const ACCENT = "#ffffff";

export function PlatformAdminConsole({ onLogout }: { onLogout: () => void }) {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [selected, setSelected] = useState<OrgSummary | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getMe().then((me) => setDisplayName(me.display_name || me.email.split("@")[0])).catch(() => {});
    listAllOrganizations()
      .then(setOrgs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load organizations"));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: BASE }}>
      <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.25) 0%, transparent 55%)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.20) 0%, transparent 55%)" }} />
      <motion.div className="relative z-10 max-w-6xl mx-auto px-8 md:px-14 py-14" {...slide}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>MindBrainAI Nexus · Platform Admin</p>
            <h1 className="mt-1 text-4xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Welcome, {displayName || "Admin"}</h1>
          </div>
          <button onClick={onLogout} className="text-xs hover:text-white transition-colors focus:outline-none mt-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Sign out</button>
        </div>
        <div className="mt-8 h-px w-full" style={{ background: BORDER }} />

        {selected ? (
          <div className="mt-8">
            <button
              type="button" onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-xs mb-4 transition-colors focus:outline-none hover:text-white"
              style={{ color: MUTED, fontFamily: FONT_BODY }}
            >
              <ArrowLeft size={14} /> All organizations
            </button>
            <PlatformWorkspace orgId={selected.id} orgName={selected.name} accent={ACCENT} />
          </div>
        ) : (
          <div className="mt-10">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Organizations</h2>
                <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>Every organization on the platform. Open one to manage it.</p>
              </div>
              <span className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{orgs ? `${orgs.length} total` : ""}</span>
            </div>
            {error && <p className="mb-3 text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
            {orgs && orgs.length === 0 && (
              <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
                <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>No organizations yet.</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orgs?.map((o) => (
                <button
                  key={o.id} type="button" onClick={() => setSelected(o)}
                  className="text-left rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/6 active:scale-[0.99] focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: ACCENT, color: "#111" }}>
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{o.name}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                      {o.slug}{o.status ? ` · ${o.status}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: MUTED }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
