/**
 * Build packaging (browser side).
 *
 * "Publish → Download build package" freezes the current config into a single
 * JSON the native pipeline consumes: a build manifest (identity, bundle IDs,
 * theme, runtime template), the full config, and generated PNG assets. The
 * Node generator (scripts/package-app.mjs) expands it into a Capacitor-ready
 * build folder. This is the honest bridge from the browser Studio to a real
 * native build — the browser can't compile a binary, but it can produce the
 * exact, frozen input a build needs.
 */
import type { AppCategory, AppShellConfig } from "./types";
import { generateIconDataUrl, generateSplashDataUrl } from "./pwa";

export const BUILD_SCHEMA = 1;
export const APP_VERSION = "1.0.0";

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "app";
}

export function bundleIdFor(name: string): string {
  const seg = slugify(name).replace(/-/g, "");
  return `org.laic.${seg || "app"}`;
}

const RUNTIME_TEMPLATE: Record<AppCategory, string> = {
  learning: "learning-app",
  bridge: "bridge-app",
  activity: "general-app",
};

export interface BuildManifest {
  schema: number;
  appId: string;
  slug: string;
  version: string;
  generatedAt: string;
  displayName: string;
  shortName: string;
  bundleId: string;
  packageName: string;
  runtimeTemplate: string;
  environment: "production";
  theme: { primaryColor: string; onAccent: string; backgroundColor: string };
}

export function buildManifest(config: AppShellConfig, generatedAt: string): BuildManifest {
  const slug = slugify(config.name);
  const bundleId = bundleIdFor(config.name);
  return {
    schema: BUILD_SCHEMA,
    appId: config.id,
    slug,
    version: APP_VERSION,
    generatedAt,
    displayName: config.name || "App",
    shortName: (config.name || "App").slice(0, 12),
    bundleId,
    packageName: bundleId,
    runtimeTemplate: RUNTIME_TEMPLATE[config.category],
    environment: "production",
    theme: {
      primaryColor: config.accentColor,
      onAccent: config.accentForeground,
      backgroundColor: "#f8f8fb",
    },
  };
}

export interface BuildExport {
  kind: "appshell-build";
  manifest: BuildManifest;
  config: AppShellConfig;
  /** filename → base64 PNG (no data-URL prefix). */
  icons: Record<string, string>;
}

const stripDataUrl = (d: string) => d.replace(/^data:image\/png;base64,/, "");

export async function buildExport(config: AppShellConfig): Promise<BuildExport> {
  // generatedAt is passed in from the caller in real code paths; here we stamp
  // at call time (browser only), which is fine for a downloaded artifact.
  const generatedAt = new Date().toISOString();
  const [i192, i512, i180, splash] = await Promise.all([
    generateIconDataUrl(config, 192),
    generateIconDataUrl(config, 512),
    generateIconDataUrl(config, 180),
    generateSplashDataUrl(config, 1024),
  ]);
  return {
    kind: "appshell-build",
    manifest: buildManifest(config, generatedAt),
    config,
    icons: {
      "icon-192.png": stripDataUrl(i192),
      "icon-512.png": stripDataUrl(i512),
      "apple-touch-icon.png": stripDataUrl(i180),
      "splash.png": stripDataUrl(splash),
    },
  };
}

/** Trigger a download of the frozen build package for the Node generator. */
export async function downloadBuildPackage(config: AppShellConfig): Promise<void> {
  const data = await buildExport(config);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `appshell-build.${data.manifest.slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
