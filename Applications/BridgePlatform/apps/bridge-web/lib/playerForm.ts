// Parse player-configuration form fields (setting:<key> naming) back into
// typed overrides, keeping only values that DIFFER from compiled defaults —
// overrides stay minimal and the convention card's off-default marks stay
// meaningful.

import type { SettingValue } from "@bridge/config";
import type { CompiledKb } from "@bridge/kb";
import { stableStringify } from "@bridge/kb";

export function parseSettingOverrides(
  fd: FormData,
  compiled: CompiledKb,
): Record<string, SettingValue> {
  const overrides: Record<string, SettingValue> = {};
  for (const spec of compiled.settings) {
    const name = `setting:${spec.key}`;
    let value: SettingValue;
    switch (spec.control) {
      case "toggle":
        value = fd.get(name) === "on";
        break;
      case "range_hcp": {
        const fallback = spec.default as { low: number; high: number };
        const low = Number(fd.get(`${name}:low`) ?? fallback.low);
        const high = Number(fd.get(`${name}:high`) ?? fallback.high);
        value = {
          low: Math.min(low, high),
          high: Math.max(low, high),
        };
        break;
      }
      case "number":
        value = Number(fd.get(name) ?? spec.default);
        if (!Number.isFinite(value)) value = spec.default;
        break;
      case "multi_select":
        value = fd.getAll(name).map(String);
        break;
      default:
        value = String(fd.get(name) ?? spec.default);
    }
    if (stableStringify(value) !== stableStringify(spec.default)) overrides[spec.key] = value;
  }
  return overrides;
}
