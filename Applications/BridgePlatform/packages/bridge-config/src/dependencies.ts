import type { Dependency, Setting, SettingValue } from "./types";

// Dependency evaluation, ported from the prototype. A child control is
// interactive only when its parent dependency is satisfied.

/** Evaluate a single dependency against the resolved value of its parent key. */
export function isDependencyMet(
  dep: Dependency | null,
  parentValue: SettingValue | undefined,
): boolean {
  if (!dep) return true;
  switch (dep.type) {
    case "is_true":
      return parentValue === true;
    case "equals":
      // Compare as strings so booleans declared as "false" in a registry match.
      return String(parentValue) === dep.value;
    case "not_equals":
      return String(parentValue) !== dep.value;
    case "is_set":
      return parentValue !== undefined && parentValue !== null;
    default:
      return true;
  }
}

/** Evaluate a setting's dependency given a resolved-value lookup. */
export function dependencyMet(
  setting: Setting,
  getValue: (key: string) => SettingValue | undefined,
): boolean {
  if (!setting.depends_on) return true;
  return isDependencyMet(setting.depends_on, getValue(setting.depends_on.key));
}
