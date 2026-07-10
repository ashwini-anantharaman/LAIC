import { useState } from "react";
import { updateOffering, publishOffering, closeOffering } from "../../../services/api";
import type { Offering, OfferingStatus } from "../../../types/platform";
import { RegisteredAppPanel } from "./RegisteredAppPanel";
import { RegistrationQueue } from "./RegistrationQueue";
import { ParticipantsList } from "./ParticipantsList";
import { BORDER, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const STATUS_COLORS: Record<OfferingStatus, string> = {
  draft: "rgba(255,255,255,0.10)",
  private_beta: "rgba(130,30,22,0.35)",
  open: "rgba(34,197,94,0.25)",
  closed: "rgba(255,255,255,0.10)",
  completed: "rgba(48,26,78,0.35)",
  archived: "rgba(255,255,255,0.06)",
};

type Tab = "registrations" | "participants" | "app";

const TABS: { key: Tab; label: string }[] = [
  { key: "registrations", label: "Registrations" },
  { key: "participants", label: "Participants" },
  { key: "app", label: "App" },
];

export function OfferingCard({
  offering,
  programId,
  accent,
  onUpdated,
}: {
  offering: Offering;
  programId: string;
  accent: string;
  onUpdated: (updated: Offering) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("registrations");
  const [busy, setBusy] = useState(false);

  async function setStatus(status: OfferingStatus) {
    setBusy(true);
    try {
      const updated =
        status === "open" ? await publishOffering(offering.id) :
        status === "closed" ? await closeOffering(offering.id) :
        await updateOffering(offering.id, { status });
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left focus:outline-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{offering.name}</p>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex-shrink-0" style={{ background: STATUS_COLORS[offering.status], color: "rgba(255,255,255,0.85)" }}>
                {offering.status.replace("_", " ")}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>
                {offering.offering_type}
              </span>
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              {offering.approval_mode === "auto_approve" ? "Auto-approve" : "Manual approve"}
              {offering.pending_count > 0 ? ` · ${offering.pending_count} pending` : ""}
              {` · ${offering.participant_count} participant${offering.participant_count === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: `1px solid ${BORDER}` }}>
              {TABS.map(({ key, label }) => (
                <button
                  key={key} type="button" onClick={() => setTab(key)}
                  className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase whitespace-nowrap transition-all focus:outline-none"
                  style={{ background: tab === key ? accent : "transparent", color: tab === key ? "#111" : MUTED, fontFamily: FONT_BODY }}
                >{label}</button>
              ))}
            </div>
            <select
              value={offering.status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value as OfferingStatus)}
              className="h-8 rounded-lg px-2 text-xs text-white outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
            >
              {(["draft", "private_beta", "open", "closed", "completed", "archived"] as OfferingStatus[]).map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          {tab === "registrations" && <RegistrationQueue offering={offering} accent={accent} />}
          {tab === "participants" && <ParticipantsList offering={offering} />}
          {tab === "app" && <RegisteredAppPanel programId={programId} offeringId={offering.id} accent={accent} />}
        </div>
      )}
    </div>
  );
}
