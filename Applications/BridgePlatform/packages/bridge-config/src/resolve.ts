import { dependencyMet } from "./dependencies";
import type {
  Option,
  ResolvedSetting,
  Setting,
  SettingValue,
  SkillLevel,
  ValueProfile,
  VisibilityProfile,
  VisibilityState,
} from "./types";

// Resolution algorithm, ported from the prototype but parameterized over the
// setting registry: combine one value profile + one visibility profile into a
// per-setting { state, options, value }. Resolution chain per value:
// values -> base_preset -> registry default.

const SKILL_ORDER: Record<SkillLevel, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
};

export function skillAtOrBelow(level: SkillLevel, max: SkillLevel): boolean {
  return SKILL_ORDER[level] <= SKILL_ORDER[max];
}

export function resolveValue(
  setting: Setting,
  valueProfile: ValueProfile,
  basePresetValues: Record<string, SettingValue> | undefined,
): SettingValue {
  const fromProfile = valueProfile.values[setting.key];
  if (fromProfile !== undefined) return fromProfile;
  const fromPreset = basePresetValues?.[setting.key];
  if (fromPreset !== undefined) return fromPreset;
  return setting.default;
}

export function resolveState(
  setting: Setting,
  visibility: VisibilityProfile,
): VisibilityState {
  const explicit = visibility.settings[setting.key]?.state;
  if (explicit) return explicit;
  return skillAtOrBelow(setting.skill_level, visibility.max_teaching_level)
    ? "editable"
    : visibility.default_state_for_unlisted;
}

export function resolveOptions(
  setting: Setting,
  visibility: VisibilityProfile,
): Option[] {
  const allowed = visibility.settings[setting.key]?.allowed_options;
  const base = setting.options ?? [];
  if (!allowed) return base;
  return base.filter((opt) => allowed.includes(opt.value));
}

/** Resolve every setting in `settings` into a map keyed by setting key. */
export function resolveAll(
  settings: readonly Setting[],
  valueProfile: ValueProfile,
  visibility: VisibilityProfile,
  basePresetValues?: Record<string, SettingValue>,
): Record<string, ResolvedSetting> {
  // First pass: resolve raw values so dependencies can read them.
  const values: Record<string, SettingValue> = {};
  for (const setting of settings) {
    values[setting.key] = resolveValue(setting, valueProfile, basePresetValues);
  }
  const getValue = (key: string) => values[key];

  const out: Record<string, ResolvedSetting> = {};
  for (const setting of settings) {
    out[setting.key] = {
      setting,
      state: resolveState(setting, visibility),
      options: resolveOptions(setting, visibility),
      value: values[setting.key]!,
      dependencyMet: dependencyMet(setting, getValue),
    };
  }
  return out;
}

/** Flatten a resolved map to plain key -> value (what the engine consumes). */
export function resolvedValues(
  resolved: Record<string, ResolvedSetting>,
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const [key, r] of Object.entries(resolved)) out[key] = r.value;
  return out;
}

/** Plain key -> default map for a registry (no profiles applied). */
export function defaultSettingValues(
  settings: readonly Setting[],
): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const s of settings) out[s.key] = s.default;
  return out;
}
