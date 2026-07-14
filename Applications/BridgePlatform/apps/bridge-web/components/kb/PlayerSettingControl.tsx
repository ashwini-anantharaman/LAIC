// Player-level setting controls over the compiled registry (spec: packs pick
// items; settings tune within). Field names follow `setting:<key>`
// (`:low`/`:high` for ranges), parsed back in lib/playerForm.ts.

import type { SettingValue } from "@bridge/config";
import type { CompiledSetting } from "@bridge/kb";

export function PlayerSettingControl({
  spec,
  value,
}: Readonly<{ spec: CompiledSetting; value: SettingValue }>) {
  const name = `setting:${spec.key}`;
  const base = "rounded border border-neutral-300 px-1.5 py-0.5 text-sm";

  switch (spec.control) {
    case "toggle":
      return <input type="checkbox" name={name} defaultChecked={Boolean(value)} />;
    case "range_hcp": {
      const range =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as { low: number; high: number })
          : { low: spec.min ?? 0, high: spec.max ?? 40 };
      return (
        <span className="flex items-center gap-1 text-sm">
          <input
            type="number"
            name={`${name}:low`}
            defaultValue={range.low}
            min={spec.min}
            max={spec.max}
            className={`w-16 ${base}`}
          />
          –
          <input
            type="number"
            name={`${name}:high`}
            defaultValue={range.high}
            min={spec.min}
            max={spec.max}
            className={`w-16 ${base}`}
          />
          <span className="text-xs text-neutral-400">HCP</span>
        </span>
      );
    }
    case "number":
      return (
        <input
          type="number"
          name={name}
          defaultValue={Number(value)}
          min={spec.min}
          max={spec.max}
          className={`w-20 ${base}`}
        />
      );
    case "single_select":
      return (
        <select name={name} defaultValue={String(value)} className={base}>
          {(spec.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {(spec.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={selected.includes(o.value)}
              />
              {o.label}
            </label>
          ))}
        </span>
      );
    }
  }
}

/** Compact display of any setting value ("15–17", "a, b", "on"). */
export function formatSettingValue(value: SettingValue): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) return value.join(", ") || "none";
  if (typeof value === "object" && value !== null)
    return `${(value as { low: number }).low}–${(value as { high: number }).high}`;
  return String(value);
}
