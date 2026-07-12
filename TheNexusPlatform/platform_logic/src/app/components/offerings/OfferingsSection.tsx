import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { listOfferings, createOffering } from "../../../services/api";
import { DEFAULT_SIGNUP_FIELDS } from "../../../types/platform";
import type { ApprovalMode, Offering, OfferingType, Program, SignupField } from "../../../types/platform";
import { SignupFieldsEditor } from "./SignupFieldsEditor";
import { OfferingCard } from "./OfferingCard";
import { BORDER, INPUT_BG, MUTED, FONT_BODY } from "../../theme";

const OFFERING_TYPES: OfferingType[] = ["course", "challenge", "app", "cohort", "class", "event", "assessment", "pilot"];

export function OfferingsSection({ program, accent }: { program: Program; accent: string }) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [offeringType, setOfferingType] = useState<OfferingType>("course");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("manual_approve");
  const [fields, setFields] = useState<SignupField[]>(DEFAULT_SIGNUP_FIELDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOfferings(program.id)
      .then(setOfferings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load offerings"));
  }, [program.id]);

  async function addOffering() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createOffering(program.id, {
        name: name.trim(),
        offering_type: offeringType,
        approval_mode: approvalMode,
        signup_fields: fields,
      });
      setOfferings((prev) => [...(prev || []), created]);
      setName("");
      setFields(DEFAULT_SIGNUP_FIELDS);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offering");
    } finally {
      setBusy(false);
    }
  }

  function replaceOffering(updated: Offering) {
    setOfferings((prev) => (prev || []).map((o) => (o.id === updated.id ? updated : o)));
  }

  return (
    <div className="mt-4 pt-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Offerings
        </p>
        <button
          type="button" onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors focus:outline-none"
          style={{ color: accent, fontFamily: FONT_BODY }}
        >
          <Plus size={13} /> New offering
        </button>
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Offering name (e.g. Brain Bee Course 2026)"
                className="w-full h-10 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
                style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
              />
              <div className="flex items-center gap-3">
                <select
                  value={offeringType}
                  onChange={(e) => setOfferingType(e.target.value as OfferingType)}
                  className="h-9 rounded-lg px-2 text-xs text-white outline-none"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                >
                  {OFFERING_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                  {([
                    { key: "manual_approve", label: "Manual" },
                    { key: "auto_approve", label: "Auto" },
                  ] as { key: ApprovalMode; label: string }[]).map((o) => (
                    <button
                      key={o.key} type="button" onClick={() => setApprovalMode(o.key)}
                      className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-all focus:outline-none"
                      style={{ background: approvalMode === o.key ? accent : "transparent", color: approvalMode === o.key ? "#111" : MUTED, fontFamily: FONT_BODY }}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
              <SignupFieldsEditor fields={fields} onChange={setFields} accent={accent} />
              <button
                type="button" onClick={addOffering} disabled={busy}
                className="self-end px-5 h-10 rounded-xl text-sm font-semibold transition-all focus:outline-none disabled:opacity-50"
                style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
              >{busy ? "Creating…" : "Create offering"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {offerings && offerings.length === 0 && !adding && (
        <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No offerings yet for this program.</p>
      )}

      <div className="flex flex-col gap-2">
        {offerings?.map((o) => (
          <OfferingCard key={o.id} offering={o} programId={program.id} accent={accent} onUpdated={replaceOffering} />
        ))}
      </div>
    </div>
  );
}
