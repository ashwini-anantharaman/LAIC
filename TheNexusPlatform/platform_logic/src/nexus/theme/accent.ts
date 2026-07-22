/**
 * Accent color helpers. An org stores one accent hue; we render a
 * mode-appropriate lightness of it — a lighter shade in light mode, a darker
 * shade in dark mode — so the same brand color reads well against both
 * backgrounds. Picking a color in one mode and switching themes auto-derives
 * the counterpart (see AppShell.accentVars and OrgSettings).
 */

// Each mode's accent lives in a narrow lightness/saturation band: light mode
// gets pastels (high L, soft S), dark mode gets the same hue as a deeper,
// richer color. Hue is unconstrained — the range of *colors* stays wide, only
// how light/saturated they render is pinned to complement each theme.
const LIGHT_L: [number, number] = [68, 80];
const LIGHT_S: [number, number] = [38, 62];
const DARK_L: [number, number] = [34, 46];
const DARK_S: [number, number] = [42, 72];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Re-light `hex` into the band that complements the given mode, preserving
 * hue. Light mode → pastel (soft, airy); dark mode → the same hue as a deeper,
 * richer color. Any hue is allowed; lightness/saturation are what get pinned.
 */
export function accentForMode(hex: string, dark: boolean): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(...rgb);
  const [lLo, lHi] = dark ? DARK_L : LIGHT_L;
  const [sLo, sHi] = dark ? DARK_S : LIGHT_S;
  return hslToHex(h, clamp(s, sLo, sHi), clamp(l, lLo, lHi));
}

/** The hue (0–360) of a hex color — drives the one-dimensional picker. */
export function hueOf(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 231; // indigo default
  return Math.round(rgbToHsl(...rgb)[0]);
}

/** A canonical hex for a hue — lightness/saturation are mode-derived later
 * (accentForMode), so the stored color only really carries the hue. */
export function hexFromHue(hue: number): string {
  return hslToHex(((hue % 360) + 360) % 360, 60, 62);
}
