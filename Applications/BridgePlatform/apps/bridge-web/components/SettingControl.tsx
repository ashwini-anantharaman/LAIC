import type { Setting, SettingValue } from "@bridge/config";

/**
 * One setting, rendered by its control type (the prototype's editor
 * controls): toggle, selects, multi-select, HCP range, number. Form field
 * names follow `setting:<key>` (`:low`/`:high` for ranges) and are parsed
 * back by lib/settingForm.parseSettingValue.
 */
export function SettingControl({
  setting,
  value,
  disabled,
}: Readonly<{ setting: Setting; value: SettingValue; disabled?: boolean }>) {
  const name = `setting:${setting.key}`;
  const base = "rounded border border-neutral-300 px-1.5 py-0.5 text-sm disabled:opacity-40";

  switch (setting.control) {
    case "toggle":
      return (
        <input
          type="checkbox"
          name={name}
          defaultChecked={Boolean(value)}
          disabled={disabled}
        />
      );
    case "single_select":
    case "lead_select":
    case "signal_select":
      return (
        <select name={name} defaultValue={String(value)} disabled={disabled} className={base}>
          {(setting.options ?? []).map((o) => (
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
          {(setting.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={selected.includes(o.value)}
                disabled={disabled}
              />
              {o.label}
            </label>
          ))}
        </span>
      );
    }
    case "range_hcp": {
      const range =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as { low: number; high: number })
          : { low: setting.min ?? 0, high: setting.max ?? 40 };
      return (
        <span className="flex items-center gap-1 text-sm">
          <input
            type="number"
            name={`${name}:low`}
            defaultValue={range.low}
            min={setting.min}
            max={setting.max}
            disabled={disabled}
            className={`w-16 ${base}`}
          />
          –
          <input
            type="number"
            name={`${name}:high`}
            defaultValue={range.high}
            min={setting.min}
            max={setting.max}
            disabled={disabled}
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
          min={setting.min}
          max={setting.max}
          disabled={disabled}
          className={`w-20 ${base}`}
        />
      );
    default:
      return <span className="text-xs text-neutral-400">unsupported control</span>;
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
