// Setting-registry MECHANICS types, ported from the bridgebot prototype
// (src/vendor/config/engine/types.ts). Content-free: the actual setting
// definitions (the ~160-entry registry) are NOT ported — they re-enter via
// the Phase 3 knowledge pipeline as published packages with source citations.

export type ControlType =
  | "toggle"
  | "single_select"
  | "multi_select"
  | "range_hcp"
  | "number"
  | "lead_select"
  | "signal_select";

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

/**
 * Which knowledge domain a setting belongs to:
 *  - `convention`: a partnership agreement (what a bid means)
 *  - `technique`: a play-engine capability/policy (how the cards are played)
 */
export type SettingDomain = "convention" | "technique";

export type BindsTo =
  | "convention_rules"
  | "numeric_parameter"
  | "play_table"
  | "signal_codec"
  | "play_policy";

export interface Option {
  value: string;
  label: string;
}

/** A range-of-HCP value, e.g. { low: 15, high: 17 }. */
export interface HcpRange {
  low: number;
  high: number;
}

/** Any value a setting can hold in a value profile. */
export type SettingValue = boolean | string | number | string[] | HcpRange;

/**
 * Dependency rule: the child control is interactive only when the predicate
 * over the current resolved values is satisfied.
 */
export interface Dependency {
  key: string;
  type: "is_true" | "not_equals" | "equals" | "is_set";
  value?: string;
}

export interface Setting {
  key: string;
  label: string;
  control: ControlType;
  options?: Option[];
  default: SettingValue;
  module: string;
  group?: string;
  exclusive_group: string | null;
  depends_on: Dependency | null;
  skill_level: SkillLevel;
  coach_supported: boolean;
  binds_to: BindsTo;
  aliases: string[];
  description: string;
  min?: number;
  max?: number;
  /** Origin tag (informational; provenance proper lives on knowledge items). */
  origin: string;
}

export interface Module {
  id: string;
  number: number;
  title: string;
  domain: SettingDomain;
}

// ---------------------------------------------------------------------------
// Value profile
// ---------------------------------------------------------------------------

export interface LeadValues {
  vs_suit: Record<string, string>;
  vs_nt: Record<string, string>;
}

export interface ValueProfile {
  profile_id: string;
  name: string;
  base_preset: string | null;
  values: Record<string, SettingValue>;
  leads?: LeadValues;
}

// ---------------------------------------------------------------------------
// Visibility profile
// ---------------------------------------------------------------------------

export type VisibilityState = "editable" | "locked" | "hidden";

export interface VisibilitySetting {
  state?: VisibilityState;
  allowed_options?: string[];
}

export interface VisibilityProfile {
  visibility_id: string;
  name: string;
  audience?: string;
  max_teaching_level: SkillLevel;
  settings: Record<string, VisibilitySetting>;
  default_state_for_unlisted: VisibilityState;
}

// ---------------------------------------------------------------------------
// Resolved view
// ---------------------------------------------------------------------------

export interface ResolvedSetting {
  setting: Setting;
  state: VisibilityState;
  options: Option[];
  value: SettingValue;
  dependencyMet: boolean;
}

/**
 * A detected configuration contradiction (non-blocking). Conflict RULES are
 * content: they arrive as generated artifacts from knowledge packages, not
 * hardcoded here.
 */
export interface Conflict {
  id: string;
  message: string;
  keys: string[];
}

/** Deep-clone a visibility profile so shipped constants stay immutable. */
export function cloneVisibility(v: VisibilityProfile): VisibilityProfile {
  const settings: Record<string, VisibilitySetting> = {};
  for (const [k, s] of Object.entries(v.settings)) {
    settings[k] = {
      state: s.state,
      allowed_options: s.allowed_options ? [...s.allowed_options] : undefined,
    };
  }
  return { ...v, settings };
}
