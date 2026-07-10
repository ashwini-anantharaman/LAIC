import { useEffect, useState } from "react";
import { listParticipants } from "../../../services/api";
import type { Offering, Participant } from "../../../types/platform";
import { BORDER, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const STATUS_COLORS: Record<Participant["status"], string> = {
  active: "rgba(34,197,94,0.25)",
  inactive: "rgba(255,255,255,0.10)",
  completed: "rgba(48,26,78,0.35)",
  removed: "rgba(130,30,22,0.35)",
};

function participantWord(offering: Offering, count: number): string {
  if (count === 1) return offering.participant_label_singular || "participant";
  return offering.participant_label_plural || "participants";
}

export function ParticipantsList({ offering }: { offering: Offering }) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listParticipants(offering.id)
      .then(setParticipants)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load participants"));
  }, [offering.id]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        Participants {participants ? `(${participants.length})` : ""}
      </p>

      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {participants && participants.length === 0 && (
        <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          No {participantWord(offering, 2)} yet — approve a registration or add one directly.
        </p>
      )}

      {participants?.map((p) => (
        <div key={p.id} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>
              {p.display_name || p.email || "Unnamed"}
            </p>
            <p className="text-[11px] truncate" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              {p.email || "no email"} · joined {new Date(p.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>
              {p.participant_type}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase" style={{ background: STATUS_COLORS[p.status], color: "rgba(255,255,255,0.85)" }}>
              {p.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
