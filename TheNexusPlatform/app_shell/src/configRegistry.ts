/**
 * Demo config source. Stands in for the Nexus config store:
 *  - the JSON files are the "seeded" configs,
 *  - the admin editor saves drafts / published versions to localStorage,
 *    which override the files — so an edit in /editor shows up when you boot
 *    the app, exactly like publish-then-launch will work against Nexus.
 * Every config is validated before use, like the real pipeline.
 */
import { validateAppShellConfig, type AppShellConfig } from "@laic/app-shell";

import brainbee from "./configs/brainbee.json";
import mindaib from "./configs/mindaib.json";
import bridgecoach from "./configs/bridgecoach.json";

const REGISTRY: Record<string, unknown> = { brainbee, mindaib, bridgecoach };

export const KNOWN_SLUGS = Object.keys(REGISTRY);

const draftKey = (slug: string) => `laic_shell.cfgdraft.${slug}`;

function readOverride(slug: string): AppShellConfig | null {
  const raw = localStorage.getItem(draftKey(slug));
  if (!raw) return null;
  try {
    const v = validateAppShellConfig(JSON.parse(raw));
    return v.ok ? v.config : null; // a corrupt draft falls back to the file
  } catch {
    return null;
  }
}

/** What the running app boots from: editor override first, else the seed file. */
export async function getPublicConfig(slug: string): Promise<AppShellConfig> {
  const override = readOverride(slug);
  if (override) return override;
  const raw = REGISTRY[slug];
  if (!raw) throw new Error(`Unknown app "${slug}". Known: ${KNOWN_SLUGS.join(", ")}`);
  const v = validateAppShellConfig(raw);
  if (!v.ok) throw new Error(`Config for "${slug}" failed validation:\n${v.errors.join("\n")}`);
  return v.config;
}

// ── Editor-side accessors ────────────────────────────────────────────────────

/** Load for editing: local draft if present, else the seed file. */
export function loadEditableConfig(slug: string): AppShellConfig {
  const override = readOverride(slug);
  if (override) return override;
  const v = validateAppShellConfig(REGISTRY[slug]);
  if (!v.ok) throw new Error(`Seed config for "${slug}" is invalid`);
  return v.config;
}

/** Validate + persist. Returns error list (empty = saved). */
export function saveConfig(config: AppShellConfig): string[] {
  const v = validateAppShellConfig(config);
  if (!v.ok) return v.errors;
  localStorage.setItem(draftKey(config.slug), JSON.stringify(v.config));
  return [];
}

export function hasLocalEdits(slug: string): boolean {
  return localStorage.getItem(draftKey(slug)) !== null;
}

/** Drop local edits and go back to the seed file. */
export function discardLocalEdits(slug: string): void {
  localStorage.removeItem(draftKey(slug));
}
