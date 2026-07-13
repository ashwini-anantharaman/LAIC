import type { Setting, SettingValue } from "@bridge/config";

/** Parse a SettingControl form field back into a typed SettingValue. */
export function parseSettingValue(setting: Setting, formData: FormData): SettingValue {
  const name = `setting:${setting.key}`;
  switch (setting.control) {
    case "toggle":
      return formData.get(name) === "on";
    case "single_select":
    case "lead_select":
    case "signal_select": {
      const v = String(formData.get(name) ?? setting.default);
      return (setting.options ?? []).some((o) => o.value === v)
        ? v
        : (setting.default as SettingValue);
    }
    case "multi_select":
      return formData.getAll(name).map(String);
    case "range_hcp": {
      const fallback = setting.default as { low: number; high: number };
      const low = Number(formData.get(`${name}:low`) ?? fallback.low);
      const high = Number(formData.get(`${name}:high`) ?? fallback.high);
      const clamp = (n: number) =>
        Math.min(Math.max(Number.isFinite(n) ? n : 0, setting.min ?? 0), setting.max ?? 40);
      const lo = clamp(low);
      const hi = clamp(high);
      return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
    }
    case "number": {
      const n = Number(formData.get(name) ?? setting.default);
      return Number.isFinite(n) ? n : (setting.default as SettingValue);
    }
    default:
      return setting.default;
  }
}
