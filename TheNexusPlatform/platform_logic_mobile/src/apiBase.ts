/**
 * Mobile org app talks to Nexus through the Vite proxy (`/api` → :8000)
 * so an iPhone on the same Wi‑Fi can use http://<mac-ip>:5181 without
 * needing to reach localhost:8000 directly.
 */
export function getApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
  // Empty / "proxy" → same-origin (Vite proxies /api to the Nexus backend).
  if (!fromEnv || fromEnv === "proxy") return "";
  return fromEnv;
}

export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = getApiBaseUrl();
  return url.startsWith("/") ? `${base}${url}` : url;
}
