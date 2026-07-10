import { Plus, X } from "lucide-react";
import type { SignupField, SignupFieldType } from "../../../types/platform";
import { BORDER, INPUT_BG, MUTED, FONT_BODY } from "../../theme";

const TYPE_OPTIONS: { key: SignupFieldType; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "number", label: "Number" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "select", label: "Select" },
  { key: "boolean", label: "Yes/No" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

export function SignupFieldsEditor({
  fields,
  onChange,
  accent,
}: {
  fields: SignupField[];
  onChange: (fields: SignupField[]) => void;
  accent: string;
}) {
  function update(index: number, patch: Partial<SignupField>) {
    const next = fields.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addField() {
    onChange([...fields, { key: `field_${fields.length + 1}`, label: "New field", type: "text", required: false }]);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Signup Fields
        </p>
        <button
          type="button"
          onClick={addField}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors focus:outline-none"
          style={{ color: accent, fontFamily: FONT_BODY }}
        >
          <Plus size={13} /> Add field
        </button>
      </div>
      {fields.map((f, i) => (
        <div key={i} className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={f.label}
              onChange={(e) => update(i, { label: e.target.value, key: f.key || slugify(e.target.value) })}
              placeholder="Field label"
              className="flex-1 h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
              style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
            />
            <button type="button" onClick={() => removeField(i)} className="p-1.5 rounded-lg transition-colors focus:outline-none" style={{ color: MUTED }}>
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={f.type}
              onChange={(e) => update(i, { type: e.target.value as SignupFieldType })}
              className="h-8 rounded-lg px-2 text-xs text-white outline-none"
              style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} />
              Required
            </label>
            {f.type === "select" && (
              <input
                type="text"
                value={(f.options || []).join(", ")}
                onChange={(e) => update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Option A, Option B, …"
                className="flex-1 h-8 rounded-lg px-2 text-xs text-white outline-none placeholder:text-white/25 min-w-[160px]"
                style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
