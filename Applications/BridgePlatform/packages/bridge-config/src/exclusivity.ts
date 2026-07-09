import type { Setting } from "./types";

// Mutual-exclusivity groups, ported from the prototype but parameterized over
// the setting registry (definitions arrive from published packages). Within a
// single `single_select` the radio control already enforces exclusivity; the
// meaningful case is a group spanning multiple keys — setting one member
// resets the others so they never assert conflicting meanings.

/** Map of exclusive_group id -> the setting keys in it. */
export function exclusiveGroups(settings: readonly Setting[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const s of settings) {
    if (!s.exclusive_group) continue;
    (groups[s.exclusive_group] ??= []).push(s.key);
  }
  return groups;
}

/**
 * Given a key that was just set, return sibling keys in the same multi-key
 * exclusive group that should be reset to their defaults.
 */
export function siblingsToReset(
  settings: readonly Setting[],
  changedKey: string,
): string[] {
  const setting = settings.find((s) => s.key === changedKey);
  if (!setting?.exclusive_group) return [];
  const members = exclusiveGroups(settings)[setting.exclusive_group] ?? [];
  if (members.length <= 1) return [];
  return members.filter((k) => k !== changedKey);
}
