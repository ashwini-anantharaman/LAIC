/**
 * Platform admin UI — usually deployed as a second Vercel project.
 * Set VITE_API_URL to your student/API deployment (e.g. https://owlwise-2.vercel.app).
 */
function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv !== undefined && fromEnv !== "") {
    const url = fromEnv.replace(/\/$/, "");
    if (import.meta.env.PROD && isLocalhostUrl(url)) {
      throw new Error("VITE_API_URL points to localhost in production. Set it to your API URL in Vercel.");
    }
    return url;
  }
  if (import.meta.env.PROD) {
    throw new Error("Set VITE_API_URL in Vercel to your API URL (e.g. https://owlwise-2.vercel.app).");
  }
  return "http://localhost:8000";
}
