import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { listRegistrations, approveRegistration, rejectRegistration, adminAddRegistration } from "../../../services/api";
import type { Offering, Registration } from "../../../types/platform";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

export function RegistrationQueue({ offering, accent }: { offering: Offering; accent: string }) {
  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [addBusy, setAddBusy] = useState(false);

  function load() {
    listRegistrations(offering.id, "pending_review")
      .then(setRegistrations)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load registrations"));
  }

  useEffect(load, [offering.id]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await approveRegistration(id);
      setRegistrations((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await rejectRegistration(id);
      setRegistrations((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusyId(null);
    }
  }

  async function submitAdd() {
    const email = values.email?.trim();
    if (!email) {
      setError("Email is required to add a participant directly");
      return;
    }
    setAddBusy(true);
    setError("");
    try {
      await adminAddRegistration(offering.id, {
        email,
        name: values.name,
        age: values.age ? Number(values.age) : undefined,
        field_data: values,
      });
      setValues({});
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add participant");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Pending Registrations {registrations ? `(${registrations.length})` : ""}
        </p>
        <button
          type="button" onClick={() => setShowAdd((v) => !v)}
          className="text-[11px] font-medium transition-colors focus:outline-none"
          style={{ color: accent, fontFamily: FONT_BODY }}
        >
          Add participant directly
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          {offering.signup_fields.map((f) => (
            <input
              key={f.key}
              type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
              value={values[f.key] || ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={`${f.label}${f.required ? " *" : ""}`}
              className="w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
              style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
            />
          ))}
          <button
            type="button" onClick={submitAdd} disabled={addBusy}
            className="self-end px-4 h-9 rounded-lg text-xs font-semibold transition-all focus:outline-none disabled:opacity-50"
            style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
          >{addBusy ? "Adding…" : "Add"}</button>
        </div>
      )}

      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {registrations && registrations.length === 0 && (
        <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No pending registrations.</p>
      )}

      {registrations?.map((r) => (
        <div key={r.id} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{r.name || r.email || "Unnamed"}</p>
            <p className="text-[11px] truncate" style={{ color: MUTED, fontFamily: FONT_BODY }}>{r.email}{r.age ? ` · age ${r.age}` : ""}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button" onClick={() => approve(r.id)} disabled={busyId === r.id}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors focus:outline-none disabled:opacity-50"
              style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
            ><Check size={13} /> Approve</button>
            <button
              type="button" onClick={() => reject(r.id)} disabled={busyId === r.id}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}
            ><X size={13} /> Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
