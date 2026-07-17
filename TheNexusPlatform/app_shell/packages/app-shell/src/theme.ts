/**
 * Branding → CSS custom properties. The shell's stylesheet consumes ONLY these
 * tokens — no component ever hardcodes an app's color or font. That rule is
 * what lets one runtime render three visually unrelated apps.
 */
import type { AppShellConfig } from "./types";

/**
 * The token map for a config's branding. Usable two ways:
 *  - applyTheme() writes it to :root (a running app),
 *  - editors/previews spread it onto a wrapper element to theme a subtree
 *    without repainting the page around it.
 */
export function brandingToCssVars(config: AppShellConfig): Record<string, string> {
  const b = config.branding;
  return {
    "--c-primary": b.primaryColor || "#333333",
    "--c-secondary": b.secondaryColor || b.primaryColor || "#333333",
    "--c-accent": b.accentColor || b.primaryColor || "#333333",
    "--c-bg": b.backgroundColor || "#f7f5f0",
    "--c-surface": b.surfaceColor || "#ffffff",
    "--c-text": b.textColor || "#1c1a17",
    "--c-muted": b.mutedColor || "#78716c",
    "--font-body": b.fontFamily || "'Public Sans', sans-serif",
    "--font-display": b.displayFontFamily || b.fontFamily || "'Public Sans', sans-serif",
  };
}

export function applyTheme(config: AppShellConfig): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandingToCssVars(config))) root.style.setProperty(k, v);
  root.dataset.scheme = config.branding.scheme || "light";
  document.title = config.identity.displayName;
}
