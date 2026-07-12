/**
 * Program Offering detail page.
 *
 * The top card depends on the offering type:
 *  - app     → Registered App record + signup-hook explainer (Nexus owns auth +
 *              the hook; the app owns its own screens).
 *  - course  → Learning Platform handoff. Nexus does not author lessons.
 *  - other   → generic overview.
 * Registrations (approval queue) and Participants are Nexus's job for every
 * offering type and are shown below.
 */
import { useState } from "react";
import { ArrowUpRight, BookOpen, Trash2 } from "lucide-react";
import { publishOffering, closeOffering, updateOffering, deleteOffering } from "../../../services/api";
import type { Offering, OfferingStatus, Program } from "../../../types/platform";
import { AppShellEditor } from "./AppShellEditor";
import { RegistrationQueue } from "../offerings/RegistrationQueue";
import { ParticipantsList } from "../offerings/ParticipantsList";
import { BulkImportPanel } from "./OrgGraphSections";
import { BORDER, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const LEARNING_APP_URL =
  (import.meta.env.VITE_LEARNING_APP_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:5180";

const STATUSES: OfferingStatus[] = ["draft", "private_beta", "open", "closed", "completed", "archived"];

export function OfferingDetail({ program, offering: initial, accent, onDeleted }: { program: Program; offering: Offering; accent: string; onDeleted?: () => void }) {
  const [offering, setOffering] = useState<Offering>(initial);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rosterKey, setRosterKey] = useState(0);
  const isApp = offering.offering_type === "app";
  const isCourse = offering.offering_type === "course";
  const kind = isApp ? "app shell" : isCourse ? "course" : offering.offering_type;

  async function handleDelete() {
    if (!onDeleted) return;
    if (!window.confirm(`Delete "${offering.name}"? This permanently removes the ${kind} and its registrations, participants${isApp ? ", and app-shell credential" : ""}. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteOffering(offering.id);
      onDeleted();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function setStatus(status: OfferingStatus) {
    setBusy(true);
    try {
      const updated =
        status === "open" ? await publishOffering(offering.id) :
        status === "closed" ? await closeOffering(offering.id) :
        await updateOffering(offering.id, { status });
      setOffering(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{offering.name}</h2>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>{offering.offering_type}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            module: {offering.platform_module} · {offering.approval_mode === "auto_approve" ? "Auto-approve" : "Manual approve"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={offering.status} disabled={busy}
            onChange={(e) => setStatus(e.target.value as OfferingStatus)}
            className="h-9 rounded-lg px-2 text-xs text-white outline-none disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          {onDeleted && (
            <button
              type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-all focus:outline-none disabled:opacity-50"
              style={{ background: "rgba(220,38,38,0.12)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)", fontFamily: FONT_BODY }}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      {/* Type-specific top card */}
      {isApp ? (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>App shell</p>
          <AppShellEditor programId={program.id} offering={offering} accent={accent} onOfferingUpdated={setOffering} />
        </section>
      ) : isCourse ? (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Course content</p>
          <div className="rounded-xl p-5 flex items-start gap-4" style={{ background: "rgba(90,79,214,0.08)", border: `1px solid rgba(90,79,214,0.25)` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(90,79,214,0.2)", color: "#a99cff" }}>
              <BookOpen size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>Authored on the Learning Platform</p>
              <p className="text-[11px] mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                Nexus owns this course's registration records and access. Lessons, modules, and explanation modes are built and edited on the Learning Platform.
              </p>
              <a
                href={offering.external_runtime_url || LEARNING_APP_URL}
                target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition-all focus:outline-none"
                style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
              >
                Open in Learning Platform <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Overview</p>
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              {offering.description || `This is a ${offering.offering_type} offering. Manage its registrations and participants below.`}
            </p>
          </div>
        </section>
      )}

      {/* Registrations + Participants (all offering types) */}
      <section className="flex flex-col gap-3">
        <BulkImportPanel offeringId={offering.id} accent={accent} onImported={() => setRosterKey((k) => k + 1)} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <RegistrationQueue key={`reg-${rosterKey}`} offering={offering} accent={accent} />
          </div>
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <ParticipantsList key={`par-${rosterKey}`} offering={offering} />
          </div>
        </div>
      </section>
    </div>
  );
}
