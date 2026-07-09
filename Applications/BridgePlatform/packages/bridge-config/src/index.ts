/**
 * @bridge/config
 *
 * Setting-registry MECHANICS ported from the bridgebot prototype: dependency
 * gating, mutual exclusivity, and the value/visibility resolution algorithm —
 * all parameterized over a `Setting[]` registry supplied by the caller.
 *
 * Content boundary (execution plan §2, deviation 2): the prototype's setting
 * DEFINITIONS (~160 entries) and conflict rules are content. They re-enter in
 * Phase 3+ as published knowledge packages with source citations; this package
 * never hardcodes them. Convention card model lands in Phase 7.
 */

export { dependencyMet, isDependencyMet } from "./dependencies";
export { exclusiveGroups, siblingsToReset } from "./exclusivity";
export {
  defaultSettingValues,
  resolveAll,
  resolvedValues,
  resolveOptions,
  resolveState,
  resolveValue,
  skillAtOrBelow,
} from "./resolve";
export type {
  BindsTo,
  Conflict,
  ControlType,
  Dependency,
  HcpRange,
  LeadValues,
  Module,
  Option,
  ResolvedSetting,
  Setting,
  SettingDomain,
  SettingValue,
  SkillLevel,
  ValueProfile,
  VisibilityProfile,
  VisibilitySetting,
  VisibilityState,
} from "./types";
export { cloneVisibility } from "./types";
