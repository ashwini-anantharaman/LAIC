/**
 * API base URL for fetch calls.
 * - Production (student app on Vercel): same-origin `/api` via vercel.json rewrites
 * - Local dev: http://localhost:8000 unless VITE_API_URL is set
 * - Platform app (separate Vercel project): set VITE_API_URL to the student/API deployment URL
 */
function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv !== undefined && fromEnv !== "") {
    const url = fromEnv.replace(/\/$/, "");
    // Misconfigured Vercel env sometimes bakes in localhost — ignore in production.
    if (import.meta.env.PROD && isLocalhostUrl(url)) {
      return "";
    }
    return url;
  }

  if (import.meta.env.PROD) {
    return "";
  }

  if (typeof window !== "undefined" && !isLocalhostUrl(window.location.hostname)) {
    return "";
  }

  return "http://localhost:8000";
}

export function useBackendApi(): boolean {
  if (import.meta.env.PROD) return true;
  if (typeof window !== "undefined" && !isLocalhostUrl(window.location.hostname)) {
    return true;
  }
  return Boolean(import.meta.env.VITE_API_URL ?? "http://localhost:8000");
}
