/**
 * PWA identity for a PUBLISHED app.
 *
 * One deployment serves many apps (by link), so the installable identity is
 * applied at runtime: the Player generates the app's icon from its config and
 * injects a per-app web manifest + apple-touch-icon. Result: "Add to Home
 * Screen" installs the specific app (its name, icon, theme), not the Studio.
 *
 * The same icon generator feeds native packaging (packaging.ts).
 */
import type { AppShellConfig } from "./types";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** A square PNG icon (accent background + logo or initials), as a data URL. */
export async function generateIconDataUrl(config: AppShellConfig, size: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = config.accentColor || "#000";
  ctx.fillRect(0, 0, size, size);

  if (config.logoUrl) {
    try {
      const img = await loadImage(config.logoUrl);
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    } catch {
      /* fall back to a plain accent tile */
    }
  } else {
    ctx.fillStyle = config.accentForeground || "#fff";
    ctx.font = `700 ${Math.round(size * 0.4)}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((config.logoInitials || config.name.slice(0, 2) || "AP").toUpperCase(), size / 2, size / 2 + size * 0.02);
  }
  return canvas.toDataURL("image/png");
}

/** A simple centered-mark splash, as a data URL. */
export async function generateSplashDataUrl(config: AppShellConfig, size = 1024): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = config.accentColor || "#000";
  ctx.fillRect(0, 0, size, size);
  const mark = await generateIconDataUrl(config, Math.round(size * 0.34));
  if (mark) {
    const img = await loadImage(mark);
    const m = Math.round(size * 0.34);
    ctx.drawImage(img, (size - m) / 2, (size - m) / 2, m, m);
  }
  return canvas.toDataURL("image/png");
}

/**
 * Inject a per-app web manifest + apple-touch-icon for the current app, so the
 * page is installable as that app. Returns a cleanup that revokes the blob URL.
 */
export async function applyPlayerManifest(config: AppShellConfig): Promise<() => void> {
  const [icon192, icon512, icon180] = await Promise.all([
    generateIconDataUrl(config, 192),
    generateIconDataUrl(config, 512),
    generateIconDataUrl(config, 180),
  ]);

  const manifest = {
    name: config.name || "App",
    short_name: (config.name || "App").slice(0, 12),
    description: config.tagline,
    start_url: location.href,
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f8fb",
    theme_color: config.accentColor,
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));

  const upsert = (selector: string, make: () => HTMLLinkElement): HTMLLinkElement => {
    let el = document.head.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = make();
      document.head.appendChild(el);
    }
    return el;
  };

  const manifestLink = upsert('link[rel="manifest"]', () => {
    const l = document.createElement("link");
    l.rel = "manifest";
    return l;
  });
  manifestLink.href = blobUrl;

  const appleIcon = upsert('link[rel="apple-touch-icon"]', () => {
    const l = document.createElement("link");
    l.rel = "apple-touch-icon";
    return l;
  });
  appleIcon.href = icon180;

  return () => URL.revokeObjectURL(blobUrl);
}
